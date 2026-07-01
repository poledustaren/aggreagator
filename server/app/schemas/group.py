import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.item import Item


class Group(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str | None = None
    importance: int
    item_count: int
    area_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    last_activity_at: datetime
    items: list[Item] = []


class GroupPage(BaseModel):
    groups: list[Group]
    next_cursor: str | None = None
