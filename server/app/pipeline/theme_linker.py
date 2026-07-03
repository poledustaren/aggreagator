"""ThemeLinker — инкрементальное ведение дерева тематик над процессами.

Паттерн как у process_linker, но по СМЫСЛУ (а не времени): каждый НОВЫЙ процесс
(ещё без theme_id) относим к теме:
  1. RAG: ближайшие существующие темы по centroid (cosine).
  2. LLM решает: attach к существующей теме/подтеме ИЛИ создать новую (с именем и,
     опционально, родителем — подтема). Учитываются заголовок/summary/теги процесса.
  3. Сохраняем process.theme_id, обновляем centroid темы (бегущее среднее) и
     last_activity_at по всей цепочке предков.

Выводы ПЕРСИСТЯТСЯ — при следующем открытии ничего не регенерится, только дополняется.
Глубина дерева ограничена 4 уровнями (depth 0..3).
"""
from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.models.entities import Item, Process, Theme
from app.pipeline.llm_provider import LLMProvider, parse_json_object

logger = logging.getLogger(__name__)

MAX_DEPTH = 3  # 4 уровня: depth 0..3

_SYSTEM = """Ты ведёшь дерево ТЕМАТИК пользователя (категории/подкатегории его дел).
Тебе дают ОДИН процесс (тема/проблема во времени) и список существующих тем-кандидатов
(с их путём и похожестью). Реши, куда его отнести:
- если процесс по смыслу входит в существующую тему/подтему — attach к ней;
- если это новая тема — создай её с коротким осмысленным названием (2-4 слова),
  при необходимости вложи её в подходящую существующую тему как подтему (parent).

Не плоди дубли: при сомнении — attach к ближайшей подходящей. Названия тем — существительные,
без «уведомление/сообщение». Отвечай СТРОГО одним JSON:
{"action":"attach","theme":<индекс>}  ИЛИ
{"action":"new","name":"<название темы>","parent":<индекс существующей темы или null>}"""


def _merge_centroid(old: list[float] | None, new: list[float], n: int) -> list[float]:
    """Бегущее среднее centroid: (old*n + new)/(n+1)."""
    if old is None or n <= 0:
        return list(new)
    return [(o * n + x) / (n + 1) for o, x in zip(old, new)]


