"""LLMRouter — слой классификации через LLM (Фаза 2b).

Вызывается CompositeClassifier, когда правила не дали уверенного результата.
Роутер моделей: короткие/рутинные уведомления → routine-модель (haiku),
длинные/неоднозначные → hard-модель (opus). Модель заполняет: area/project
(из известных пользователю), теги, важность 0-100, summary, suggested_action,
ключ группировки треда.

Приватность: провайдер абстрагирован (см. llm_provider.py) — при Ollama контент
не покидает хост. В запрос отдаём только поля уведомления, необходимые для
классификации.
"""
from __future__ import annotations

import logging
import uuid

from app.config import Settings
from app.pipeline.classifier import ClassificationResult, ClassifyContext, RawNotificationData
from app.pipeline.llm_provider import LLMProvider, parse_json_object
from app.pipeline.rules_engine import RulesOutcome, _clamp_importance, _to_uuid
from app.schemas.common import ClassifiedBy

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """Ты — классификатор входящих уведомлений в системе личной продуктивности (GTD).
Твоя задача — по одному уведомлению определить, насколько оно ВАЖНО для пользователя,
и привязать его к структуре жизни пользователя (зоны ответственности и активные проекты).

Отвечай СТРОГО одним JSON-объектом без пояснений, со следующими полями:
  "importance": int 0-100  (0 = шум/реклама/автоматика, 100 = срочное и критичное лично для пользователя),
  "area_id": string|null   (id зоны из списка ниже или null),
  "project_id": string|null(id проекта из списка ниже или null),
  "tags": string[]         (0-5 коротких тегов в нижнем регистре),
  "summary": string        (1 короткое предложение — суть уведомления),
  "suggested_action": string|null (что пользователю сделать, кратко, или null),
  "group_key": string      (стабильный ключ для склейки в тред: отправитель/тема/чат),
  "group_title": string    (человекочитаемое название треда),
  "confidence": number 0-1 (насколько ты уверен в классификации).

Оценивай важность консервативно: большинство уведомлений — шум. Высокую важность
давай только тому, что требует реакции пользователя лично."""


