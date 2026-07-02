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
в выбранном промежутке. Процессы пронумерованы индексами [0], [1], … Тебе также дают
пары-кандидаты, похожие по смыслу. Сделай две вещи:
1. Сгруппируй процессы в ТЕМЫ (2-6 тем), каждая — набор индексов процессов.
2. Определи СВЯЗИ между процессами и обоснуй каждую. Тип связи (relation):
   same_entity (об одном человеке/сервисе/счёте), causal (одно вызвало другое),
   follow_up (продолжение/следующий шаг), same_project (один проект/задача), related (иное).
   Для каждой связи дай короткую причину «почему связаны» и уверенность 0..1.

Опирайся на кандидатные пары, но можешь добавить очевидные связи и вне их, а слабые — отбросить.
Ссылайся на процессы ТОЛЬКО по их числовому индексу. Отвечай СТРОГО одним JSON:
{"themes":[{"name":"<тема>","members":[0,3,5]}],
 "edges":[{"source":0,"target":3,"relation":"<тип>","reason":"<почему>","confidence":0.7}]}"""


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
        """Вернуть {"themes": [...], "edges": [...]} по процессам окна (ссылки по индексам)."""
        if len(procs) < 2:
            return {"themes": [], "edges": []}

        pairs = self.candidate_pairs(procs)

        proc_lines = [
            f"  [{i}] {(p.title or '')[:70]} | {(p.summary or '')[:90]}" for i, p in enumerate(procs)
        ]
        pair_lines = [
            f"  [{i}] ~ [{j}] (sim={sim:.2f})" for i, j, sim in pairs
        ] or ["  (нет явных кандидатов — поищи связи сам)"]

        prompt = (
            "ПРОЦЕССЫ В ОКНЕ:\n" + "\n".join(proc_lines) + "\n\n"
            "ПАРЫ-КАНДИДАТЫ (похожи по смыслу):\n" + "\n".join(pair_lines) + "\n"
        )

        try:
            text = await self._llm.complete(
                model=self._model(), system=_SYSTEM, prompt=prompt, max_tokens=4096
            )
        except Exception:
            logger.exception("LLM-анализ связей не удался")
            return {"themes": [], "edges": []}

        data = parse_json_object(text)
        themes = _norm_themes(data.get("themes"), procs)
        edges = _norm_edges(data.get("edges"), procs)
        if not themes and not edges:
            logger.warning("Связи: пустой результат. len(text)=%d snippet=%r", len(text or ""), (text or "")[:300])
        return {"themes": themes, "edges": edges}


def _to_index(v, n: int) -> int | None:
    """Индекс процесса из ответа модели (int или строка-цифра), в пределах [0, n)."""
    try:
        i = int(v)
    except (ValueError, TypeError):
        return None
    return i if 0 <= i < n else None


def _norm_themes(raw, procs: list[ProcInfo]) -> list[dict]:
    n = len(procs)
    out = []
    for t in raw or []:
        if not isinstance(t, dict):
            continue
        members = t.get("members") or t.get("process_ids") or t.get("indices") or []
        ids = []
        for m in members:
            i = _to_index(m, n)
            if i is not None:
                ids.append(str(procs[i].id))
        if ids:
            out.append({"name": str(t.get("name") or "тема")[:80], "process_ids": ids})
    return out


def _norm_edges(raw, procs: list[ProcInfo]) -> list[dict]:
    n = len(procs)
    out = []
    seen = set()
    for e in raw or []:
        if not isinstance(e, dict):
            continue
        si = _to_index(e.get("source"), n)
        ti = _to_index(e.get("target"), n)
        if si is None or ti is None or si == ti:
            continue
        key = tuple(sorted((si, ti)))
        if key in seen:
            continue
        seen.add(key)
        try:
            conf = max(0.0, min(1.0, float(e.get("confidence", 0.5))))
        except (ValueError, TypeError):
            conf = 0.5
        out.append(
            {
                "source": str(procs[si].id),
                "target": str(procs[ti].id),
                "relation": str(e.get("relation") or "related")[:32],
                "reason": str(e.get("reason") or "")[:300],
                "confidence": conf,
            }
        )
    return out
