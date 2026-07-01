import uuid

from pydantic import BaseModel, ConfigDict


class Area(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    color: str | None = None
    sort: int


class AreaInput(BaseModel):
    name: str
    color: str | None = None
    sort: int = 0
