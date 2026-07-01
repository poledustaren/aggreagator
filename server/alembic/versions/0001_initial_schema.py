"""Начальная схема — 1:1 из server/db/schema.sql (источник истины).

Revision ID: 0001_initial
Revises:
Create Date: 2026-07-01

"""
from pathlib import Path
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# server/db/schema.sql относительно этого файла: alembic/versions/../../db/schema.sql
_SCHEMA_SQL_PATH = Path(__file__).resolve().parents[2] / "db" / "schema.sql"


def upgrade() -> None:
    sql_text = _SCHEMA_SQL_PATH.read_text(encoding="utf-8")
    # schema.sql — набор DDL-операторов, разделённых ';'. Выполняем как единый
    # skript через executescript-подобный подход: разбиваем на стейтменты и
    # выполняем по одному, чтобы избежать проблем с драйверами, не умеющими
    # multi-statement execute в одном execute() (в частности asyncpg через SQLAlchemy).
    for statement in _split_sql_statements(sql_text):
        op.execute(statement)


def downgrade() -> None:
    # Полный откат начальной схемы — сносим всё в обратном порядке FK-зависимостей.
    op.execute('DROP TABLE IF EXISTS classification')
    op.execute('DROP TABLE IF EXISTS rule')
    op.execute('DROP TABLE IF EXISTS raw_notification')
    op.execute('DROP TABLE IF EXISTS item')
    op.execute('DROP TABLE IF EXISTS "group"')
    op.execute('DROP TABLE IF EXISTS project')
    op.execute('DROP TABLE IF EXISTS area')
    op.execute('DROP TABLE IF EXISTS device')
    op.execute('DROP TYPE IF EXISTS classified_by')
    op.execute('DROP TYPE IF EXISTS item_status')


def _split_sql_statements(sql_text: str) -> list[str]:
    """Разбить schema.sql на отдельные операторы по ';' вне строковых литералов.

    Комментарии в schema.sql начинаются с '--' и идут до конца строки —
    убираем их перед разбиением, чтобы ';' внутри комментария не сбивал парсинг
    (в текущем schema.sql такого нет, но это делает разбор устойчивее).
    """
    lines = []
    for line in sql_text.splitlines():
        stripped = line
        comment_pos = stripped.find("--")
        if comment_pos != -1:
            stripped = stripped[:comment_pos]
        lines.append(stripped)
    cleaned = "\n".join(lines)

    statements = [s.strip() for s in cleaned.split(";")]
    return [s for s in statements if s]
