"""Alembic env.py — использует DATABASE_URL из app.config.Settings.

Решение по миграциям: первая ревизия (0001_initial) выполняет server/db/schema.sql
как есть (op.execute), а не переписывает его в SQLAlchemy op.create_table(...).
Причина: schema.sql — источник истины, задан ТЗ Фазы 0/2a; дублирование DDL
в двух представлениях (SQL-файл + Alembic-операции) создавало бы риск расхождения.
Дальнейшие миграции (после 0001) пишутся обычным способом через Alembic-операции.
"""
import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.config import get_settings
from app.db import Base

# ORM-модели должны быть импортированы, чтобы Base.metadata знал обо всех таблицах
# (нужно для потенциального autogenerate в будущих миграциях после 0001).
import app.models  # noqa: F401,E402

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

settings = get_settings()
config.set_main_option("sqlalchemy.url", settings.database_url)


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
