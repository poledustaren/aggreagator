"""POST /v1/search — семантический поиск по items (RAG, pgvector)."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_device
from app.config import get_settings
from app.db import get_db
from app.models import Device, Item
from app.pipeline.embeddings import build_embedder
from app.schemas.item import Item as ItemSchema
from app.schemas.search import SearchHit, SearchRequest, SearchResponse

router = APIRouter(tags=["search"])


@router.post("/search", response_model=SearchResponse)
async def search(
    payload: SearchRequest,
    device: Device = Depends(get_current_device),
    db: AsyncSession = Depends(get_db),
) -> SearchResponse:
    embedder = build_embedder(get_settings())
    if embedder is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Семантический поиск недоступен: эмбеддер выключен (embed_provider=none).",
        )

    try:
        query_emb = await embedder.embed(payload.query)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Ошибка эмбеддинга запроса.",
        ) from exc

    distance = Item.embedding.cosine_distance(query_emb)
    stmt = (
        select(Item, distance.label("dist"))
        .where(Item.embedding.is_not(None))
        .order_by(distance)
        .limit(payload.limit)
    )
    rows = (await db.execute(stmt)).all()

    hits = [
        SearchHit(item=ItemSchema.model_validate(item), similarity=round(1.0 - float(dist), 4))
        for item, dist in rows
    ]
    return SearchResponse(hits=hits)
