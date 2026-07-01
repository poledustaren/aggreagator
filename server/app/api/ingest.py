"""POST /v1/notifications:ingest — батч сырых уведомлений, Bearer-авторизация.

Идемпотентность: уникальный индекс raw_notification_idem_idx (device_id, client_id)
в schema.sql. Используем INSERT ... ON CONFLICT DO NOTHING построчно в рамках
одной транзакции и считаем accepted/duplicates по факту наличия returning-строки.

После коммита ставим фоновую задачу (BackgroundTasks) на классификационный
пайплайн — ingest отвечает 202 сразу, не дожидаясь классификации/группировки.
"""
from fastapi import APIRouter, BackgroundTasks, Depends, status
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_device
from app.db import get_db
from app.models import Device, RawNotification
from app.pipeline.runner import run_pipeline_for_raw_notifications
from app.schemas.ingest import IngestRequest, IngestResponse

router = APIRouter(tags=["ingest"])


@router.post(
    "/notifications:ingest",
    response_model=IngestResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def ingest_notifications(
    payload: IngestRequest,
    background_tasks: BackgroundTasks,
    device: Device = Depends(get_current_device),
    db: AsyncSession = Depends(get_db),
) -> IngestResponse:
    accepted = 0
    duplicates = 0
    inserted_ids: list = []

    for notif in payload.notifications:
        stmt = (
            pg_insert(RawNotification)
            .values(
                device_id=device.id,
                client_id=notif.client_id,
                source_app=notif.source_app,
                app_label=notif.app_label,
                title=notif.title,
                text=notif.text,
                subtext=notif.subtext,
                category=notif.category,
                posted_at=notif.posted_at,
                extras=notif.extras,
            )
            .on_conflict_do_nothing(index_elements=[RawNotification.device_id, RawNotification.client_id])
            .returning(RawNotification.id)
        )
        result = await db.execute(stmt)
        new_id = result.scalar_one_or_none()
        if new_id is not None:
            accepted += 1
            inserted_ids.append(new_id)
        else:
            duplicates += 1

    # last_seen_at обновляем на устройстве
    device.last_seen_at = _utc_now()

    await db.commit()

    if inserted_ids:
        background_tasks.add_task(run_pipeline_for_raw_notifications, inserted_ids)

    return IngestResponse(accepted=accepted, duplicates=duplicates)


def _utc_now():
    from datetime import UTC, datetime

    return datetime.now(UTC)
