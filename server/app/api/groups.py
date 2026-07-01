"""GET /v1/groups — треды с вложенными items, importance = max по items.

Cursor-пагинация по (last_activity_at DESC, id) — аналогично items.py.
"""
import base64
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_device
from app.config import get_settings
from app.db import get_db
from app.models import Device, Group, Item
from app.models.entities import ItemStatus as ORMItemStatus
from app.schemas.common import ItemStatus
from app.schemas.group import Group as GroupSchema
from app.schemas.group import GroupPage
from app.schemas.item import Item as ItemSchema

router = APIRouter(tags=["groups"])
settings = get_settings()


_CURSOR_SEP = "|"  # не пересекается с ISO-датой (там только ':', '-', '.', '+'), в отличие от ':'


def _encode_cursor(last_activity_at: datetime, group_id: uuid.UUID) -> str:
    raw = f"{last_activity_at.isoformat()}{_CURSOR_SEP}{group_id}"
    return base64.urlsafe_b64encode(raw.encode("utf-8")).decode("ascii")


def _decode_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        raw = base64.urlsafe_b64decode(cursor.encode("ascii")).decode("utf-8")
        ts_str, id_str = raw.split(_CURSOR_SEP, 1)
        return datetime.fromisoformat(ts_str), uuid.UUID(id_str)
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Некорректный cursor") from exc


@router.get("/groups", response_model=GroupPage)
async def list_groups(
    status_filter: ItemStatus | None = Query(default=None, alias="status"),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=settings.default_page_limit, le=settings.max_page_limit, gt=0),
    device: Device = Depends(get_current_device),
    db: AsyncSession = Depends(get_db),
) -> GroupPage:
    conditions = []
    if cursor is not None:
        c_ts, c_id = _decode_cursor(cursor)
        conditions.append(
            or_(
                Group.last_activity_at < c_ts,
                and_(Group.last_activity_at == c_ts, Group.id < c_id),
            )
        )

    stmt = select(Group)
    if conditions:
        stmt = stmt.where(and_(*conditions))
    stmt = stmt.order_by(Group.last_activity_at.desc(), Group.id.desc()).limit(limit + 1)
    stmt = stmt.options(selectinload(Group.items))

    result = await db.execute(stmt)
    groups = result.scalars().all()

    has_more = len(groups) > limit
    page_groups = groups[:limit]

    # Если задан фильтр по статусу — отфильтровываем items внутри группы на уровне Python
    # (группы с пустым набором items после фильтра всё равно возвращаются, чтобы не терять
    # пагинацию/консистентность треда; item_count/importance считаются по отфильтрованным items).
    result_groups: list[GroupSchema] = []
    for g in page_groups:
        items = list(g.items)
        if status_filter is not None:
            items = [i for i in items if i.status == ORMItemStatus(status_filter.value)]
        importance = max((i.importance for i in items), default=0)
        result_groups.append(
            GroupSchema(
                id=g.id,
                title=g.title,
                importance=importance,
                item_count=len(items),
                area_id=g.area_id,
                project_id=g.project_id,
                last_activity_at=g.last_activity_at,
                items=[ItemSchema.model_validate(i) for i in items],
            )
        )

    next_cursor = None
    if has_more and page_groups:
        last = page_groups[-1]
        next_cursor = _encode_cursor(last.last_activity_at, last.id)

    return GroupPage(groups=result_groups, next_cursor=next_cursor)
