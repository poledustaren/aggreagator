"""Интерфейс классификационного пайплайна — ГРАНИЦА между Фазой 2a и Фазой 2b.

=====================================================================
ВАЖНО ДЛЯ РАЗРАБОТЧИКА ФАЗЫ 2b (RulesEngine + LLM-роутер):
=====================================================================
Этот модуль — единственный контракт, который Фаза 2a предоставляет Фазе 2b.
Всё, что нужно сделать в 2b — реализовать класс, соответствующий протоколу
`Classifier` (метод `classify`), и подставить его вместо `PassthroughClassifier`
в точке сборки зависимостей (см. app/pipeline/runner.py::get_classifier).

Ожидаемая архитектура 2b (см. docs/plans, contracts/openapi.yaml/Rule):
  1. RulesEngine — прогоняет RawNotification через таблицу `rule` (см.
     server/db/schema.sql), сортированную по (enabled, priority). Первое
     сработавшее правило с action.confident=true завершает классификацию
     без обращения к LLM.
  2. LLMRouter — если ни одно confident-правило не сработало, эскалирует
     в LLM (haiku для рутины, opus для неоднозначных случаев), формирует
     ClassificationResult с classified_by='llm'.
  3. Оба слоя пишут аудит-запись в таблицу `classification` (layer, model,
     confidence, raw_output) — это уже реализовано в 2a на уровне записи
     результата (см. runner.py), 2b лишь обязан вернуть эти поля в
     ClassificationResult.

НЕ реализовывай классификационную логику в Фазе 2a — только интерфейс и
заглушку (PassthroughClassifier), см. соответствующий docstring.
=====================================================================
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable

from app.schemas.common import ClassifiedBy


@dataclass
class RawNotificationData:
    """Плоское представление одного сырого уведомления, передаваемое в классификатор.

    Не завязано на ORM-модель напрямую, чтобы Classifier не зависел от деталей
    хранения (упрощает unit-тестирование реализаций 2b без БД).
    """

    id: uuid.UUID
    device_id: uuid.UUID
    client_id: str
    source_app: str
    app_label: str | None
    title: str | None
    text: str | None
    subtext: str | None
    category: str | None
    posted_at: object  # datetime; object чтобы избежать лишнего импорта в контракте
    extras: dict | None


@dataclass
class ClassifyContext:
    """Контекст, доступный классификатору при обработке одного уведомления.

    existing_rules — актуальный снимок таблицы `rule` (уже отсортированный по
    priority), передаётся, чтобы RulesEngine не делал собственный запрос к БД
    и пайплайн оставался тестируемым в изоляции.
    """

    existing_rules: list[dict] = field(default_factory=list)
    known_areas: list[dict] = field(default_factory=list)
    known_projects: list[dict] = field(default_factory=list)


@dataclass
class ClassificationResult:
    """Результат классификации одного RawNotification → атрибуты будущего Item.

    group_key используется для upsert в таблицу `group` (group_key_idx уникален):
    если группа с таким ключом уже существует — Item подвешивается к ней и
    last_activity_at обновляется, иначе создаётся новая группа.
    """

    title: str | None
    summary: str | None
    importance: int  # 0..100
    suggested_action: str | None
    area_id: uuid.UUID | None
    project_id: uuid.UUID | None
    tags: list[str]
    group_key: str
    group_title: str | None
    classified_by: ClassifiedBy | None
    confidence: float | None
    model: str | None = None  # напр. "rule:<id>" / "claude-haiku-4-5" — для таблицы classification
    raw_output: dict | None = None


@runtime_checkable
class Classifier(Protocol):
    """Контракт классификационного пайплайна.

    Реализация вызывается асинхронно фоновой задачей после ingest (см.
    app/api/ingest.py), чтобы сам ingest-эндпоинт отвечал быстро (202 Accepted)
    и не блокировался на потенциально медленных вызовах LLM.
    """

    async def classify(self, raw: RawNotificationData, ctx: ClassifyContext) -> ClassificationResult:
        """Классифицировать одно сырое уведомление и вернуть атрибуты для Item/Group.

        Реализация НЕ должна писать в БД — это ответственность runner'а
        (app/pipeline/runner.py), который вызывает classify() и затем
        атомарно создаёт/обновляет Item, Group и запись Classification.
        """
        ...
