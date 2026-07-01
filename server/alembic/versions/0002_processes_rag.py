"""Процессы, RAG (pgvector), эмбеддинги.

Надстройка над 0001: расширение vector, эмбеддинги у item, таблица process
с жизненным циклом (open/frozen/closed) и centroid-вектором, привязка item→process.

revision: 0002_processes_rag
down_revision: 0001_initial
"""
from typing import Union

from alembic import op

revision: str = "0002_processes_rag"
down_revision: Union[str, None] = "0001_initial"
branch_labels = None
depends_on = None

EMBED_DIM = 1024  # bge-m3


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.execute("CREATE TYPE process_status AS ENUM ('open', 'frozen', 'closed')")

    op.execute(
        f"""
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
            centroid         vector({EMBED_DIM})
        )
        """
    )
    op.execute("CREATE INDEX process_status_idx ON process (status, last_activity_at DESC)")
    op.execute("CREATE INDEX process_area_idx ON process (area_id)")
    op.execute("CREATE INDEX process_project_idx ON process (project_id)")
    # HNSW-индекс по centroid для быстрого cosine-поиска кандидатов.
    op.execute(
        "CREATE INDEX process_centroid_idx ON process USING hnsw (centroid vector_cosine_ops)"
    )

    # item: эмбеддинг + привязка к процессу
    op.execute(f"ALTER TABLE item ADD COLUMN embedding vector({EMBED_DIM})")
    op.execute("ALTER TABLE item ADD COLUMN process_id UUID REFERENCES process(id) ON DELETE SET NULL")
    op.execute("CREATE INDEX item_process_idx ON item (process_id)")
    op.execute("CREATE INDEX item_embedding_idx ON item USING hnsw (embedding vector_cosine_ops)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS item_embedding_idx")
    op.execute("DROP INDEX IF EXISTS item_process_idx")
    op.execute("ALTER TABLE item DROP COLUMN IF EXISTS process_id")
    op.execute("ALTER TABLE item DROP COLUMN IF EXISTS embedding")
    op.execute("DROP TABLE IF EXISTS process")
    op.execute("DROP TYPE IF EXISTS process_status")
    # vector-расширение не трогаем — может использоваться ещё где-то.
