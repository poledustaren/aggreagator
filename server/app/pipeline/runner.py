"""Раннер классификационного пайплайна.

Вызывается как фоновая задача (FastAPI BackgroundTasks) сразу после успешного
ingest, чтобы сам /v1/notifications:ingest отвечал быстро (202) и не ждал
классификации. Раннер:
  1. Загружает свежесозданные RawNotification без item_id (ещё не обработанные).
  2. Прогоняет каждый через Classifier.classify() (в 2a — PassthroughClassifier,
     в 2b подставится RulesEngine+LLMRouter — см. classifier.py).
  3. Создаёт/находит Group по group_key (upsert по уникальному индексу).
  4. Создаёт Item, связывает raw_notification.item_id, пишет аудит в Classification.

Открывает собственную сессию БД (не переиспользует сессию исходного запроса),
так как выполняется после того, как ответ уже мог быть отправлен клиенту.
"""
from __future__ import annotations

import logging
import uuid

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import AsyncSessionLocal
from app.models import Area, Classification, Group, Item, Process, ProcessStatus, Project, RawNotification, Rule
from app.models.entities import ItemStatus as ORMItemStatus
from app.pipeline.classifier import ClassificationResult, Classifier, ClassifyContext, RawNotificationData
from app.pipeline.composite import CompositeClassifier
from app.pipeline.dedup import find_duplicate_inbox_item
from app.pipeline.embeddings import build_embedder
from app.pipeline.junk_filter import is_similar_to_dismissed
from app.pipeline.llm_provider import build_provider
from app.pipeline.llm_router import LLMRouter
from app.pipeline.process_linker import ProcessLinker
from app.pipeline.rules_engine import RulesEngine
from app.pipeline.theme_linker import ThemeLinker

logger = logging.getLogger(__name__)


def get_classifier() -> Classifier:
    """Точка сборки классификатора (Фаза 2b): RulesEngine + опциональный LLMRouter.

    Провайдер LLM определяется настройками (llm_provider): при "none" пайплайн
    работает только на правилах; при "anthropic"/"ollama" — эскалирует непонятные
    уведомления в LLM с роутингом моделей (haiku↔opus).
    """
    settings = get_settings()
    provider = build_provider(settings)
    router = LLMRouter(provider, settings) if provider is not None else None
    return CompositeClassifier(RulesEngine(), router)


def get_process_linker() -> ProcessLinker | None:
    """Точка сборки линкера процессов (RAG). None → эмбеддер выключен, процессы не строятся."""
    settings = get_settings()
    embedder = build_embedder(settings)
    if embedder is None:
        return None
    llm = build_provider(settings)  # тот же LLM (glm-5.2:cloud) для решения attach/new/ended
    return ProcessLinker(embedder, llm, settings)


def get_theme_linker() -> ThemeLinker | None:
    """Линкер тематик (дерево тем над процессами). None → RAG выключен."""
    settings = get_settings()
    if build_embedder(settings) is None:
        return None
    return ThemeLinker(build_provider(settings), settings)


async def run_pipeline_for_raw_notifications(raw_ids: list[uuid.UUID]) -> None:
    """Точка входа фоновой задачи: обработать список raw_notification.id."""
    if not raw_ids:
        return

    classifier = get_classifier()
    linker = get_process_linker()
    theme_linker = get_theme_linker()
    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(select(RawNotification).where(RawNotification.id.in_(raw_ids)))
            raw_rows = result.scalars().all()

            # Снимки правил/зон/проектов передаём в контекст один раз на батч
            # (не на каждое уведомление) — классификатор остаётся тестируемым в изоляции.
            rules_result = await db.execute(select(Rule).where(Rule.enabled.is_(True)).order_by(Rule.priority))
            rules_snapshot = [
                {"id": str(r.id), "name": r.name, "priority": r.priority, "match": r.match, "action": r.action}
                for r in rules_result.scalars().all()
            ]
            areas_result = await db.execute(select(Area))
            areas_snapshot = [{"id": str(a.id), "name": a.name} for a in areas_result.scalars().all()]
            projects_result = await db.execute(select(Project).where(Project.active.is_(True)))
            projects_snapshot = [
                {"id": str(p.id), "name": p.name, "area_id": str(p.area_id)}
                for p in projects_result.scalars().all()
            ]
            ctx = ClassifyContext(
                existing_rules=rules_snapshot,
                known_areas=areas_snapshot,
                known_projects=projects_snapshot,
            )

            for raw in raw_rows:
                if raw.item_id is not None:
                    continue  # уже обработан ранее (защита от повторного вызова)
                await _process_one(db, classifier, linker, theme_linker, raw, ctx)

            await db.commit()
        except Exception:
            logger.exception("Ошибка фонового пайплайна классификации для raw_ids=%s", raw_ids)
            await db.rollback()


