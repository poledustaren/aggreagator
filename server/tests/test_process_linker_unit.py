"""DB-free юнит-тесты чистой логики ProcessLinker (решение/centroid/валидация).

RAG-путь с pgvector проверяется отдельно на реальной БД (см. ручную проверку в
истории). Здесь — то, что не требует БД: эвристика attach/new, слияние centroid,
валидация id кандидата, выбор модели. Запуск без Postgres.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest

from app.config import Settings
from app.pipeline.process_linker import (
    ProcessLinker,
    _Candidate,
    _merge_centroid,
    _model_for,
    _valid_candidate_id,
)


class _FakeProc:
    def __init__(self, pid, title="t", summary="s"):
        self.id = pid
        self.title = title
        self.summary = summary
        self.last_activity_at = datetime(2026, 7, 1, tzinfo=UTC)


class _Item:
    title = "hi"
    summary = "world"


def _linker(llm=None, **over):
    return ProcessLinker(embedder=object(), llm=llm, settings=Settings(**over))


async def test_decide_new_when_no_candidates():
    d = await _linker()._decide(_Item(), [])
    assert d.action == "new"


async def test_decide_attach_when_similar_enough():
    pid = uuid.uuid4()
    cands = [_Candidate(process=_FakeProc(pid), similarity=0.9)]
    d = await _linker(process_link_sim_threshold=0.55)._decide(_Item(), cands)
    assert d.action == "attach" and d.process_id == pid


async def test_decide_new_when_below_threshold():
    cands = [_Candidate(process=_FakeProc(uuid.uuid4()), similarity=0.2)]
    d = await _linker(process_link_sim_threshold=0.55)._decide(_Item(), cands)
    assert d.action == "new"


def test_merge_centroid_none_returns_emb():
    emb = [1.0, 2.0, 3.0]
    assert _merge_centroid(None, emb, 0) == emb


def test_merge_centroid_incremental_mean():
    # old=[0,0], count=1, emb=[2,2] → (0*1+2)/2 = 1.0
    assert _merge_centroid([0.0, 0.0], [2.0, 2.0], 1) == [1.0, 1.0]


def test_valid_candidate_id_accepts_known():
    pid = uuid.uuid4()
    cands = [_Candidate(process=_FakeProc(pid), similarity=0.5)]
    assert _valid_candidate_id(str(pid), cands) == pid


def test_valid_candidate_id_rejects_unknown_or_garbage():
    cands = [_Candidate(process=_FakeProc(uuid.uuid4()), similarity=0.5)]
    assert _valid_candidate_id(str(uuid.uuid4()), cands) is None  # не среди кандидатов
    assert _valid_candidate_id("not-a-uuid", cands) is None
    assert _valid_candidate_id(None, cands) is None


def test_model_for_ollama_vs_anthropic():
    assert _model_for(Settings(llm_provider="ollama", ollama_model_hard="glm-5.2:cloud")) == "glm-5.2:cloud"
    assert _model_for(Settings(llm_provider="anthropic", llm_model_hard="claude-opus-4-8")) == "claude-opus-4-8"