class LLMRouter:
    """Классификатор через LLM с выбором модели по сложности входа."""

    def __init__(self, provider: LLMProvider, settings: Settings) -> None:
        self._provider = provider
        self._s = settings

    def _pick_model(self, raw: RawNotificationData, hints: RulesOutcome | None) -> str:
        """Роутинг: длинный/неоднозначный текст → hard-модель, иначе routine."""
        anthropic = (self._s.llm_provider or "").lower() == "anthropic"
        routine = self._s.llm_model_routine if anthropic else self._s.ollama_model_routine
        hard = self._s.llm_model_hard if anthropic else self._s.ollama_model_hard

        text_len = len(raw.title or "") + len(raw.text or "")
        # Эскалируем, если текст длинный ИЛИ правила частично сработали, но не уверенно
        # (значит случай пограничный и стоит подумать сильнее).
        ambiguous = bool(hints and hints.matched_any and not hints.confident)
        if text_len > self._s.llm_escalation_char_threshold or ambiguous:
            return hard
        return routine

    def _build_prompt(self, raw: RawNotificationData, ctx: ClassifyContext, hints: RulesOutcome | None) -> str:
        areas = "\n".join(f"  - {a.get('id')}: {a.get('name')}" for a in ctx.known_areas) or "  (нет)"
        projects = (
            "\n".join(
                f"  - {p.get('id')}: {p.get('name')} (зона {p.get('area_id')})" for p in ctx.known_projects
            )
            or "  (нет)"
        )
        hint_line = ""
        if hints and (hints.tags or hints.area_id or hints.project_id or hints.importance is not None):
            hint_line = (
                "\nПодсказки от правил (можешь учесть или переопределить): "
                f"area_id={hints.area_id}, project_id={hints.project_id}, "
                f"importance={hints.importance}, tags={hints.tags}\n"
            )
        return (
            f"ЗОНЫ ОТВЕТСТВЕННОСТИ:\n{areas}\n\n"
            f"АКТИВНЫЕ ПРОЕКТЫ:\n{projects}\n"
            f"{hint_line}\n"
            "УВЕДОМЛЕНИЕ:\n"
            f"  Приложение: {raw.app_label or raw.source_app} ({raw.source_app})\n"
            f"  Категория: {raw.category or '-'}\n"
            f"  Заголовок: {raw.title or '-'}\n"
            f"  Текст: {raw.text or '-'}\n"
        )

    async def classify(
        self, raw: RawNotificationData, ctx: ClassifyContext, hints: RulesOutcome | None = None
    ) -> ClassificationResult:
        model = self._pick_model(raw, hints)
        prompt = self._build_prompt(raw, ctx, hints)

        try:
            text = await self._provider.complete(
                model=model, system=_SYSTEM_PROMPT, prompt=prompt, max_tokens=self._s.llm_max_tokens
            )
        except Exception:
            logger.exception("Ошибка вызова LLM (model=%s) — откат к результату правил/нейтральному", model)
            return self._fallback(raw, hints)

        data = parse_json_object(text)
        if not data:
            logger.warning("LLM вернул неразбираемый ответ (model=%s): %r", model, text[:200])
            return self._fallback(raw, hints)

        return self._to_result(raw, ctx, hints, data, model)

    def _to_result(
        self,
        raw: RawNotificationData,
        ctx: ClassifyContext,
        hints: RulesOutcome | None,
        data: dict,
        model: str,
    ) -> ClassificationResult:
        known_area_ids = {str(a.get("id")) for a in ctx.known_areas}
        known_project_ids = {str(p.get("id")) for p in ctx.known_projects}

        area_id = _valid_ref(data.get("area_id"), known_area_ids) or (hints.area_id if hints else None)
        project_id = _valid_ref(data.get("project_id"), known_project_ids) or (hints.project_id if hints else None)

        tags = [str(t).lower() for t in (data.get("tags") or []) if t][:5]
        if hints:  # добавляем теги правил, не дублируя
            for t in hints.tags:
                if t not in tags:
                    tags.append(t)

        group_key = str(data.get("group_key") or "").strip() or _heuristic_group_key(raw)
        confidence = _clamp_confidence(data.get("confidence"), self._s.llm_default_confidence)

        return ClassificationResult(
            title=raw.title or raw.app_label or raw.source_app,
            summary=str(data.get("summary") or raw.text or "")[:500] or None,
            importance=_clamp_importance(data.get("importance", hints.importance if hints else 0)),
            suggested_action=(str(data["suggested_action"]) if data.get("suggested_action") else None),
            area_id=area_id,
            project_id=project_id,
            tags=tags,
            group_key=group_key,
            group_title=str(data.get("group_title") or raw.app_label or raw.source_app),
            classified_by=ClassifiedBy.llm,
            confidence=confidence,
            model=model,
            raw_output=data,
        )

    def _fallback(self, raw: RawNotificationData, hints: RulesOutcome | None) -> ClassificationResult:
        """LLM недоступен/сломался: используем то, что дали правила, иначе нейтрально."""
        importance = hints.importance if (hints and hints.importance is not None) else 0
        return ClassificationResult(
            title=raw.title or raw.app_label or raw.source_app,
            summary=raw.text,
            importance=importance or 0,
            suggested_action=None,
            area_id=hints.area_id if hints else None,
            project_id=hints.project_id if hints else None,
            tags=list(hints.tags) if hints else [],
            group_key=_heuristic_group_key(raw),
            group_title=raw.app_label or raw.source_app,
            classified_by=ClassifiedBy.rules if (hints and hints.matched_any) else None,
            confidence=None,
            model="llm-fallback",
            raw_output=None,
        )


def _valid_ref(value: object, known: set[str]) -> uuid.UUID | None:
    """Принять id только если он валиден И присутствует в известном наборе (анти-галлюцинация)."""
    ref = _to_uuid(value)
    if ref is None:
        return None
    if known and str(ref) not in known:
        return None
    return ref


def _clamp_confidence(value: object, default: float) -> float:
    try:
        return max(0.0, min(1.0, float(value)))
    except (ValueError, TypeError):
        return default


def _heuristic_group_key(raw: RawNotificationData) -> str:
    posted_at = raw.posted_at
    day = posted_at.date().isoformat() if hasattr(posted_at, "date") else "unknown"
    return f"{raw.source_app}:{day}"
