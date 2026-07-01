"""ProcessLinker — привязка Item к процессу через RAG (Фаза процессов).

Вызывается в раннере ПОСЛЕ классификации, когда Item уже создан и получил id.
В отличие от классификатора, линкер ПИШЕТ в БД (создаёт/обновляет process).

Поток:
  1. Эмбеддим текст Item → item.embedding.
  2. RAG: cosine-поиск кандидатов среди процессов open/frozen в окне недавности.
  3. Решение (LLM или эвристика): attach к процессу / new процесс + флаг ended.
  4. Применение: обновить/создать process, пересчитать centroid, обновить lifecycle
     (frozen→open при оживлении, →closed при явном признаке завершения).

Весь слой best-effort: любая ошибка эмбеддера/LLM логируется и НЕ ломает ingest —
Item просто останется без процесса (process_id=NULL).
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.models import Item, Process, ProcessStatus
from app.pipeline.embeddings import EmbeddingProvider
from app.pipeline.llm_provider import LLMProvider, parse_json_object

logger = logging.getLogger(__name__)


@dataclass
class _Candidate:
    process: Process
    similarity: float


@dataclass
class _Decision:
    action: str            # "attach" | "new"
    process_id: uuid.UUID | None
    ended: bool
    title: str | None
    summary: str | None


_SYSTEM = """Ты связываешь входящее уведомление с «процессами» — темами/проблемами
пользователя, которые тянутся во времени (могут длиться дни). Тебе дают уведомление
и список кандидатов-процессов (уже похожих по смыслу). Реши:
- принадлежит ли уведомление одному из кандидатов (attach) или это НОВЫЙ процесс (new);
- есть ли в уведомлении ЯВНЫЙ признак, что процесс завершён (оплачено/доставлено/решено/
  закрыто/отменено) — тогда ended=true.

Отвечай строго одним JSON:
{"action":"attach"|"new","process_id":"<id кандидата или null>","ended":true|false,
 "title":"<краткое имя процесса>","summary":"<1 предложение о сути>"}
