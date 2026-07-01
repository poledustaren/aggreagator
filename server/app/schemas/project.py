import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class Project(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    area_id: uuid.UUID
    name: str
    active: bool
    due_at: datetime | None = None


class ProjectInput(BaseModel):
    area_id: uuid.UUID
    name: str
    active: bool = True
    due_at: datetime | None = None
