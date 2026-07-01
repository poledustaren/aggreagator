"""RulesEngine — детерминированный слой классификации (Фаза 2b).

Прогоняет RawNotification через пользовательские правила (таблица `rule`,
snapshot передаётся в ClassifyContext.existing_rules уже отсортированным по
priority). Правило состоит из:
  match:  {source_app, title_regex, text_regex, category}  — условия (AND)
  action: {set_area_id, set_project_id, add_tags, set_importance, confident}

Логика применения:
  * Правила применяются по порядку (меньший priority — раньше).
  * Каждое сработавшее правило дополняет исход: area/project/importance
    перезаписываются последним значением, теги аккумулируются.
  * Первое сработавшее правило с action.confident=true ЗАВЕРШАЕТ подбор —
    классификация считается уверенной и LLM не вызывается (экономия).

Движок не пишет в БД и не строит финальный ClassificationResult — он возвращает
компактный RulesOutcome, который CompositeClassifier превращает в результат
(для правил) либо использует как подсказку для LLM (для непонятных случаев).
"""
from __future__ import annotations

import logging
import re
import uuid
from dataclasses import dataclass, field

from app.pipeline.classifier import ClassifyContext, RawNotificationData

logger = logging.getLogger(__name__)


@dataclass
class RulesOutcome:
    """Результат работы RulesEngine над одним уведомлением."""

    matched_any: bool = False
    confident: bool = False
    area_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    importance: int | None = None
    tags: list[str] = field(default_factory=list)
    matched_rule_ids: list[str] = field(default_factory=list)


def _to_uuid(value: object) -> uuid.UUID | None:
    """Безопасно привести строку к UUID; None/мусор → None (защита от FK-нарушений)."""
    if value is None:
        return None
    if isinstance(value, uuid.UUID):
        return value
    try:
        return uuid.UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        return None


def _regex_search(pattern: str, value: str | None) -> bool:
    """re.search с защитой от кривого паттерна (битый regex → правило не срабатывает)."""
    try:
        return re.search(pattern, value or "") is not None
    except re.error:
        logger.warning("Некорректный regex в правиле: %r", pattern)
        return False


class RulesEngine:
    """Слой правил. Не зависит от БД — работает над ClassifyContext.existing_rules."""

    def apply(self, raw: RawNotificationData, ctx: ClassifyContext) -> RulesOutcome:
        outcome = RulesOutcome()
        known_area_ids = {str(a.get("id")) for a in ctx.known_areas}
        known_project_ids = {str(p.get("id")) for p in ctx.known_projects}

        for rule in ctx.existing_rules:
            match = rule.get("match") or {}
            if not self._matches(match, raw):
                continue

            outcome.matched_any = True
            outcome.matched_rule_ids.append(str(rule.get("id")))
            action = rule.get("action") or {}

            # area/project — только если ссылка валидна и известна (иначе FK упадёт).
            area = _to_uuid(action.get("set_area_id"))
            if area is not None and (not known_area_ids or str(area) in known_area_ids):
                outcome.area_id = area
            project = _to_uuid(action.get("set_project_id"))
            if project is not None and (not known_project_ids or str(project) in known_project_ids):
                outcome.project_id = project

            if action.get("set_importance") is not None:
                outcome.importance = _clamp_importance(action["set_importance"])

            for tag in action.get("add_tags") or []:
                if tag and tag not in outcome.tags:
                    outcome.tags.append(tag)

            if action.get("confident"):
                outcome.confident = True
                break  # уверенное правило завершает подбор — без LLM

        return outcome

    @staticmethod
    def _matches(match: dict, raw: RawNotificationData) -> bool:
        """Все заданные условия правила должны совпасть (AND). Пустой match не матчит."""
        if not match:
            return False
        if (sa := match.get("source_app")) is not None and raw.source_app != sa:
            return False
        if (cat := match.get("category")) is not None and raw.category != cat:
            return False
        if (tr := match.get("title_regex")) is not None and not _regex_search(tr, raw.title):
            return False
        if (xr := match.get("text_regex")) is not None and not _regex_search(xr, raw.text):
            return False
        return True


def _clamp_importance(value: object) -> int:
    try:
        return max(0, min(100, int(value)))
    except (ValueError, TypeError):
        return 0
