"""Тематики (persistent themes) — дерево тем над процессами.

Надстройка над 0002: таблица theme (иерархия через parent_id, centroid для RAG,
глубина для контроля 2-4 уровней) + привязка process→theme. Темы ведутся
инкрементально (theme_linker: attach/new), НЕ регенерятся при каждом открытии.

revision: 0003_themes
down_revision: 0002_processes_rag
"""
from typing import Union

from alembic import op

revision: str = "0003_themes"
down_revision: Union[str, None] = "0002_processes_rag"
branch_labels = None
depends_on = None

EMBED_DIM = 1024  # bge-m3


def upgrade() -> None:
    op.execute(
        f"""
        CREATE TABLE theme (
            id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name             TEXT NOT NULL,
            parent_id        UUID REFERENCES theme(id) ON DELETE SET NULL,
            summary          TEXT,
            depth            INTEGER NOT NULL DEFAULT 0,
            member_count     INTEGER NOT NULL DEFAULT 0,
            centroid         vector({EMBED_DIM}),
            created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
            last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX theme_parent_idx ON theme (parent_id)")
    op.execute("CREATE INDEX theme_activity_idx ON theme (last_activity_at DESC)")
    op.execute("CREATE INDEX theme_centroid_idx ON theme USING hnsw (centroid vector_cosine_ops)")

    op.execute("ALTER TABLE process ADD COLUMN theme_id UUID REFERENCES theme(id) ON DELETE SET NULL")
    op.execute("CREATE INDEX process_theme_idx ON process (theme_id)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS process_theme_idx")
    op.execute("ALTER TABLE process DROP COLUMN IF EXISTS theme_id")
    op.execute("DROP INDEX IF EXISTS theme_centroid_idx")
    op.execute("DROP INDEX IF EXISTS theme_activity_idx")
    op.execute("DROP INDEX IF EXISTS theme_parent_idx")
    op.execute("DROP TABLE IF EXISTS theme")
