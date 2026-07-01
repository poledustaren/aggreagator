"""Pydantic-схемы семантического поиска (RAG)."""
from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.item import Item


class SearchRequest(BaseModel):
    query: str = Field(min_length=1)
    limit: int = Field(default=20, ge=1, le=100)


class SearchHit(BaseModel):
    item: Item
    similarity: float  # 1 - cosine_distance


class SearchResponse(BaseModel):
    hits: list[SearchHit]
