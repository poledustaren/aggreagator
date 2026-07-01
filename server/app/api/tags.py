"""GET /v1/tags — уникальные теги из всех items (для автодополнения/фильтров)."""
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_device
from app.db import get_db
from app.models import Device, Item

router = APIRouter(tags=["tags"])


@router.get("/tags", response_model=list[str])
async def list_tags(
    device: Device = Depends(get_current_device),
    db: AsyncSession = Depends(get_db),
) -> list[str]:
    # unnest() разворачивает TEXT[] в строки прямо в SELECT-списке (Postgres допускает
    # set-returning функции там); оборачиваем в подзапрос, чтобы навесить DISTINCT + ORDER BY.
    subq = select(func.unnest(Item.tags).label("tag")).subquery()
    stmt = select(subq.c.tag).distinct().order_by(subq.c.tag)

    result = await db.execute(stmt)
    return [row[0] for row in result.all()]
