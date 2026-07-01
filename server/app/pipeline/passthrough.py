"""PassthroughClassifier — заглушка пайплайна классификации для Фазы 2a.

Создаёт Item 1:1 из RawNotification:
  - importance = 0 (нейтральное значение, реальная оценка важности — Фаза 2b)
  - classified_by = None (ничего не классифицировало по-настоящему)
  - area_id / project_id / tags не устанавливаются
  - группировка по простому ключу (source_app + календарный день получения) —
    это достаточно, чтобы группы в /v1/groups не были по одному Item каждая,
    но НЕ является финальной логикой дедупликации/группировки тредов —
    та потребует семантики (LLM/эвристики) и будет заменена в Фазе 2b.

Этого достаточно, чтобы end-to-end путь ingestion → Item → feed работал уже
в Фазе 2a без ожидания RulesEngine/LLM-роутера.
"""
from __future__ import annotations

from app.pipeline.classifier import ClassificationResult, ClassifyContext, RawNotificationData


class PassthroughClassifier:
    """Заглушка, реализующая протокол Classifier. См. docstring модуля."""

    async def classify(self, raw: RawNotificationData, ctx: ClassifyContext) -> ClassificationResult:
        # Ключ группировки: source_app + день (UTC-дата posted_at).
        # TODO(Фаза 2b): заменить на семантическую группировку (RulesEngine
        # может группировать по отправителю/треду переписки, LLM — по теме).
        posted_at = raw.posted_at
        day = posted_at.date().isoformat() if hasattr(posted_at, "date") else "unknown"
        group_key = f"{raw.source_app}:{day}"

        title = raw.title or raw.app_label or raw.source_app

        return ClassificationResult(
            title=title,
            summary=raw.text,
            importance=0,
            suggested_action=None,
            area_id=None,
            project_id=None,
            tags=[],
            group_key=group_key,
            group_title=raw.app_label or raw.source_app,
            classified_by=None,
            confidence=None,
            model="passthrough",
            raw_output=None,
        )
