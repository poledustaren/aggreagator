"""GET /v1/processes, /v1/processes/{id}, /v1/processes/timeline, POST /v1/processes/freeze.

Процессы — RAG-надстройка над Item (см. app/pipeline/process_linker.py).
Cursor-пагинация по (last_activity_at DESC, id) — как в groups.py.
"""
import base64
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_device
from app.config import get_settings
from app.db import get_db
from app.models import Device, Item, Process
from app.models.entities import ProcessStatus as ORMProcessStatus
from app.schemas.common import ProcessStatus
from app.schemas.item import Item as ItemSchema
from app.schemas.process import (
    Process as ProcessSchema,
)
from app.schemas.process import (
    ProcessDetail,
    ProcessPage,
    ProcessTimeline,
    ProcessTimelineEntry,
)

router = APIRouter(tags=["processes"])
settings = get_settings()

_CURSOR_SEP = "|"


def _encode_cursor(last_activity_at: datetime, process_id: uuid.UUID) -> str:
    raw = f"{last_activity_at.isoformat()}{_CURSOR_SEP}{process_id}"
    return base64.urlsafe_b64encode(raw.encode("utf-8")).decode("ascii")


def _decode_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        raw = base64.urlsafe_b64decode(cursor.encode("ascii")).decode("utf-8")
        ts_str, id_str = raw.split(_CURSOR_SEP, 1)
        return datetime.fromisoformat(ts_str), uuid.UUID(id_str)
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Некорректный cursor") from exc


def _timeline_end(p: Process) -> datetime | None:
    """Конец полосы: closed→ended_at, frozen→last_activity_at, open→None (идёт)."""
    if p.status == ORMProcessStatus.closed:
        return p.ended_at or p.last_activity_at
    if p.status == ORMProcessStatus.frozen:
        return p.last_activity_at
    return None


# ── timeline и freeze объявляем ДО /{id}, чтобы путь не перехватился как uuid ──
@router.get("/processes/timeline", response_model=ProcessTimeline)
async def processes_timeline(
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
    device: Device = Depends(get_current_device),
    db: AsyncSession = Depends(get_db),
) -> ProcessTimeline:
    conditions = []
    if from_ is not None:
        # процесс пересекается с окном, если его активность заканчивается не раньше from
        conditions.append(Process.last_activity_at >= from_)
    if to is not None:
        conditions.append(Process.started_at <= to)

    stmt = select(Process)
    if conditions:
        stmt = stmt.where(and_(*conditions))
    stmt = stmt.order_by(Process.started_at)
    rows = (await db.execute(stmt)).scalars().all()

    entries = [
        ProcessTimelineEntry(
            id=p.id,
            title=p.title,
            status=ProcessStatus(p.status.value),
            area_id=p.area_id,
            project_id=p.project_id,
            start=p.started_at,
            end=_timeline_end(p),
            item_count=p.item_count,
        )
        for p in rows
    ]
    return ProcessTimeline(entries=entries)


@router.post("/processes/freeze")
async def trigger_freeze(
    device: Device = Depends(get_current_device),
) -> dict:
    """Ручной/крон-триггер заморозки процессов по тишине. Возвращает число замороженных."""
    from app.pipeline.runner import freeze_stale_processes

    frozen = await freeze_stale_processes()
    return {"frozen": frozen}


@router.get("/processes", response_model=ProcessPage)
async def list_processes(
    status_filter: ProcessStatus | None = Query(default=None, alias="status"),
    area_id: uuid.UUID | None = Query(default=None),
    project_id: uuid.UUID | None = Query(default=None),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=settings.default_page_limit, le=settings.max_page_limit, gt=0),
    device: Device = Depends(get_current_device),
    db: AsyncSession = Depends(get_db),
) -> ProcessPage:
    conditions = []
    if status_filter is not None:
        conditions.append(Process.status == ORMProcessStatus(status_filter.value))
    if area_id is not None:
        conditions.append(Process.area_id == area_id)
    if project_id is not None:
        conditions.append(Process.project_id == project_id)
    if cursor is not None:
        c_ts, c_id = _decode_cursor(cursor)
        conditions.append(
            or_(
                Process.last_activity_at < c_ts,
                and_(Process.last_activity_at == c_ts, Process.id < c_id),
            )
        )

    stmt = select(Process)
    if conditions:
        stmt = stmt.where(and_(*conditions))
    stmt = stmt.order_by(Process.last_activity_at.desc(), Process.id.desc()).limit(limit + 1)

    rows = (await db.execute(stmt)).scalars().all()
    has_more = len(rows) > limit
    page = rows[:limit]

    next_cursor = None
    if has_more and page:
        last = page[-1]
        next_cursor = _encode_cursor(last.last_activity_at, last.id)

    return ProcessPage(processes=[ProcessSchema.model_validate(p) for p in page], next_cursor=next_cursor)


@router.get("/processes/{process_id}", response_model=ProcessDetail)
async def get_process(
    process_id: uuid.UUID,
    device: Device = Depends(get_current_device),
    db: AsyncSession = Depends(get_db),
) -> ProcessDetail:
    proc = await db.get(Process, process_id)
    if proc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Процесс не найден")

    items = (
        (await db.execute(select(Item).where(Item.process_id == process_id).order_by(Item.created_at)))
        .scalars()
        .all()
    )
    detail = ProcessDetail.model_validate(proc)
    detail.items = [ItemSchema.model_validate(i) for i in items]
    return detail
