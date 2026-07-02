"""Обучение на смахиваниях («пежня»).

Смахнутые пользователем item'ы — это обучающая выборка: их эмбеддинги (bge-m3)
задают «паттерн шума». Отсюда две операции:

  1. cascade_dismiss_similar — сразу после ручного dismiss гасим ПОХОЖИЕ inbox-item'ы
     (тот же повторяющийся алерт → одним свайпом уходит вся пачка).
  2. is_similar_to_dismissed — на входе (ingest) проверяем новый item: если он близок
     к недавно смахнутому — гасим его автоматически, ещё до показа в сводке.

Похожесть — cosine по item.embedding (pgvector). similarity = 1 - cosine_distance,
distance ∈ [0,2]. Порог высокий (по умолчанию 0.90) — гасим только near-дубли,
чтобы не прятать легитимно важное.
"""
from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import Item, ItemStatus

logger = logging.getLogger(__name__)


async def cascade_dismiss_similar(
    db: AsyncSession, item: Item, threshold: float
) -> int:
    """Погасить inbox-item'ы, похожие на только что смахнутый `item`.

    Возвращает число дополнительно погашенных элементов. Ограничиваемся статусом
    inbox (снуз/готово/уже-dismissed не трогаем) и исключаем сам item.
    """
    if item.embedding is None:
        return 0
    max_dist = 1.0 - threshold
    dist = Item.embedding.cosine_distance(item.embedding)
    stmt = (
        update(Item)
        .where(
            Item.id != item.id,
            Item.status == ItemStatus.inbox,
            Item.embedding.is_not(None),
            dist <= max_dist,
        )
        .values(status=ItemStatus.dismissed, updated_at=datetime.now(UTC))
        .execution_options(synchronize_session=False)
    )
    result = await db.execute(stmt)
    count = result.rowcount or 0
    if count:
        logger.info("Каскадно погашено %d похожих на смахнутый item %s", count, item.id)
    return count


async def is_similar_to_dismissed(
    db: AsyncSession, emb: list[float], threshold: float, lookback_days: int
) -> bool:
    """Есть ли среди недавно смахнутых item близкий к `emb` (≥ threshold)?"""
    if not emb:
        return False
    max_dist = 1.0 - threshold
    since = datetime.now(UTC) - timedelta(days=lookback_days)
    dist = Item.embedding.cosine_distance(emb)
    stmt = (
        select(Item.id)
        .where(
            Item.status == ItemStatus.dismissed,
            Item.embedding.is_not(None),
            Item.updated_at >= since,
            dist <= max_dist,
        )
        .limit(1)
    )
    return (await db.execute(stmt)).first() is not None
