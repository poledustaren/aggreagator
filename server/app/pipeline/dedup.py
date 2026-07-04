"""Дедупликация item'ов по контенту (детерминированно, без LLM/эмбеддингов).

Проблема: одно и то же уведомление часто перевыкладывается Android'ом с новым
`client_id` (ongoing-нотификации, повторные звонки, обновляемые прогресс-бары).
Уникальный индекс raw_notification (device_id, client_id) их НЕ ловит — каждый
raw превращается в отдельный Item, и на главной копится «2569 при 2084 уникальных».

Здесь — точный контент-матч среди inbox-item'ов: (source_app, title, summary).
Если такой уже есть — новый не создаём, а привязываем raw к существующему.
В отличие от junk_filter (эмбеддинги + смахивания) это работает всегда, даже при
выключенном эмбеддере, и гасит именно точные повторы, ничего важного не пряча.
"""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import Item, ItemStatus


def _norm(value: str | None) -> str:
    """Нормализация текста для сравнения: trim + схлопывание пробелов + lower."""
    return " ".join((value or "").split()).lower()


async def find_duplicate_inbox_item(
    db: AsyncSession, title: str | None, summary: str | None, source_app: str
) -> Item | None:
    """Найти существующий inbox-Item с тем же контентом (source_app, title, summary).

    Сравнение нормализованное (trim/collapse/lower) — на стороне БД для title/summary
    точное равенство после normalize; source_app должен присутствовать в source_apps.
    Возвращает самый свежий подходящий item или None.
    """
    n_title = _norm(title)
    n_summary = _norm(summary)
    if not n_title and not n_summary:
        return None  # нечего сравнивать — не дедупим пустышки

    # lower(regexp_replace(coalesce(x,''), '\s+', ' ', 'g')) — эквивалент _norm на стороне PG.
    def norm_col(col):
        return func.lower(func.btrim(func.regexp_replace(func.coalesce(col, ""), r"\s+", " ", "g")))

    stmt = (
        select(Item)
        .where(
            Item.status == ItemStatus.inbox,
            norm_col(Item.title) == n_title,
            norm_col(Item.summary) == n_summary,
            Item.source_apps.any(source_app),
        )
        .order_by(Item.created_at.desc())
        .limit(1)
    )
    return (await db.execute(stmt)).scalars().first()
