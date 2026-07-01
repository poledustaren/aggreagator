"""Pydantic-схемы статистики."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class StatusCounts(BaseModel):
    inbox: int = 0
    snoozed: int = 0
    done: int = 0
    dismissed: int = 0


class ImportanceBuckets(BaseModel):
    low: int = 0    # 0..33
    mid: int = 0    # 34..66
    high: int = 0   # 67..100


class ProcessCounts(BaseModel):
    open: int = 0
    frozen: int = 0
    closed: int = 0
    total: int = 0


class Overview(BaseModel):
    total_items: int
    by_status: StatusCounts
    by_importance: ImportanceBuckets
    items_last_7d: int
    processes: ProcessCounts


class AreaStat(BaseModel):
    area_id: uuid.UUID | None
    area_name: str | None
    item_count: int
    avg_importance: float


class SourceStat(BaseModel):
    source_app: str
    item_count: int


class TimelineBucket(BaseModel):
    bucket_start: datetime
    count: int


class TimelineStats(BaseModel):
    bucket: str  # day | week | month
    buckets: list[TimelineBucket]
