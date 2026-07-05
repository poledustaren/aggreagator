"""Схемы графа связей процессов (раздел «Связи»)."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import ProcessStatus


class GraphNode(BaseModel):
    id: uuid.UUID
    title: str | None
    status: ProcessStatus
    area_id: uuid.UUID | None
    start: datetime           # начало в окне (первое сообщение в промежутке)
    end: datetime             # конец в окне (последнее сообщение в промежутке) — конечен для вида
    item_count: int           # сколько сообщений процесса попало в окно
    importance: int = 0       # важность процесса H7 (для цвета/балла узла-циклона)
    max_importance: int = 0   # пик важности сообщений процесса
    theme: str | None = None  # тема, назначенная LLM


class GraphEdge(BaseModel):
    source: uuid.UUID
    target: uuid.UUID
    relation: str             # тип связи: same_entity | causal | follow_up | same_project | related
    reason: str               # аргументация «почему связаны»
    confidence: float


class GraphTheme(BaseModel):
    name: str
    process_ids: list[uuid.UUID]


class ProcessGraph(BaseModel):
    window_from: datetime | None
    window_to: datetime | None
    nodes: list[GraphNode]
    themes: list[GraphTheme]
    edges: list[GraphEdge]
    truncated: bool = False   # процессов в окне было больше лимита анализа
