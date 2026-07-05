"""RelationFinder — поиск связей между процессами окна (раздел «Связи»).

Темами процессов занимается НЕ этот модуль: они уже персистятся theme_linker'ом
(process.theme_id) и читаются графом напрямую из БД. Здесь — только рёбра:

  1. Кандидаты — пары процессов с близкими centroid'ами (косинус ≥ порога). Дёшево,
     сужает пространство и снимает зависимость от общего числа процессов.
  2. LLM обосновывает связи ТОЛЬКО по этим парам, ПАЧКАМИ и параллельно: каждая пара
     самодостаточна (пара + причина), поэтому батчинг ничего не теряет. Так число
     процессов больше не упирается в потолок одного промпта.

Считается на лету при запросе окна — ничего не персистится.
"""
from __future__ import annotations

import asyncio
import logging
import math
import uuid
from dataclasses import dataclass

from app.config import Settings
from app.pipeline.llm_provider import LLMProvider, parse_json_object

logger = logging.getLogger(__name__)

_SYSTEM_EDGES = """Тебе дают список «процессов» пользователя (темы/проблемы во времени),
пронумерованных индексами [0], [1], …, и пары-кандидаты, похожие по смыслу. Для КАЖДОЙ
пары реши, есть ли между процессами реальная связь. Если да — определи тип и обоснуй;
если связи нет — просто НЕ включай пару в ответ.
Тип связи (relation): same_entity (об одном человеке/сервисе/счёте), causal (одно вызвало
другое), follow_up (продолжение/следующий шаг), same_project (один проект/задача), related (иное).
Ссылайся на процессы ТОЛЬКО по их числовому индексу. Отвечай СТРОГО одним JSON:
{"edges":[{"source":0,"target":3,"relation":"<тип>","reason":"<почему>","confidence":0.7}]}"""

# Пар на один LLM-вызов. Пары независимы, поэтому батчи гоним параллельно, но:
#  - батч мелкий: glm-5.2 — reasoning-модель, на крупном промпте reasoning съедает
#    num_predict и ответ приходит пустым (raw_len=0);
#  - параллелизм ограничен семафором — ollama.com throttлит одновременные запросы.
_PAIRS_PER_BATCH = 18
_MAX_CONCURRENCY = 3
_BATCH_MAX_TOKENS = 4096


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


def _to_index(v, n: int) -> int | None:
    """Индекс процесса из ответа модели (int или строка-цифра), в пределах [0, n)."""
    try:
        i = int(v)
    except (ValueError, TypeError):
        return None
    return i if 0 <= i < n else None


class RelationFinder:
    def __init__(self, llm: LLMProvider, settings: Settings) -> None:
        self._llm = llm
        self._s = settings

    def _model(self) -> str:
        provider = (self._s.llm_provider or "").lower()
        return self._s.ollama_model_hard if provider == "ollama" else self._s.llm_model_hard

    def candidate_pairs(self, procs: list[ProcInfo], threshold: float = 0.45, cap: int | None = None) -> list[tuple]:
        """Пары (i, j, sim) с косинусом centroid'ов ≥ threshold, топ-cap по убыванию."""
        if cap is None:
            cap = self._s.graph_max_edge_pairs
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

    async def find_edges(self, procs: list[ProcInfo], pairs: list[tuple]) -> list[dict]:
        """Обосновать связи по парам-кандидатам. Пачками и параллельно; результат — список
        рёбер {source,target(id-строки), relation, reason, confidence}, без дублей."""
        if len(procs) < 2 or not pairs:
            return []

        batches = [pairs[i:i + _PAIRS_PER_BATCH] for i in range(0, len(pairs), _PAIRS_PER_BATCH)]
        sem = asyncio.Semaphore(_MAX_CONCURRENCY)

        async def _run(b):
            async with sem:
                return await self._edges_batch(procs, b)

        results = await asyncio.gather(*(_run(b) for b in batches), return_exceptions=True)

        out: list[dict] = []
        seen: set[tuple[str, str]] = set()
        for r in results:
            if isinstance(r, BaseException):
                logger.warning("Связи: батч рёбер упал: %r", r)
                continue
            for e in r:
                key = tuple(sorted((e["source"], e["target"])))
                if key in seen:
                    continue
                seen.add(key)
                out.append(e)
        return out

    async def _edges_batch(self, procs: list[ProcInfo], batch_pairs: list[tuple]) -> list[dict]:
        # Локальная нумерация только вовлечённых процессов — промпт компактный,
        # индексы стабильны внутри батча.
        involved = sorted({i for pr in batch_pairs for i in (pr[0], pr[1])})
        local = {gi: li for li, gi in enumerate(involved)}
        proc_lines = [
            f"  [{local[gi]}] {(procs[gi].title or '')[:70]} | {(procs[gi].summary or '')[:90]}" for gi in involved
        ]
        pair_lines = [f"  [{local[i]}] ~ [{local[j]}] (sim={sim:.2f})" for i, j, sim in batch_pairs]
        prompt = (
            "ПРОЦЕССЫ:\n" + "\n".join(proc_lines) + "\n\n"
            "ПАРЫ-КАНДИДАТЫ (похожи по смыслу):\n" + "\n".join(pair_lines) + "\n"
        )

        text = await self._llm.complete(model=self._model(), system=_SYSTEM_EDGES, prompt=prompt, max_tokens=_BATCH_MAX_TOKENS)
        if not (text or "").strip():
            # Пустой ответ (reasoning съел бюджет / троттлинг) — один ретрай.
            text = await self._llm.complete(model=self._model(), system=_SYSTEM_EDGES, prompt=prompt, max_tokens=_BATCH_MAX_TOKENS)
        data = parse_json_object(text)

        edges: list[dict] = []
        seen: set[tuple[int, int]] = set()
        n_local = len(involved)
        for e in data.get("edges") or []:
            if not isinstance(e, dict):
                continue
            si = _to_index(e.get("source"), n_local)
            ti = _to_index(e.get("target"), n_local)
            if si is None or ti is None or si == ti:
                continue
            gi, gj = involved[si], involved[ti]
            key = tuple(sorted((gi, gj)))
            if key in seen:
                continue
            seen.add(key)
            try:
                conf = max(0.0, min(1.0, float(e.get("confidence", 0.5))))
            except (ValueError, TypeError):
                conf = 0.5
            edges.append(
                {
                    "source": str(procs[gi].id),
                    "target": str(procs[gj].id),
                    "relation": str(e.get("relation") or "related")[:32],
                    "reason": str(e.get("reason") or "")[:300],
                    "confidence": conf,
                }
            )
        return edges
