"""Провайдер эмбеддингов для RAG (процессы, семантический поиск).

bge-m3 (1024d) через Ollama /api/embed. Ollama Cloud НЕ хостит emb-модели, поэтому
по умолчанию считаем на локальном/хостовом Ollama (embed_base_url). Контент при
этом не покидает хост — плюс к приватности.

Импорт httpx ленивый; при embed_provider="none" эмбеддер не создаётся и весь
RAG-слой (привязка к процессам) отключается — сервер продолжает работать.
"""
from __future__ import annotations

import logging
from typing import Protocol, runtime_checkable

from app.config import Settings

logger = logging.getLogger(__name__)


@runtime_checkable
class EmbeddingProvider(Protocol):
    async def embed(self, text: str) -> list[float]:
        """Вернуть эмбеддинг текста (список float длиной embed_dim)."""
        ...


class OllamaEmbeddingProvider:
    def __init__(self, base_url: str, model: str, timeout: float, api_key: str | None = None) -> None:
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._timeout = timeout
        self._api_key = api_key

    async def embed(self, text: str) -> list[float]:
        import httpx  # ленивый импорт

        headers = {"Authorization": f"Bearer {self._api_key}"} if self._api_key else {}
        payload = {"model": self._model, "input": text or ""}
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(f"{self._base_url}/api/embed", json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()
        # /api/embed возвращает {"embeddings": [[...]]}; на батч из одного input — первый вектор.
        embeddings = data.get("embeddings") or []
        if embeddings:
            return embeddings[0]
        # Совместимость со старым /api/embeddings {"embedding": [...]}
        if "embedding" in data:
            return data["embedding"]
        raise ValueError("Ollama embed: пустой ответ без embeddings")


def build_embedder(settings: Settings) -> EmbeddingProvider | None:
    """Собрать эмбеддер из настроек. None → RAG/процессы отключены."""
    provider = (settings.embed_provider or "none").lower()
    if provider == "none":
        return None
    if provider == "ollama":
        return OllamaEmbeddingProvider(
            settings.embed_base_url, settings.embed_model, settings.llm_timeout_seconds, settings.embed_api_key
        )
    logger.warning("Неизвестный embed_provider=%r — RAG отключён.", provider)
    return None