class ThemeLinker:
    def __init__(self, llm: LLMProvider | None, settings: Settings) -> None:
        self._llm = llm
        self._s = settings

    def _model(self) -> str:
        provider = (self._s.llm_provider or "").lower()
        return self._s.ollama_model_hard if provider == "ollama" else self._s.llm_model_hard

    async def touch(self, db: AsyncSession, theme_id: uuid.UUID, now: datetime | None = None) -> None:
        """Обновить last_activity_at темы и всех её предков (для сортировки «по новизне»)."""
        now = now or datetime.now(UTC)
        seen: set[uuid.UUID] = set()
        cur: uuid.UUID | None = theme_id
        while cur and cur not in seen:
            seen.add(cur)
            theme = await db.get(Theme, cur)
            if theme is None:
                break
            theme.last_activity_at = now
            cur = theme.parent_id

    async def assign(self, db: AsyncSession, proc: Process, now: datetime | None = None) -> None:
        """Назначить тему процессу без темы. Best-effort — не ломает пайплайн."""
        if proc.centroid is None:
            return
        now = now or datetime.now(UTC)
        emb = list(proc.centroid)

        candidates = await self._retrieve(db, emb)
        tags = await self._proc_tags(db, proc.id)
        decision = await self._decide(proc, tags, candidates)
        await self._apply(db, proc, emb, decision, candidates, now)

    async def _retrieve(self, db: AsyncSession, emb: list[float]) -> list[Theme]:
        dist = Theme.centroid.cosine_distance(emb)
        stmt = (
            select(Theme, dist.label("d"))
            .where(Theme.centroid.is_not(None))
            .order_by(dist)
            .limit(self._s.process_link_top_k)
        )
        rows = (await db.execute(stmt)).all()
        return [t for t, _ in rows]

    async def _proc_tags(self, db: AsyncSession, process_id: uuid.UUID) -> list[str]:
        # Топ-теги процесса (по частоте среди его items) — подсказка для LLM.
        tag = func.unnest(Item.tags).label("tag")
        sub = select(tag).where(Item.process_id == process_id).subquery()
        stmt = select(sub.c.tag, func.count().label("c")).group_by(sub.c.tag).order_by(func.count().desc()).limit(8)
        return [r[0] for r in (await db.execute(stmt)).all()]

    async def _path(self, db: AsyncSession, theme: Theme) -> str:
        names = [theme.name]
        cur = theme.parent_id
        seen: set[uuid.UUID] = {theme.id}
        while cur and cur not in seen:
            seen.add(cur)
            parent = await db.get(Theme, cur)
            if parent is None:
                break
            names.append(parent.name)
            cur = parent.parent_id
        return " / ".join(reversed(names))

    async def _decide(self, proc: Process, tags: list[str], candidates: list[Theme]) -> dict:
        # Нет LLM: эвристика — attach к ближайшей (первой) или новая тема из title.
        if self._llm is None:
            if candidates:
                return {"action": "attach", "theme": 0}
            return {"action": "new", "name": (proc.title or "Разное")[:40], "parent": None}

        cand_lines = []
        for i, t in enumerate(candidates):
            cand_lines.append(f"  [{i}] {t.name} (глубина {t.depth})")
        prompt = (
            "ПРОЦЕСС:\n"
            f"  название: {proc.title}\n"
            f"  суть: {(proc.summary or '')[:200]}\n"
            f"  теги: {', '.join(tags) if tags else '-'}\n\n"
            "СУЩЕСТВУЮЩИЕ ТЕМЫ-КАНДИДАТЫ:\n"
            + ("\n".join(cand_lines) if cand_lines else "  (тем ещё нет — создай первую)")
            + "\n"
        )
        try:
            text = await self._llm.complete(
                model=self._model(), system=_SYSTEM, prompt=prompt, max_tokens=self._s.llm_max_tokens
            )
            data = parse_json_object(text)
        except Exception:
            logger.exception("LLM-решение по теме не удалось — фолбэк к эвристике")
            data = {}
        if not data:
            if candidates:
                return {"action": "attach", "theme": 0}
            return {"action": "new", "name": (proc.title or "Разное")[:40], "parent": None}
        return data

    async def _apply(
        self,
        db: AsyncSession,
        proc: Process,
        emb: list[float],
        decision: dict,
        candidates: list[Theme],
        now: datetime,
    ) -> None:
        action = "attach" if str(decision.get("action")) == "attach" else "new"

        if action == "attach":
            idx = decision.get("theme")
            theme = candidates[idx] if isinstance(idx, int) and 0 <= idx < len(candidates) else None
            if theme is not None:
                await self._attach(db, proc, theme, emb, now)
                return
            action = "new"  # невалидный индекс → создаём

        # new
        parent: Theme | None = None
        pidx = decision.get("parent")
        if isinstance(pidx, int) and 0 <= pidx < len(candidates):
            parent = candidates[pidx]
        # Контроль глубины: слишком глубоко → крепим к родителю, а не создаём уровень ниже.
        if parent is not None and parent.depth >= MAX_DEPTH:
            await self._attach(db, proc, parent, emb, now)
            return

        name = str(decision.get("name") or proc.title or "Разное").strip()[:60]
        theme = Theme(
            name=name,
            parent_id=parent.id if parent else None,
            depth=(parent.depth + 1) if parent else 0,
            summary=proc.summary,
            centroid=emb,
            member_count=1,
            last_activity_at=now,
        )
        db.add(theme)
        await db.flush()
        proc.theme_id = theme.id
        if parent is not None:
            await self.touch(db, parent.id, now)

    async def _attach(self, db: AsyncSession, proc: Process, theme: Theme, emb: list[float], now: datetime) -> None:
        theme.centroid = _merge_centroid(list(theme.centroid) if theme.centroid is not None else None, emb, theme.member_count)
        theme.member_count += 1
        theme.last_activity_at = now
        proc.theme_id = theme.id
        if theme.parent_id is not None:
            await self.touch(db, theme.parent_id, now)
