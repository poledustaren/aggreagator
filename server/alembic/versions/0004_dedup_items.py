"""Схлопывание накопившихся дублей inbox-item'ов.

Одно и то же уведомление перевыкладывалось Android'ом с новым client_id →
каждый raw становился отдельным Item. На главной (status=inbox) копились точные
повторы («2569 при 2084 уникальных»). Здесь одноразово гасим лишние копии:
внутри группы (source_app, normalize(title), normalize(summary)) оставляем самый
свежий inbox-item, остальные переводим в 'dismissed' (обратимо, данные не удаляем).

Будущие повторы предотвращаются на входе — app/pipeline/dedup.py.

revision: 0004_dedup_items
down_revision: 0003_themes
"""
from typing import Union

from alembic import op

revision: str = "0004_dedup_items"
down_revision: Union[str, None] = "0003_themes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # normalize(x) = lower(collapse-whitespace(trim(x))) — совпадает с _norm в dedup.py.
    # Партиционируем по source_apps (массив), нормализованным title и summary.
    op.execute(
        r"""
        WITH ranked AS (
            SELECT
                id,
                row_number() OVER (
                    PARTITION BY
                        source_apps,
                        lower(btrim(regexp_replace(coalesce(title, ''),   '\s+', ' ', 'g'))),
                        lower(btrim(regexp_replace(coalesce(summary, ''), '\s+', ' ', 'g')))
                    ORDER BY created_at DESC, id DESC
                ) AS rn
            FROM item
            WHERE status = 'inbox'
              AND (coalesce(title, '') <> '' OR coalesce(summary, '') <> '')
        )
        UPDATE item
        SET status = 'dismissed', updated_at = now()
        WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
        """
    )


def downgrade() -> None:
    # Одноразовая уборка данных — откат не восстанавливает прежние статусы.
    pass
