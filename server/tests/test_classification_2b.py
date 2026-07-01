"""Тесты классификационного слоя (Фаза 2b): RulesEngine, LLMRouter, CompositeClassifier.

Полностью изолированы: без БД и без сети. LLM подменяется FakeProvider, поэтому
тесты быстрые и детерминированные. Запускаются без Postgres:
    pytest tests/test_classification_2b.py
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest

from app.config import Settings
from app.pipeline.classifier import ClassifyContext, RawNotificationData
from app.pipeline.composite import CompositeClassifier
from app.pipeline.llm_provider import parse_json_object
from app.pipeline.llm_router import LLMRouter
from app.pipeline.rules_engine import RulesEngine
from app.schemas.common import ClassifiedBy


# ── helpers ────────────────────────────────────────────────────────────────
def make_raw(*, title="", text="", source_app="com.test", category=None, app_label=None):
    return RawNotificationData(
        id=uuid.uuid4(),
        device_id=uuid.uuid4(),
        client_id="c1",
        source_app=source_app,
        app_label=app_label,
        title=title,
        text=text,
        subtext=None,
        category=category,
        posted_at=datetime(2026, 7, 1, 12, 0, tzinfo=UTC),
        extras=None,
    )


def rule(*, match, action, priority=10, rid=None):
    return {"id": rid or str(uuid.uuid4()), "name": "r", "priority": priority, "match": match, "action": action}


class FakeProvider:
    """Фейковый LLMProvider: возвращает заранее заданный ответ, пишет вызванные модели."""

    def __init__(self, response):
        self.response = response
        self.calls: list[str] = []

    async def complete(self, *, model, system, prompt, max_tokens):
        self.calls.append(model)
        if isinstance(self.response, Exception):
            raise self.response
        return self.response


def anthropic_settings(**overrides) -> Settings:
    base = {"llm_provider": "anthropic", "anthropic_api_key": "test-key", "llm_escalation_char_threshold": 280}
    base.update(overrides)
    return Settings(**base)


# ── RulesEngine ─────────────────────────────────────────────────────────────
def test_rules_no_rules_no_match():
    outcome = RulesEngine().apply(make_raw(text="привет"), ClassifyContext())
    assert not outcome.matched_any
    assert not outcome.confident


def test_rules_source_app_confident():
    area = str(uuid.uuid4())
    ctx = ClassifyContext(
        existing_rules=[
            rule(
                match={"source_app": "com.bank"},
                action={"set_area_id": area, "set_importance": 90, "confident": True},
            )
        ],
        known_areas=[{"id": area, "name": "Финансы"}],
    )
    outcome = RulesEngine().apply(make_raw(source_app="com.bank", text="платёж"), ctx)
    assert outcome.matched_any and outcome.confident
    assert str(outcome.area_id) == area
    assert outcome.importance == 90


def test_rules_regex_and_tag_accumulation():
    ctx = ClassifyContext(
        existing_rules=[
            rule(match={"title_regex": "(?i)срочно"}, action={"add_tags": ["urgent"]}, priority=1),
            rule(match={"source_app": "com.test"}, action={"add_tags": ["work"], "set_importance": 200}, priority=2),
        ]
    )
    outcome = RulesEngine().apply(make_raw(title="СРОЧНО прочти", text="..."), ctx)
    assert outcome.matched_any and not outcome.confident
    assert outcome.tags == ["urgent", "work"]
    assert outcome.importance == 100  # 200 клампится в 100


def test_rules_unknown_area_ignored():
    """area_id из правила, которого нет среди известных зон, не проставляется (защита FK)."""
    ctx = ClassifyContext(
        existing_rules=[rule(match={"source_app": "com.test"}, action={"set_area_id": str(uuid.uuid4())})],
        known_areas=[{"id": str(uuid.uuid4()), "name": "Другая"}],
    )
    outcome = RulesEngine().apply(make_raw(), ctx)
    assert outcome.matched_any
    assert outcome.area_id is None


def test_rules_broken_regex_no_crash():
    ctx = ClassifyContext(existing_rules=[rule(match={"title_regex": "("}, action={"add_tags": ["x"]})])
    outcome = RulesEngine().apply(make_raw(title="abc"), ctx)
    assert not outcome.matched_any  # битый regex не срабатывает, но и не падает


# ── CompositeClassifier без LLM ─────────────────────────────────────────────
async def test_composite_no_llm_confident_rule():
    ctx = ClassifyContext(
        existing_rules=[rule(match={"source_app": "com.bank"}, action={"confident": True})]
    )
    clf = CompositeClassifier(RulesEngine(), None)
    res = await clf.classify(make_raw(source_app="com.bank"), ctx)
    assert res.classified_by == ClassifiedBy.rules
    assert res.importance == 50  # дефолт для уверенного правила без set_importance
    assert res.confidence == 1.0


async def test_composite_no_llm_no_match_neutral():
    clf = CompositeClassifier(RulesEngine(), None)
    res = await clf.classify(make_raw(source_app="com.random", text="шум"), ClassifyContext())
    assert res.classified_by is None
    assert res.importance == 0
    assert res.group_key.startswith("com.random:")


async def test_composite_no_llm_matched_non_confident_uses_rules():
    ctx = ClassifyContext(existing_rules=[rule(match={"source_app": "com.test"}, action={"add_tags": ["t"]})])
    clf = CompositeClassifier(RulesEngine(), None)
    res = await clf.classify(make_raw(), ctx)
    assert res.classified_by == ClassifiedBy.rules
    assert res.tags == ["t"]


# ── CompositeClassifier с LLM ───────────────────────────────────────────────
async def test_composite_escalates_to_llm():
    area = str(uuid.uuid4())
    provider = FakeProvider(
        '{"importance": 75, "area_id": "%s", "tags": ["deadline"], '
        '"summary": "Дедлайн проекта", "suggested_action": "Ответить", '
        '"group_key": "proj-x", "group_title": "Проект X", "confidence": 0.8}' % area
    )
    settings = anthropic_settings()
    router = LLMRouter(provider, settings)
    ctx = ClassifyContext(known_areas=[{"id": area, "name": "Работа"}])
    clf = CompositeClassifier(RulesEngine(), router)

    res = await clf.classify(make_raw(title="Задача", text="дедлайн завтра"), ctx)
    assert res.classified_by == ClassifiedBy.llm
    assert res.importance == 75
    assert str(res.area_id) == area
    assert res.tags == ["deadline"]
    assert res.group_key == "proj-x"
    assert res.confidence == 0.8
    assert provider.calls  # LLM реально вызвался


# ── LLMRouter: роутинг моделей ──────────────────────────────────────────────
async def test_router_picks_routine_for_short():
    provider = FakeProvider('{"importance": 10, "summary": "s", "group_key": "g"}')
    settings = anthropic_settings(llm_model_routine="claude-haiku-4-5-20251001", llm_model_hard="claude-opus-4-8")
    await LLMRouter(provider, settings).classify(make_raw(title="hi", text="ok"), ClassifyContext())
    assert provider.calls[-1] == "claude-haiku-4-5-20251001"


async def test_router_escalates_long_text_to_hard():
    provider = FakeProvider('{"importance": 10, "summary": "s", "group_key": "g"}')
    settings = anthropic_settings(llm_escalation_char_threshold=10)
    await LLMRouter(provider, settings).classify(make_raw(text="x" * 50), ClassifyContext())
    assert provider.calls[-1] == "claude-opus-4-8"


async def test_router_ambiguous_hint_escalates_to_hard():
    from app.pipeline.rules_engine import RulesOutcome

    provider = FakeProvider('{"importance": 10, "summary": "s", "group_key": "g"}')
    settings = anthropic_settings()
    hints = RulesOutcome(matched_any=True, confident=False, tags=["x"])
    await LLMRouter(provider, settings).classify(make_raw(title="hi"), ClassifyContext(), hints=hints)
    assert provider.calls[-1] == "claude-opus-4-8"


# ── LLMRouter: устойчивость ────────────────────────────────────────────────
async def test_router_fallback_on_unparseable():
    from app.pipeline.rules_engine import RulesOutcome

    provider = FakeProvider("это не json")
    hints = RulesOutcome(matched_any=True, tags=["kept"], importance=42)
    res = await LLMRouter(provider, anthropic_settings()).classify(make_raw(), ClassifyContext(), hints=hints)
    assert res.classified_by == ClassifiedBy.rules  # откат к правилам
    assert res.tags == ["kept"]
    assert res.importance == 42


async def test_router_fallback_on_exception():
    provider = FakeProvider(RuntimeError("network down"))
    res = await LLMRouter(provider, anthropic_settings()).classify(make_raw(), ClassifyContext())
    assert res.model == "llm-fallback"
    assert res.importance == 0


async def test_router_rejects_hallucinated_area():
    """LLM вернул area_id, которого нет среди известных → игнор, берём подсказку правила."""
    from app.pipeline.rules_engine import RulesOutcome

    hint_area = uuid.uuid4()
    provider = FakeProvider(
        '{"importance": 50, "area_id": "%s", "summary": "s", "group_key": "g"}' % uuid.uuid4()
    )
    ctx = ClassifyContext(known_areas=[{"id": str(hint_area), "name": "Работа"}])
    hints = RulesOutcome(matched_any=True, area_id=hint_area)
    res = await LLMRouter(provider, anthropic_settings()).classify(make_raw(), ctx, hints=hints)
    assert res.area_id == hint_area  # галлюцинация отброшена, подставлена подсказка


# ── parse_json_object ───────────────────────────────────────────────────────
def test_parse_plain_json():
    assert parse_json_object('{"a": 1}') == {"a": 1}


def test_parse_json_with_code_fence():
    assert parse_json_object('```json\n{"a": 1}\n```') == {"a": 1}


def test_parse_json_embedded_in_text():
    assert parse_json_object('Вот ответ: {"a": 1} — готово') == {"a": 1}


def test_parse_json_garbage_returns_empty():
    assert parse_json_object("совсем не json") == {}
