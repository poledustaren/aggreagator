"""Async SQLAlchemy engine/session.

Решение: используем async SQLAlchemy 2.0 (Core + ORM-модели как DeclarativeBase),
а не asyncpg напрямую. Обоснование:
  - Alembic из коробки умеет работать с SQLAlchemy metadata (autogenerate),
    но мы всё равно держим schema.sql как источник истины и первую ревизию
    делаем через op.execute(schema.sql) — см. alembic/versions/0001_initial.py.
  - ORM даёт типизированный доступ и упрощает построение динамических фильтров
    в GET /items (importance_min, area_id, project_id, tag, status, from) без
    ручной склейки SQL-строк.
  - asyncpg используется под капотом как драйвер (postgresql+asyncpg://...),
    так что производительность сопоставима с "сырым" asyncpg.
"""
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings

settings = get_settings()

engine = create_async_engine(settings.database_url, echo=settings.sql_echo, pool_pre_ping=True)

AsyncSessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)


class Base(DeclarativeBase):
    """Базовый класс для всех ORM-моделей."""


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI-зависимость: сессия БД на один запрос."""
    async with AsyncSessionLocal() as session:
        yield session
