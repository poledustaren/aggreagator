"""Бэкфилл процессов для существующих Item.

Прогоняет Item без process_id через ProcessLinker (эмбеддинг + RAG-привязка),
используя item.created_at как event_time — чтобы started_at/last_activity_at
процессов и таймлайн соответствовали реальному времени уведомлений, а не моменту
бэкфилла. Порядок — хронологический (старые → новые), чтобы процессы формировались
естественно (начинается с раннего Item, растёт последующими).

Идемпотентно: обрабатывает только Item с process_id IS NULL — можно перезапускать.

Запуск в контейнере сервера:
    docker compose -f docker-compose.dustar.yml exec -T server python -m app.backfill_processes
"""
import asyncio
import logging

from sqlalchemy import func, select

from app.db import AsyncSessionLocal
from app.models import Item, Process
from app.pipeline.runner import get_process_linker

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("backfill")

COMMIT_EVERY = 25


async def main() -> None:
    linker = get_process_linker()
    if linker is None:
        log.error("Эмбеддер выключен (EMBED_PROVIDER=none) — бэкфилл невозможен.")
        return

    async with AsyncSessionLocal() as db:
        items = (
            (
                await db.execute(
                    select(Item).where(Item.process_id.is_(None)).order_by(Item.created_at.asc())
                )
            )
            .scalars()
            .all()
        )
        total = len(items)
        log.info("К обработке Item без процесса: %d", total)
        if total == 0:
            log.info("Нечего бэкфиллить.")
            return

        done = 0
        errors = 0
        for it in items:
            try:
                await linker.link(db, it, event_time=it.created_at)
            except Exception:
                errors += 1
                log.exception("Ошибка на item %s", it.id)
            done += 1
            if done % COMMIT_EVERY == 0:
                await db.commit()
                log.info("... %d/%d (процессов: %d)", done, total, await _proc_count(db))

        await db.commit()
        log.info(
            "ГОТОВО. Обработано %d/%d (ошибок %d), процессов всего: %d",
            done,
            total,
            errors,
            await _proc_count(db),
        )


async def _proc_count(db) -> int:
    return (await db.execute(select(func.count(Process.id)))).scalar_one()


if __name__ == "__main__":
    asyncio.run(main())
