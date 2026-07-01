"""Точка входа FastAPI-приложения Aggregat.

Роутеры смонтированы под префиксом /v1 согласно contracts/openapi.yaml.
Фазы: 2a (ingestion/CRUD), 2b (классификация), процессы+RAG+статистика.
"""
import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import areas, devices, groups, ingest, items, processes, projects, rules, search, stats, tags
from app.config import get_settings

logger = logging.getLogger(__name__)


async def _freeze_loop() -> None:
    """Периодически замораживает процессы по тишине (раз в 6 часов)."""
    from app.pipeline.runner import freeze_stale_processes

    while True:
        await asyncio.sleep(6 * 3600)
        try:
            await freeze_stale_processes()
        except Exception:
            logger.exception("Периодическая заморозка процессов упала")


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Фоновая заморозка запускается только если RAG/процессы включены (есть эмбеддер).
    task: asyncio.Task | None = None
    if (get_settings().embed_provider or "none").lower() != "none":
        task = asyncio.create_task(_freeze_loop())
    try:
        yield
    finally:
        if task is not None:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task


app = FastAPI(
    title="Aggregat API",
    version="1.1.0",
    description=(
        "Сервер агрегации пуш-уведомлений: ingestion, CRUD Area/Project/Rule, лента Item, "
        "группы, классификация (правила+LLM), процессы во времени (RAG/pgvector), "
        "семантический поиск и статистика."
    ),
    lifespan=lifespan,
)

# CORS для веб-дашборда (может быть на другом origin, чем API — см. cors_allow_origins).
_cors_origins = [o.strip() for o in (get_settings().cors_allow_origins or "").split(",") if o.strip()] or ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

for _module in (devices, ingest, items, groups, areas, projects, rules, tags, processes, stats, search):
    app.include_router(_module.router, prefix="/v1")


@app.get("/health", tags=["health"])
async def health() -> dict:
    return {"status": "ok"}
