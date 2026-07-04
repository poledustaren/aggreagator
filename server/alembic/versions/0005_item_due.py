"""Сроки на item'ах: due_at + due_kind (H9 — извлечение дедлайнов LLM).

LLM-классификатор теперь вычленяет из текста уведомления абсолютный срок
(оплатить до…, встреча в…, доставка…) и его тип. Храним, показываем на карточке
и используем в оси «срочность» и в важности процесса.

revision: 0005_item_due
down_revision: 0004_dedup_items
"""
from typing import Union

from alembic import op

revision: str = "0005_item_due"
down_revision: Union[str, None] = "0004_dedup_items"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE item ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ")
    op.execute("ALTER TABLE item ADD COLUMN IF NOT EXISTS due_kind TEXT")
    # Частичный индекс — сортировка/фильтр по ближайшим срокам без веса пустых.
    op.execute("CREATE INDEX IF NOT EXISTS item_due_at_idx ON item (due_at) WHERE due_at IS NOT NULL")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS item_due_at_idx")
    op.execute("ALTER TABLE item DROP COLUMN IF EXISTS due_kind")
    op.execute("ALTER TABLE item DROP COLUMN IF EXISTS due_at")
