"""GET /v1/stats/* — агрегированная статистика для дашборда."""
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import Integer, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_device
from app.db import get_db
from app.models import Area, Device, Item, Process
from app.models.entities import ItemStatus as ORMItemStatus
from app.models.entities import ProcessStatus as ORMProcessStatus
from app.schemas.stats import (
    AreaStat,
    ImportanceBuckets,
    Overview,
    ProcessCounts,
    SourceStat,
    StatusCounts,
    TimelineBucket,
    TimelineStats,
)

router = APIRouter(tags=["stats"])

_BUCKETS = {"day", "week", "month"}


@router.get("/stats/overview", response_model=Overview)
async def stats_overview(
    device: Device = Depends(get_current_device),
    db: AsyncSession = Depends(get_db),
) -> Overview:
    total_items = (await db.execute(select(func.count(Item.id)))).scalar_one()

    # Счётчики по статусам одним запросом.
    status_rows = (
        await db.execute(select(Item.status, func.count(Item.id)).group_by(Item.status))
    ).all()
    by_status = StatusCounts()
    for st, cnt in status_rows:
        setattr(by_status, st.value, cnt)

    # Бакеты важности.
    imp = ImportanceBuckets(
        low=(await db.execute(select(func.count(Item.id)).where(Item.importance <= 33))).scalar_one(),
        mid=(
            await db.execute(
                select(func.count(Item.id)).where(Item.importance.between(34, 66))
            )
        ).scalar_one(),
        high=(await db.execute(select(func.count(Item.id)).where(Item.importance >= 67))).scalar_one(),
    )

    week_ago = datetime.now(UTC) - timedelta(days=7)
    items_last_7d = (
        await db.execute(select(func.count(Item.id)).where(Item.created_at >= week_ago))
    ).scalar_one()

    proc_rows = (
        await db.execute(select(Process.status, func.count(Process.id)).group_by(Process.status))
    ).all()
    pc = ProcessCounts()
    for st, cnt in proc_rows:
        setattr(pc, st.value, cnt)
    pc.total = pc.open + pc.frozen + pc.closed

    return Overview(
        total_items=total_items,
        by_status=by_status,
        by_importance=imp,
        items_last_7d=items_last_7d,
        processes=pc,
    )


@router.get("/stats/by-area", response_model=list[AreaStat])
async def stats_by_area(
    device: Device = Depends(get_current_device),
    db: AsyncSession = Depends(get_db),
) -> list[AreaStat]:
    stmt = (
        select(
            Item.area_id,
            Area.name,
            func.count(Item.id),
            func.coalesce(func.avg(Item.importance), 0.0),
        )
        .select_from(Item)
        .outerjoin(Area, Area.id == Item.area_id)
        .group_by(Item.area_id, Area.name)
        .order_by(func.count(Item.id).desc())
    )
    rows = (await db.execute(stmt)).all()
    return [
        AreaStat(area_id=aid, area_name=name, item_count=cnt, avg_importance=round(float(avg), 1))
        for aid, name, cnt, avg in rows
    ]


@router.get("/stats/by-source", response_model=list[SourceStat])
async def stats_by_source(
    device: Device = Depends(get_current_device),
    db: AsyncSession = Depends(get_db),
) -> list[SourceStat]:
    # source_apps — массив; разворачиваем в строки и считаем.
    src = func.unnest(Item.source_apps).label("src")
    stmt = select(src, func.count()).group_by(src).order_by(func.count().desc())
    rows = (await db.execute(stmt)).all()
    return [SourceStat(source_app=s, item_count=cnt) for s, cnt in rows]


@router.get("/stats/timeline", response_model=TimelineStats)
async def stats_timeline(
    bucket: str = Query(default="day"),
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
    device: Device = Depends(get_current_device),
    db: AsyncSession = Depends(get_db),
) -> TimelineStats:
    if bucket not in _BUCKETS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="bucket: day|week|month")

    trunc = func.date_trunc(bucket, Item.created_at).label("b")
    conditions = []
    if from_ is not None:
        conditions.append(Item.created_at >= from_)
    if to is not None:
        conditions.append(Item.created_at <= to)

    stmt = select(trunc, func.count(Item.id))
    if conditions:
        from sqlalchemy import and_

        stmt = stmt.where(and_(*conditions))
    stmt = stmt.group_by(trunc).order_by(trunc)

    rows = (await db.execute(stmt)).all()
    buckets = [TimelineBucket(bucket_start=b, count=cnt) for b, cnt in rows]
    return TimelineStats(bucket=bucket, buckets=buckets)
