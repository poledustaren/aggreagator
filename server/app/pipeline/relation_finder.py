"""RelationFinder — поиск связей между процессами в окне (раздел «Связи»).

Двухступенчато:
  1. Кандидаты — пары процессов с близкими centroid'ами (косинус ≥ порога). Дёшево,
     сужает пространство для LLM.
  2. LLM (glm-5.2:cloud) по списку процессов + кандидатным парам: группирует процессы
     в темы (дерево) и обосновывает связи (тип + причина «почему связаны» + уверенность).

Считается на лету при запросе окна — ничего не персистится.
"""
from __future__ import annotations

import logging
import math
import uuid
from dataclasses import dataclass

from app.config import Settings
from app.pipeline.llm_provider import LLMProvider, parse_json_object

logger = logging.getLogger(__name__)

_SYSTEM = """Ты анализируешь «процессы» пользователя (темы/проблемы, тянущиеся во времени)
в выбранном промежутке. Тебе дают список процессов и пары-кандидаты, похожие по смыслу.
Сделай две вещи:
1. Сгруппируй процессы в ТЕМЫ (2-6 тем), каждая — набор process_id.
2. Определи СВЯЗИ между процессами и обоснуй каждую. Тип связи (relation):
   same_entity (об одном человеке/сервисе/счёте), causal (одно вызвало другое),
   follow_up (продолжение/следующий шаг), same_project (один проект/задача), related (иное).
   Для каждой связи дай короткую причину «почему связаны» и уверенность 0..1.

Опирайся на кандидатные пары, но можешь добавить очевидные связи и вне их, а слабые — отбросить.
Отвечай СТРОГО одним JSON:
{"themes":[{"name":"<тема>","process_ids":["<id>",...]}],
 "edges":[{"source":"<id>","target":"<id>","relation":"<тип>","reason":"<почему>","confidence":0.x}]}"""


@dataclass
class ProcInfo:
    id: uuid.UUID
    title: str | None
    summary: str | None
    centroid: list[float] | None


def _cosine(a, b) -> float:
    dot = 0.0
    na = 0.0
    nb = 0.0
    for x, y in zip(a, b):
        x = float(x)
        y = float(y)
        dot += x * y
        na += x * x
        nb += y * y
    if na <= 0 or nb <= 0:
        return 0.0
    return dot / (math.sqrt(na) * math.sqrt(nb))


class RelationFinder:
    def __init__(self, llm: LLMProvider, settings: Settings) -> None:
        self._llm = llm
        self._s = settings

    def _model(self) -> str:
        provider = (self._s.llm_provider or "").lower()
        return self._s.ollama_model_hard if provider == "ollama" else self._s.llm_model_hard

    def candidate_pairs(self, procs: list[ProcInfo], threshold: float = 0.45, cap: int = 80) -> list[tuple]:
        """Пары (i, j, sim) с косинусом centroid'ов ≥ threshold, топ-cap по убыванию."""
        pairs = []
        for i in range(len(procs)):
            ci = procs[i].centroid
            if not ci:
                continue
            for j in range(i + 1, len(procs)):
                cj = procs[j].centroid
                if not cj:
                    continue
                sim = _cosine(ci, cj)
                if sim >= threshold:
                    pairs.append((i, j, sim))
        pairs.sort(key=lambda t: t[2], reverse=True)
        return pairs[:cap]

    async def analyze(self, procs: list[ProcInfo]) -> dict:
        """Вернуть {"themes": [...], "edges": [...]} по процессам окна."""
        if len(procs) < 2:
            return {"themes": [], "edges": []}

        pairs = self.candidate_pairs(procs)
        by_id = {str(p.id): p for p in procs}

        proc_lines = [
            f"  id={p.id} | {(p.title or '')[:70]} | {(p.summary or '')[:100]}" for p in procs
        ]
        pair_lines = [
            f"  {procs[i].id} ~ {procs[j].id} (sim={sim:.2f})" for i, j, sim in pairs
        ] or ["  (нет явных кандидатов — поищи связи сам)"]

        prompt = (
            "ПРОЦЕССЫ В ОКНЕ:\n" + "\n".join(proc_lines) + "\n\n"
            "ПАРЫ-КАНДИДАТЫ (похожи по смыслу):\n" + "\n".join(pair_lines) + "\n"
        )

        try:
            text = await self._llm.complete(
                model=self._model(), system=_SYSTEM, prompt=prompt, max_tokens=2048
            )
        except Exception:
            logger.exception("LLM-анализ связей не удался")
            return {"themes": [], "edges": []}

        data = parse_json_object(text)
        themes = _norm_themes(data.get("themes"), by_id)
        edges = _norm_edges(data.get("edges"), by_id)
        return {"themes": themes, "edges": edges}


def _to_uuid(v) -> uuid.UUID | None:
    try:
        return uuid.UUID(str(v))
    except (ValueError, TypeError):
        return None


def _norm_themes(raw, by_id: dict) -> list[dict]:
    out = []
    for t in raw or []:
        if not isinstance(t, dict):
            continue
        ids = [str(_to_uuid(pid)) for pid in (t.get("process_ids") or []) if _to_uuid(pid) and str(pid) in by_id]
        if ids:
            out.append({"name": str(t.get("name") or "тема")[:80], "process_ids": ids})
    return out


def _norm_edges(raw, by_id: dict) -> list[dict]:
    out = []
    seen = set()
    for e in raw or []:
        if not isinstance(e, dict):
            continue
        s = _to_uuid(e.get("source"))
        tg = _to_uuid(e.get("target"))
        if s is None or tg is None or s == tg:
            continue
        if str(s) not in by_id or str(tg) not in by_id:
            continue
        key = tuple(sorted((str(s), str(tg))))
        if key in seen:
            continue
        seen.add(key)
        try:
            conf = max(0.0, min(1.0, float(e.get("confidence", 0.5))))
        except (ValueError, TypeError):
            conf = 0.5
        out.append(
            {
                "source": str(s),
                "target": str(tg),
                "relation": str(e.get("relation") or "related")[:32],
                "reason": str(e.get("reason") or "")[:300],
                "confidence": conf,
            }
        )
    return out
