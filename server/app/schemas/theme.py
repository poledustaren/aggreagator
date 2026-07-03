"""Схемы тематик (persistent themes) для главной и раздела тем."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class ThemeNode(BaseModel):
    id: uuid.UUID
    name: str
    parent_id: uuid.UUID | None
    depth: int
    summary: str | None
    last_activity_at: datetime
    inbox_count: int        # актуальных (inbox) сообщений прямо в этой теме
    max_importance: int     # макс. важность актуальных сообщений темы
    process_count: int      # сколько процессов привязано к теме


class ThemeList(BaseModel):
    themes: list[ThemeNode]
