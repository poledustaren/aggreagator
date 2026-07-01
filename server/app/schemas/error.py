from pydantic import BaseModel


class Error(BaseModel):
    error: str
    detail: str | None = None