Будь консервативен: attach только при явной смысловой связи, иначе new."""


class ProcessLinker:
    def __init__(self, embedder: EmbeddingProvider, llm: LLMProvider | None, settings: Settings) -> None:
        self._embedder = embedder
        self._llm = llm
        self._s = settings

    async def link(self, db: AsyncSession, item: Item, event_time: datetime | None = None) -> None:
        """Привязать Item к процессу.

        event_time — момент события (для бэкфилла передаём item.created_at, чтобы
        started_at/last_activity_at процессов и окно недавности кандидатов брались
        по времени уведомления, а не по wall-clock. По умолчанию — now()).
        """
        text = "\n".join(p for p in (item.title, item.summary) if p).strip()
        if not text:
            return
        try:
            emb = await self._embedder.embed(text)
        except Exception:
            logger.exception("Эмбеддинг не удался — Item %s останется без процесса", item.id)
            return

        now = event_time or datetime.now(UTC)
        item.embedding = emb
        candidates = await self._retrieve(db, emb, item, now)
        decision = await self._decide(item, candidates)
        await self._apply(db, item, emb, decision, candidates, now)

    async def _retrieve(self, db: AsyncSession, emb: list[float], item: Item, now: datetime) -> list[_Candidate]:
        """Кандидаты: процессы open/frozen с centroid, в окне недавности, ближайшие по cosine."""
        recency = now - _days(self._s.process_recency_days)
        distance = Process.centroid.cosine_distance(emb)
        stmt = (
            select(Process, distance.label("dist"))
            .where(
                Process.status.in_([ProcessStatus.open, ProcessStatus.frozen]),
                Process.centroid.is_not(None),
                Process.last_activity_at >= recency,
            )
            .order_by(distance)
            .limit(self._s.process_link_top_k)
        )
        rows = (await db.execute(stmt)).all()
        # cosine_distance ∈ [0,2]; similarity = 1 - distance.
        return [_Candidate(process=p, similarity=1.0 - float(d)) for p, d in rows]

    async def _decide(self, item: Item, candidates: list[_Candidate]) -> _Decision:
        if not candidates:
            return _Decision("new", None, False, item.title, item.summary)

        if self._llm is None:
            # Эвристика без LLM: attach к лучшему, если похоже достаточно; ended не детектим.
            best = candidates[0]
            if best.similarity >= self._s.process_link_sim_threshold:
                return _Decision("attach", best.process.id, False, None, None)
            return _Decision("new", None, False, item.title, item.summary)

        prompt = _build_prompt(item, candidates)
        try:
            text = await self._llm.complete(
                model=_model_for(self._s), system=_SYSTEM, prompt=prompt, max_tokens=self._s.llm_max_tokens
            )
            data = parse_json_object(text)
        except Exception:
            logger.exception("LLM-решение по процессу не удалось — фолбэк к эвристике")
            data = {}

        if not data:
            best = candidates[0]
            if best.similarity >= self._s.process_link_sim_threshold:
                return _Decision("attach", best.process.id, False, None, None)
            return _Decision("new", None, False, item.title, item.summary)

        action = "attach" if str(data.get("action")) == "attach" else "new"
        ended = bool(data.get("ended"))
        pid = _valid_candidate_id(data.get("process_id"), candidates)
        if action == "attach" and pid is None:
            action = "new"  # модель сказала attach, но id невалидный → new
        return _Decision(
            action=action,
            process_id=pid,
            ended=ended,
            title=str(data.get("title") or item.title or ""),
            summary=str(data.get("summary") or item.summary or ""),
        )

    async def _apply(
        self,
        db: AsyncSession,
        item: Item,
        emb: list[float],
        decision: _Decision,
        candidates: list[_Candidate],
        now: datetime,
    ) -> None:
        if decision.action == "attach" and decision.process_id is not None:
            proc = next((c.process for c in candidates if c.process.id == decision.process_id), None)
            if proc is None:
                proc = await db.get(Process, decision.process_id)
            if proc is None:
                decision.action = "new"  # исчез между запросами — создаём новый
            else:
                proc.centroid = _merge_centroid(proc.centroid, emb, proc.item_count)
                proc.item_count += 1
                proc.last_activity_at = now
                if proc.status == ProcessStatus.frozen:
                    proc.status = ProcessStatus.open  # ожил
                    proc.ended_at = None
                if decision.ended:
                    proc.status = ProcessStatus.closed
                    proc.ended_at = now
                item.process_id = proc.id
                return

        # new
        proc = Process(
            title=(decision.title or item.title),
            summary=(decision.summary or item.summary),
            status=ProcessStatus.closed if decision.ended else ProcessStatus.open,
            area_id=item.area_id,
            project_id=item.project_id,
            started_at=now,
            last_activity_at=now,
            ended_at=now if decision.ended else None,
            item_count=1,
            centroid=emb,
        )
        db.add(proc)
        await db.flush()
        item.process_id = proc.id


def _build_prompt(item: Item, candidates: list[_Candidate]) -> str:
    lines = [
        f"  [{i}] id={c.process.id} sim={c.similarity:.2f} "
        f"title={c.process.title!r} last_activity={c.process.last_activity_at:%Y-%m-%d} "
        f"summary={(c.process.summary or '')[:120]!r}"
        for i, c in enumerate(candidates)
    ]
    return (
        "УВЕДОМЛЕНИЕ:\n"
        f"  title: {item.title}\n"
        f"  summary: {item.summary}\n\n"
        "КАНДИДАТЫ-ПРОЦЕССЫ:\n" + "\n".join(lines) + "\n"
    )


def _valid_candidate_id(value: object, candidates: list[_Candidate]) -> uuid.UUID | None:
    if value in (None, "null", ""):
        return None
    try:
        ref = uuid.UUID(str(value))
    except (ValueError, TypeError):
        return None
    return ref if any(c.process.id == ref for c in candidates) else None


def _merge_centroid(old, emb: list[float], count: int) -> list[float]:
    """Инкрементальное среднее: new = (old*count + emb)/(count+1).

    old может быть None или numpy-массивом (pgvector), поэтому проверяем через `is None`
    и len, а не через truthiness (у numpy-массива она неоднозначна).
    """
    if old is None or len(old) == 0 or count <= 0:
        return emb
    return [(float(o) * count + e) / (count + 1) for o, e in zip(old, emb)]


def _model_for(settings: Settings) -> str:
    provider = (settings.llm_provider or "").lower()
    return settings.ollama_model_hard if provider == "ollama" else settings.llm_model_hard


def _days(n: int):
    from datetime import timedelta

    return timedelta(days=n)