async def _process_one(
    db: AsyncSession,
    classifier: Classifier,
    linker: ProcessLinker | None,
    theme_linker: ThemeLinker | None,
    raw: RawNotification,
    ctx: ClassifyContext,
) -> None:
    raw_data = RawNotificationData(
        id=raw.id,
        device_id=raw.device_id,
        client_id=raw.client_id,
        source_app=raw.source_app,
        app_label=raw.app_label,
        title=raw.title,
        text=raw.text,
        subtext=raw.subtext,
        category=raw.category,
        posted_at=raw.posted_at,
        extras=raw.extras,
    )

    classification: ClassificationResult = await classifier.classify(raw_data, ctx)

    # Контент-дедуп: точный повтор уже висящего в inbox уведомления (перевыложен
    # Android'ом с новым client_id) не создаёт новый Item — привязываем raw к
    # существующему и освежаем его. Детерминированно, без LLM/эмбеддингов.
    dup = await find_duplicate_inbox_item(db, classification.title, classification.summary, raw.source_app)
    if dup is not None:
        raw.item_id = dup.id
        dup.updated_at = _utc_now()
        return

    group = await _upsert_group(db, classification)

    item = Item(
        title=classification.title,
        summary=classification.summary,
        importance=classification.importance,
        suggested_action=classification.suggested_action,
        area_id=classification.area_id,
        project_id=classification.project_id,
        group_id=group.id if group else None,
        tags=classification.tags,
        source_apps=[raw.source_app],
        classified_by=classification.classified_by,
        confidence=classification.confidence,
    )
    db.add(item)
    await db.flush()  # получить item.id

    raw.item_id = item.id

    if classification.classified_by is not None:
        db.add(
            Classification(
                item_id=item.id,
                layer=classification.classified_by,
                model=classification.model,
                confidence=classification.confidence,
                raw_output=classification.raw_output,
            )
        )

    # RAG: привязать Item к процессу (best-effort — не ломает пайплайн при сбое).
    if linker is not None:
        await linker.link(db, item)

        # Обучение на смахиваниях: если item похож на ранее смахнутую «пежню» —
        # гасим сразу на входе, чтобы повторяющийся шум не всплывал в сводке.
        s = get_settings()
        if (
            s.junk_learning_enabled
            and item.status == ORMItemStatus.inbox
            and item.embedding is not None
            and await is_similar_to_dismissed(db, item.embedding, s.junk_sim_threshold, s.junk_lookback_days)
        ):
            item.status = ORMItemStatus.dismissed

        # Тематики: относим процесс к теме инкрементально. Новый процесс (без темы) →
        # LLM attach/new; уже привязанный → только обновляем «свежесть» темы.
        if theme_linker is not None and item.process_id is not None:
            proc = await db.get(Process, item.process_id)
            if proc is not None:
                if proc.theme_id is None:
                    await theme_linker.assign(db, proc)
                else:
                    await theme_linker.touch(db, proc.theme_id)


async def _upsert_group(db: AsyncSession, classification: ClassificationResult) -> Group | None:
    """Найти существующую группу по group_key или создать новую (без гонок за счёт ON CONFLICT)."""
    if not classification.group_key:
        return None

    # Пытаемся вставить новую группу; при конфликте по group_key ничего не делаем
    # здесь и обновляем last_activity_at отдельным UPDATE ниже (проще и явнее,
    # чем DO UPDATE с EXCLUDED в одном выражении).
    result = await db.execute(
        pg_insert(Group)
        .values(
            group_key=classification.group_key,
            title=classification.group_title,
            area_id=classification.area_id,
            project_id=classification.project_id,
        )
        .on_conflict_do_nothing(index_elements=[Group.group_key])
        .returning(Group.id)
    )
    group_id = result.scalar_one_or_none()

    if group_id is None:
        # Группа уже существовала — подтягиваем её и обновляем last_activity_at.
        existing = await db.execute(select(Group).where(Group.group_key == classification.group_key))
        group = existing.scalar_one()
        group.last_activity_at = _utc_now()
        return group

    new_group = await db.get(Group, group_id)
    return new_group


def _utc_now():
    from datetime import UTC, datetime

    return datetime.now(UTC)


async def freeze_stale_processes() -> int:
    """Заморозить open-процессы без активности ≥ PROCESS_FREEZE_IDLE_DAYS дней.

    Тишина не закрывает процесс (закрытие — только по явному признаку от LLM),
    а переводит в frozen: на таймлайне он получает конец на last_activity_at, но
    может ожить, если придёт связанное сообщение. Вызывать периодически (cron).
    Возвращает число замороженных процессов.
    """
    from datetime import timedelta

    from sqlalchemy import update

    settings = get_settings()
    cutoff = _utc_now() - timedelta(days=settings.process_freeze_idle_days)
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            update(Process)
            .where(Process.status == ProcessStatus.open, Process.last_activity_at < cutoff)
            .values(status=ProcessStatus.frozen)
            .returning(Process.id)
        )
        frozen_ids = result.scalars().all()
        await db.commit()
    if frozen_ids:
        logger.info("Заморожено процессов по тишине: %d", len(frozen_ids))
    return len(frozen_ids)
