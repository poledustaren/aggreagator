from datetime import datetime

from pydantic import BaseModel, ConfigDict


class RawNotificationIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    client_id: str
    source_app: str
    app_label: str | None = None
    title: str | None = None
    text: str | None = None
    subtext: str | None = None
    category: str | None = None
    posted_at: datetime
    extras: dict | None = None


class IngestRequest(BaseModel):
    notifications: list[RawNotificationIn]


class IngestResponse(BaseModel):
    accepted: int
    duplicates: int
