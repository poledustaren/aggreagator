"""GET /v1/themes — дерево тематик с агрегатами для главной («Темы»).

Читает ПЕРСИСТЕНТНЫЕ темы (theme + process.theme_id), ничего не регенерит.
Отдаёт плоский список узлов с агрегатами; дерево собирает клиент по parent_id.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_device
from app.db import get_db
from app.models import Device
from app.models.entities import Item, ItemStatus, Process, Theme
from app.schemas.theme import ThemeList, ThemeNode

router = APIRouter(tags=["themes"])


@router.get("/themes", response_model=ThemeList)
async def list_themes(
    device: Device = Depends(get_current_device),
    db: AsyncSession = Depends(get_db),
) -> ThemeList:
    inbox = Item.status == ItemStatus.inbox
    stmt = (
        select(
            Theme.id,
            Theme.name,
            Theme.parent_id,
            Theme.depth,
            Theme.summary,
            Theme.last_activity_at,
            func.count(Item.id).filter(inbox).label("inbox_count"),
            func.coalesce(func.max(Item.importance).filter(inbox), 0).label("max_importance"),
            func.count(func.distinct(Process.id)).label("process_count"),
        )
        .select_from(Theme)
        .outerjoin(Process, Process.theme_id == Theme.id)
        .outerjoin(Item, Item.process_id == Process.id)
        .group_by(Theme.id)
        .order_by(Theme.last_activity_at.desc())
    )
    rows = (await db.execute(stmt)).all()
    themes = [
        ThemeNode(
            id=r.id,
            name=r.name,
            parent_id=r.parent_id,
            depth=r.depth,
            summary=r.summary,
            last_activity_at=r.last_activity_at,
            inbox_count=r.inbox_count,
            max_importance=r.max_importance,
            process_count=r.process_count,
        )
        for r in rows
    ]
    return ThemeList(themes=themes)
