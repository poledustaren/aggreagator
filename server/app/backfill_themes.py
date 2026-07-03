"""Бэкфилл тематик для существующих процессов.

Прогоняет Process без theme_id через ThemeLinker (RAG по centroid + LLM attach/new),
в порядке last_activity_at (старые → новые), чтобы дерево тем формировалось
естественно и стабильно. Идемпотентно: только процессы с theme_id IS NULL.

Запуск в контейнере сервера:
    docker compose -f docker-compose.dustar.yml exec -T server python -m app.backfill_themes
"""
import asyncio
import logging

from sqlalchemy import select

from app.db import AsyncSessionLocal
from app.models import Process
from app.pipeline.runner import get_theme_linker

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("backfill-themes")

COMMIT_EVERY = 20


async def main() -> None:
    linker = get_theme_linker()
    if linker is None:
        log.error("RAG/эмбеддер выключен — бэкфилл тем невозможен.")
        return

    async with AsyncSessionLocal() as db:
        procs = (
            (
                await db.execute(
                    select(Process)
                    .where(Process.theme_id.is_(None), Process.centroid.is_not(None))
                    .order_by(Process.last_activity_at.asc())
                )
            )
            .scalars()
            .all()
        )
        total = len(procs)
        log.info("Процессов без темы: %d", total)
        if total == 0:
            return

        done = 0
        errors = 0
        for p in procs:
            try:
                await linker.assign(db, p, now=p.last_activity_at)
            except Exception:
                errors += 1
                log.exception("Ошибка на процессе %s", p.id)
            done += 1
            if done % COMMIT_EVERY == 0:
                await db.commit()
                log.info("… %d/%d", done, total)
        await db.commit()
        log.info("Готово: обработано %d, ошибок %d", done, errors)


if __name__ == "__main__":
    asyncio.run(main())
