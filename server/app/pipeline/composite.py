"""CompositeClassifier — сборка слоёв классификации (Фаза 2b).

Реализует протокол Classifier (см. classifier.py) и связывает два слоя:
  1. RulesEngine — детерминированные правила. Уверенное правило (confident=true)
     завершает классификацию без LLM (бесплатно, предсказуемо).
  2. LLMRouter   — вызывается, если уверенного правила не нашлось; правила при
     этом передаются как подсказки (частичное совпадение уточняет решение LLM).

Если LLM не сконфигурирован (llm_provider="none" → router=None):
  * сработали правила → результат по правилам (classified_by=rules);
  * ничего не сработало → нейтральный результат (importance=0, classified_by=None),
    аналог прежнего Passthrough — чтобы лента продолжала наполняться.

Классификатор НЕ пишет в БД — это делает runner.py.
"""
from __future__ import annotations

import uuid

from app.pipeline.classifier import ClassificationResult, ClassifyContext, RawNotificationData
from app.pipeline.llm_router import LLMRouter, _heuristic_group_key
from app.pipeline.rules_engine import RulesEngine, RulesOutcome
from app.schemas.common import ClassifiedBy

# Важность по умолчанию для уверенного правила, если оно не задало set_importance.
_DEFAULT_RULE_IMPORTANCE = 50


class CompositeClassifier:
    """Правила → (при необходимости) LLM. Реализует протокол Classifier."""

    def __init__(self, rules_engine: RulesEngine, llm_router: LLMRouter | None = None) -> None:
        self._rules = rules_engine
        self._llm = llm_router

    async def classify(self, raw: RawNotificationData, ctx: ClassifyContext) -> ClassificationResult:
        outcome = self._rules.apply(raw, ctx)

        # 1. Уверенное правило — финал без LLM.
        if outcome.confident:
            return self._result_from_rules(raw, outcome)

        # 2. LLM отключён — работаем на том, что есть.
        if self._llm is None:
            if outcome.matched_any:
                return self._result_from_rules(raw, outcome)
            return self._neutral(raw)

        # 3. Эскалация в LLM с подсказками от правил.
        return await self._llm.classify(raw, ctx, hints=outcome)

    def _result_from_rules(self, raw: RawNotificationData, outcome: RulesOutcome) -> ClassificationResult:
        importance = outcome.importance if outcome.importance is not None else _DEFAULT_RULE_IMPORTANCE
        model = "rule:" + ",".join(outcome.matched_rule_ids) if outcome.matched_rule_ids else "rules"
        return ClassificationResult(
            title=raw.title or raw.app_label or raw.source_app,
            summary=raw.text,
            importance=importance,
            suggested_action=None,
            area_id=outcome.area_id,
            project_id=outcome.project_id,
            tags=list(outcome.tags),
            group_key=self._group_key(raw, outcome),
            group_title=raw.app_label or raw.source_app,
            classified_by=ClassifiedBy.rules,
            confidence=1.0,  # правила детерминированы
            model=model,
            raw_output={"matched_rule_ids": outcome.matched_rule_ids},
        )

    def _neutral(self, raw: RawNotificationData) -> ClassificationResult:
        return ClassificationResult(
            title=raw.title or raw.app_label or raw.source_app,
            summary=raw.text,
            importance=0,
            suggested_action=None,
            area_id=None,
            project_id=None,
            tags=[],
            group_key=_heuristic_group_key(raw),
            group_title=raw.app_label or raw.source_app,
            classified_by=None,
            confidence=None,
            model="neutral",
            raw_output=None,
        )

    @staticmethod
    def _group_key(raw: RawNotificationData, outcome: RulesOutcome) -> str:
        """Правила без явной группировки: привязываем тред к проекту/зоне, иначе app+день."""
        if outcome.project_id is not None:
            return f"project:{outcome.project_id}"
        if outcome.area_id is not None:
            return f"area:{outcome.area_id}:{raw.source_app}"
        return _heuristic_group_key(raw)
