"""Абстракция LLM-провайдера (Фаза 2b).

Отделяет LLMRouter от конкретного бэкенда, чтобы соблюсти приватность self-host:
  * AnthropicProvider — облачный API (haiku/opus), минимум данных в запросе.
  * OllamaProvider    — локальная модель, контент не покидает хост.

Провайдер собирается из настроек через build_provider(). Если llm_provider="none"
— возвращается None, и пайплайн работает только на правилах (LLM не вызывается).

Импорты SDK — ленивые (внутри методов), чтобы отсутствие пакета `anthropic`
или недоступность сети не ломали импорт модуля и юнит-тесты правил.
"""
from __future__ import annotations

import json
import logging
from typing import Protocol, runtime_checkable

from app.config import Settings

logger = logging.getLogger(__name__)


@runtime_checkable
class LLMProvider(Protocol):
    async def complete(self, *, model: str, system: str, prompt: str, max_tokens: int) -> str:
        """Вернуть сырой текстовый ответ модели (ожидается JSON-объект внутри)."""
        ...


class AnthropicProvider:
    """Провайдер поверх Anthropic Messages API."""

    def __init__(self, api_key: str, timeout: float) -> None:
        self._api_key = api_key
        self._timeout = timeout
        self._client = None  # ленивая инициализация

    def _get_client(self):
        if self._client is None:
            from anthropic import AsyncAnthropic  # ленивый импорт

            self._client = AsyncAnthropic(api_key=self._api_key, timeout=self._timeout)
        return self._client

    async def complete(self, *, model: str, system: str, prompt: str, max_tokens: int) -> str:
        client = self._get_client()
        resp = await client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": prompt}],
        )
        # Склеиваем текстовые блоки ответа.
        return "".join(block.text for block in resp.content if getattr(block, "type", None) == "text")


class OllamaProvider:
    """Провайдер поверх Ollama (/api/generate).

    Работает и с локальным Ollama (base_url=http://localhost:11434, без ключа —
    данные не покидают хост), и с Ollama Cloud (base_url=https://ollama.com +
    api_key: cloud-модели с суффиксом ':cloud', напр. glm-5.2:cloud, проксируются
    через ollama.com). Ключ передаётся заголовком Authorization: Bearer.
    """

    def __init__(self, base_url: str, timeout: float, api_key: str | None = None) -> None:
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout
        self._api_key = api_key

    async def complete(self, *, model: str, system: str, prompt: str, max_tokens: int) -> str:
        import httpx  # ленивый импорт

        payload = {
            "model": model,
            "system": system,
            "prompt": prompt,
            "stream": False,
            "format": "json",  # Ollama возвращает валидный JSON
            "options": {"num_predict": max_tokens},
        }
        headers = {"Authorization": f"Bearer {self._api_key}"} if self._api_key else {}
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(f"{self._base_url}/api/generate", json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            return data.get("response", "")


def build_provider(settings: Settings) -> LLMProvider | None:
    """Собрать провайдера из настроек. None → пайплайн работает только на правилах."""
    provider = (settings.llm_provider or "none").lower()
    if provider == "none":
        return None
    if provider == "anthropic":
        if not settings.anthropic_api_key:
            logger.warning("llm_provider=anthropic, но ANTHROPIC_API_KEY не задан — LLM отключён.")
            return None
        return AnthropicProvider(settings.anthropic_api_key, settings.llm_timeout_seconds)
    if provider == "ollama":
        return OllamaProvider(
            settings.ollama_base_url, settings.llm_timeout_seconds, api_key=settings.ollama_api_key
        )
    logger.warning("Неизвестный llm_provider=%r — LLM отключён.", provider)
    return None


def parse_json_object(text: str) -> dict:
    """Достать первый JSON-объект из текста ответа модели (терпимо к обёрткам/```)."""
    if not text:
        return {}
    text = text.strip()
    # Срезаем markdown-ограждение ```json ... ```
    if text.startswith("```"):
        text = text.split("```", 2)[1] if text.count("```") >= 2 else text.strip("`")
        if text.lstrip().startswith("json"):
            text = text.lstrip()[4:]
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Фолбэк: вырезать от первой { до последней }.
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            return {}
    return {}
