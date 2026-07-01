"""Фикстуры pytest для интеграционных тестов сервера.

ВАЖНО: тесты требуют реального PostgreSQL (используются TEXT[], JSONB и
Postgres-специфичные enum-типы из schema.sql — SQLite-совместимость не
гарантируется и намеренно не поддерживается, см. ТЗ Фазы 2a).

БД берётся из переменной окружения TEST_DATABASE_URL (по умолчанию —
локальный docker-compose postgres на 5432 с БД aggregat_test). Перед запуском
тестов база должна существовать и быть пустой либо содержать актуальную схему
(conftest сам применяет schema.sql в начале сессии и чистит таблицы между тестами).

Если Postgres недоступен, тесты, использующие фикстуру `db_session`/`client`,
будут падать на этапе подключения — это ожидаемо в средах без докера.
"""
import os
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

os.environ.setdefault(
    "DATABASE_URL",
    os.environ.get("TEST_DATABASE_URL", "postgresql+asyncpg://aggregat:aggregat@localhost:5432/aggregat_test"),
)

from app.db import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402

TEST_DATABASE_URL = os.environ["DATABASE_URL"]

_SCHEMA_SQL_PATH = Path(__file__).resolve().parents[1] / "db" / "schema.sql"

# DDL миграции 0002 (процессы/RAG). schema.sql — baseline 0001, поэтому применяем
# 0002 поверх. ТРЕБУЕТ образ pgvector/pgvector:pg16 (расширение vector + тип vector).
_MIGRATION_0002_SQL = """
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TYPE process_status AS ENUM ('open', 'frozen', 'closed');
CREATE TABLE process (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title            TEXT,
    summary          TEXT,
    status           process_status NOT NULL DEFAULT 'open',
    area_id          UUID REFERENCES area(id) ON DELETE SET NULL,
    project_id       UUID REFERENCES project(id) ON DELETE SET NULL,
    started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at         TIMESTAMPTZ,
    item_count       INTEGER NOT NULL DEFAULT 0,
    centroid         vector(1024)
);
CREATE INDEX process_status_idx ON process (status, last_activity_at DESC);
CREATE INDEX process_area_idx ON process (area_id);
CREATE INDEX process_project_idx ON process (project_id);
CREATE INDEX process_centroid_idx ON process USING hnsw (centroid vector_cosine_ops);
ALTER TABLE item ADD COLUMN embedding vector(1024);
ALTER TABLE item ADD COLUMN process_id UUID REFERENCES process(id) ON DELETE SET NULL;
CREATE INDEX item_process_idx ON item (process_id);
CREATE INDEX item_embedding_idx ON item USING hnsw (embedding vector_cosine_ops);
"""


def _split_sql_statements(sql_text: str) -> list[str]:
    lines = []
    for line in sql_text.splitlines():
        pos = line.find("--")
        lines.append(line[:pos] if pos != -1 else line)
    cleaned = "\n".join(lines)
    return [s.strip() for s in cleaned.split(";") if s.strip()]


@pytest_asyncio.fixture(scope="session")
async def _engine():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)

    # Применяем schema.sql один раз на сессию тестов (идемпотентно: DROP SCHEMA public CASCADE
    # перед применением, чтобы повторные прогоны не падали на "already exists").
    async with engine.begin() as conn:
        await conn.execute(text("DROP SCHEMA public CASCADE"))
        await conn.execute(text("CREATE SCHEMA public"))
        sql_text = _SCHEMA_SQL_PATH.read_text(encoding="utf-8")
        for statement in _split_sql_statements(sql_text):
            await conn.execute(text(statement))
        # Поверх baseline — миграция 0002 (процессы/RAG).
        for statement in _split_sql_statements(_MIGRATION_0002_SQL):
            await conn.execute(text(statement))

    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def _session_maker(_engine):
    return async_sessionmaker(bind=_engine, expire_on_commit=False)


@pytest_asyncio.fixture
async def db_session(_engine, _session_maker) -> AsyncSession:
    """Отдельная сессия для прямой подготовки данных тестом (INSERT фикстур и т.п.).

    Каждый HTTP-запрос через `client` открывает СВОЮ сессию (как в проде,
    см. app.db.get_db) — иначе одна AsyncSession, шарящаяся между тестовым
    кодом и ASGI-приложением, ловит asyncpg InterfaceError при пересекающихся
    операциях (greenlet-конкурентность). Изоляция между тестами — через
    TRUNCATE после каждого теста, а не через отдельную транзакцию с rollback,
    чтобы данные, вставленные HTTP-запросами (в других сессиях), были видны
    и тестовому коду, и наоборот (autocommit-подобное поведение, как в проде).
    """
    async with _session_maker() as session:
        yield session

    async with _engine.begin() as conn:
        await conn.execute(
            text(
                "TRUNCATE TABLE classification, raw_notification, item, \"group\", "
                "process, project, area, rule, device RESTART IDENTITY CASCADE"
            )
        )


@pytest_asyncio.fixture
async def client(_engine, _session_maker, db_session):
    """httpx AsyncClient поверх ASGI-приложения с переопределённой зависимостью get_db.

    override создаёт НОВУЮ сессию на каждый запрос (как настоящий get_db),
    чтобы не делить одну AsyncSession между параллельными/последовательными
    операциями теста и приложения.
    """

    async def _override_get_db():
        async with _session_maker() as session:
            yield session

    app.dependency_overrides[get_db] = _override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver/v1") as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def registered_device(client: AsyncClient) -> dict:
    """Регистрирует устройство и возвращает {"device_id":..., "token":...}."""
    resp = await client.post(
        "/devices:register",
        json={"platform": "android", "device_name": "test-phone"},
    )
    assert resp.status_code == 201
    return resp.json()


@pytest_asyncio.fixture
async def auth_headers(registered_device: dict) -> dict:
    return {"Authorization": f"Bearer {registered_device['token']}"}
