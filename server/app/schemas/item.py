import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import ClassifiedBy, ItemStatus


class Item(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str | None = None
    summary: str | None = None
    importance: int = Field(ge=0, le=100)
    status: ItemStatus
    suggested_action: str | None = None
    area_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    group_id: uuid.UUID | None = None
    process_id: uuid.UUID | None = None
    tags: list[str] = Field(default_factory=list)
    source_apps: list[str] = Field(default_factory=list)
    classified_by: ClassifiedBy | None = None
    confidence: float | None = Field(default=None, ge=0, le=1)
    snoozed_until: datetime | None = None
    created_at: datetime
    updated_at: datetime


class ItemPatch(BaseModel):
    """Все поля опциональны — PATCH семантика.

    Ручная установка area_id/project_id/tags фиксируется как classified_by=manual
    (см. app/api/items.py) и в будущем (Фаза 2b) используется как обучающий
    сигнал для RulesEngine.
    """

    status: ItemStatus | None = None
    snoozed_until: datetime | None = None
    area_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    tags: list[str] | None = None


class ItemPage(BaseModel):
    items: list[Item]
    next_cursor: str | None = None
