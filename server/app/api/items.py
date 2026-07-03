"""GET /v1/items, GET /v1/items/{id}, PATCH /v1/items/{id}.

Cursor-пагинация: курсор кодирует последний увиденный (importance, created_at, id)
триплет (сортировка идёт по importance DESC, created_at DESC — id как tie-breaker
для устойчивости при равных importance/created_at). Курсор — непрозрачная строка
base64(importance:created_at_iso:id), клиент не должен её парсить.
"""
import base64
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_device
from app.config import get_settings
from app.db import get_db
from app.models import Device, Item, Process
from app.models.entities import ItemStatus as ORMItemStatus
from app.schemas.common import ItemStatus
from app.schemas.item import Item as ItemSchema
from app.schemas.item import ItemPage, ItemPatch

router = APIRouter(tags=["items"])
settings = get_settings()


_CURSOR_SEP = "|"  # не пересекается с ISO-датой (там только ':', '-', '.', '+'), в отличие от ':'


def _encode_cursor(importance: int, created_at: datetime, item_id: uuid.UUID) -> str:
    raw = f"{importance}{_CURSOR_SEP}{created_at.isoformat()}{_CURSOR_SEP}{item_id}"
    return base64.urlsafe_b64encode(raw.encode("utf-8")).decode("ascii")


def _decode_cursor(cursor: str) -> tuple[int, datetime, uuid.UUID]:
    try:
        raw = base64.urlsafe_b64decode(cursor.encode("ascii")).decode("utf-8")
        importance_str, created_at_str, id_str = raw.split(_CURSOR_SEP, 2)
        return int(importance_str), datetime.fromisoformat(created_at_str), uuid.UUID(id_str)
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Некорректный cursor") from exc


@router.get("/items", response_model=ItemPage)
async def list_items(
    importance_min: int | None = Query(default=None, ge=0, le=100),
    area_id: uuid.UUID | None = Query(default=None),
    project_id: uuid.UUID | None = Query(default=None),
    theme_id: uuid.UUID | None = Query(default=None),
    tag: str | None = Query(default=None),
    status_filter: ItemStatus | None = Query(default=None, alias="status"),
    from_: datetime | None = Query(default=None, alias="from"),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=settings.default_page_limit, le=settings.max_page_limit, gt=0),
    device: Device = Depends(get_current_device),
    db: AsyncSession = Depends(get_db),
) -> ItemPage:
    conditions = []

    if importance_min is not None:
        conditions.append(Item.importance >= importance_min)
    if area_id is not None:
        conditions.append(Item.area_id == area_id)
    if project_id is not None:
        conditions.append(Item.project_id == project_id)
    if theme_id is not None:
        # Сообщения темы = сообщения процессов, привязанных к этой теме.
        conditions.append(Item.process_id.in_(select(Process.id).where(Process.theme_id == theme_id)))
    if tag is not None:
        conditions.append(Item.tags.any(tag))
    if status_filter is not None:
        conditions.append(Item.status == ORMItemStatus(status_filter.value))
    if from_ is not None:
        conditions.append(Item.created_at >= from_)

    if cursor is not None:
        c_importance, c_created_at, c_id = _decode_cursor(cursor)
        # Сортировка (importance DESC, created_at DESC, id DESC) — берём "строго после" курсора.
        conditions.append(
            or_(
                Item.importance < c_importance,
                and_(Item.importance == c_importance, Item.created_at < c_created_at),
                and_(Item.importance == c_importance, Item.created_at == c_created_at, Item.id < c_id),
            )
        )

    stmt = (
        select(Item)
        .where(and_(*conditions)) if conditions else select(Item)
    )
    stmt = stmt.order_by(Item.importance.desc(), Item.created_at.desc(), Item.id.desc()).limit(limit + 1)

    result = await db.execute(stmt)
    rows = result.scalars().all()

    has_more = len(rows) > limit
    page_rows = rows[:limit]

    next_cursor = None
    if has_more and page_rows:
        last = page_rows[-1]
        next_cursor = _encode_cursor(last.importance, last.created_at, last.id)

    return ItemPage(items=[ItemSchema.model_validate(r) for r in page_rows], next_cursor=next_cursor)


@router.get("/items/{item_id}", response_model=ItemSchema)
async def get_item(
    item_id: uuid.UUID,
    device: Device = Depends(get_current_device),
    db: AsyncSession = Depends(get_db),
) -> ItemSchema:
    item = await db.get(Item, item_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item не найден")
    return ItemSchema.model_validate(item)


@router.patch("/items/{item_id}", response_model=ItemSchema)
async def patch_item(
    item_id: uuid.UUID,
    payload: ItemPatch,
    response: Response,
    device: Device = Depends(get_current_device),
    db: AsyncSession = Depends(get_db),
) -> ItemSchema:
    item = await db.get(Item, item_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item не найден")

    data = payload.model_dump(exclude_unset=True)

    manual_reassign = False
    dismissed_now = False

    if "status" in data:
        item.status = ORMItemStatus(data["status"].value if hasattr(data["status"], "value") else data["status"])
        dismissed_now = item.status == ORMItemStatus.dismissed
    if "snoozed_until" in data:
        item.snoozed_until = data["snoozed_until"]
    if "area_id" in data:
        item.area_id = data["area_id"]
        manual_reassign = True
    if "project_id" in data:
        item.project_id = data["project_id"]
        manual_reassign = True
    if "tags" in data:
        item.tags = data["tags"]
        manual_reassign = True

    if manual_reassign:
        # Ручная установка area/project/tags → classified_by='manual' (контракт ItemPatch).
        from app.models.entities import ClassifiedBy as ORMClassifiedBy

        item.classified_by = ORMClassifiedBy.manual

    item.updated_at = _utc_now()

    # Обучение на смахиваниях: ручной dismiss гасит похожие inbox-элементы
    # (одним свайпом уходит вся пачка повторяющегося шума). Число — в заголовке.
    also_dismissed = 0
    settings = get_settings()
    if dismissed_now and settings.junk_learning_enabled:
        from app.pipeline.junk_filter import cascade_dismiss_similar

        also_dismissed = await cascade_dismiss_similar(db, item, settings.junk_sim_threshold)

    await db.commit()
    await db.refresh(item)
    response.headers["X-Also-Dismissed"] = str(also_dismissed)
    return ItemSchema.model_validate(item)


def _utc_now():
    from datetime import UTC, datetime

    return datetime.now(UTC)
