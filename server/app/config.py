"""Конфигурация приложения через pydantic-settings.

Значения читаются из переменных окружения (или .env файла в server/).
См. .env.example для полного списка и значений по умолчанию.
"""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+asyncpg://aggregat:aggregat@localhost:5432/aggregat"
    log_level: str = "info"
    sql_echo: bool = False

    # Пагинация
    default_page_limit: int = 50
    max_page_limit: int = 200

    # CORS: дашборд может обслуживаться с другого origin, чем API (напр. сайт :8081,
    # API :8000). CSV списком или "*" (self-host, авторизация по Bearer-заголовку, не cookie).
    cors_allow_origins: str = "*"

    # Пароль для входа на дашборд/регистрации устройства (общий, self-host).
    # Пустой → пароль-вход выключен, регистрация открыта (как раньше). Берётся из
    # env WEB_PASSWORD (server/.env). Токен устройства работает независимо от пароля.
    web_password: str | None = None

    # ── Классификация (Фаза 2b) ──────────────────────────────────────────
    # Провайдер LLM: "none" (только правила), "anthropic" (API) или "ollama" (локально).
    # Приватность self-host: при "ollama" контент уведомлений не покидает хост.
    llm_provider: str = "none"
    anthropic_api_key: str | None = None
    # Ollama: локально http://localhost:11434 (без ключа) или Ollama Cloud
    # https://ollama.com + ollama_api_key (cloud-модели вида glm-5.2:cloud).
    ollama_base_url: str = "http://localhost:11434"
    ollama_api_key: str | None = None

    # Роутер моделей: рутина → routine, неоднозначное/длинное → hard.
    llm_model_routine: str = "claude-haiku-4-5-20251001"
    llm_model_hard: str = "claude-opus-4-8"
    # Ollama-модели (если провайдер ollama).
    ollama_model_routine: str = "llama3.1:8b"
    ollama_model_hard: str = "llama3.1:70b"

    # Эвристика эскалации: длиннее порога (символов) → hard-модель.
    llm_escalation_char_threshold: int = 280
    # Потолок ответа. Кириллица «дорогая» по токенам, а JSON подрос (due_at/due_kind),
    # поэтому 512 иногда обрезал ответ на полуслове → неразбираемо → нейтральный фолбэк.
    # 1024 даёт запас, чтобы JSON всегда закрывался.
    llm_max_tokens: int = 1024
    llm_timeout_seconds: float = 30.0
    # Дефолтная уверенность, если модель не вернула своё значение.
    llm_default_confidence: float = 0.6

    # ── Эмбеддинги / RAG (процессы) ──────────────────────────────────────
    # Ollama Cloud НЕ хостит emb-модели → bge-m3 крутим локально/на хосте.
    # Для сервера в docker до хостового Ollama: http://host.docker.internal:11434
    embed_provider: str = "ollama"          # ollama | none (none → RAG/процессы выключены)
    embed_base_url: str = "http://host.docker.internal:11434"
    embed_api_key: str | None = None        # для будущих облачных emb, локальному не нужен
    embed_model: str = "bge-m3"
    embed_dim: int = 1024

    # Привязка к процессу (RAG)
    process_link_top_k: int = 5             # сколько кандидатов тянуть из vector-поиска
    process_link_sim_threshold: float = 0.55  # порог cosine-похожести для эвристики без LLM
    process_recency_days: int = 30          # окно недавности кандидатов-процессов
    process_freeze_idle_days: int = 7       # тишина ≥ N дней → процесс замораживается

    # ── Обучение на смахиваниях («пежня») ────────────────────────────────
    # Смахнул один item → похожие по эмбеддингу гасятся; новые похожие на ранее
    # смахнутые — авто-dismiss на входе. Порог высокий: гасим только near-дубли.
    junk_sim_threshold: float = 0.90        # cosine-похожесть ≥ порога → «пежня»
    junk_lookback_days: int = 30            # окно «памяти» смахнутых для авто-dismiss
    junk_learning_enabled: bool = True      # рубильник всей петли

    # ── Граф связей ──────────────────────────────────────────────────────
    # Кэш готового графа в памяти: повторные открытия «Связей» без LLM-перегенерации.
    graph_cache_ttl_seconds: int = 1800     # 30 мин; 0 — кэш выключен


@lru_cache
def get_settings() -> Settings:
    return Settings()
