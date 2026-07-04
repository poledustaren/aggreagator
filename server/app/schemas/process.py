"""Pydantic-схемы процессов (RAG-надстройка)."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.common import ProcessStatus
from app.schemas.item import Item


class Process(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str | None
    summary: str | None
    status: ProcessStatus
    area_id: uuid.UUID | None
    project_id: uuid.UUID | None
    started_at: datetime
    last_activity_at: datetime
    ended_at: datetime | None
    item_count: int
    # Важность процесса (H7): пик важности сообщений × свежесть × открытость.
    # Считается на лету из сообщений; заменяет прежний «heat по числу событий».
    importance: int = 0
    max_importance: int = 0


class ProcessDetail(Process):
    items: list[Item] = []


class ProcessPage(BaseModel):
    processes: list[Process]
    next_cursor: str | None = None


class ProcessTimelineEntry(BaseModel):
    """Спан процесса для vis-timeline.

    end: конец полосы — ended_at (closed), last_activity_at (frozen) или null (open/идёт →
    фронт рисует до «сейчас» с открытым концом).
    """

    id: uuid.UUID
    title: str | None
    status: ProcessStatus
    area_id: uuid.UUID | None
    project_id: uuid.UUID | None
    start: datetime
    end: datetime | None
    item_count: int


class ProcessTimeline(BaseModel):
    entries: list[ProcessTimelineEntry]
