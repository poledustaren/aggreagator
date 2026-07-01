import asyncio

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


def _notification(client_id: str, **overrides) -> dict:
    base = {
        "client_id": client_id,
        "source_app": "com.whatsapp",
        "app_label": "WhatsApp",
        "title": "Иван Иванов",
        "text": "Привет, как дела?",
        "category": "msg",
        "posted_at": "2026-07-01T10:00:00Z",
    }
    base.update(overrides)
    return base


async def test_ingest_accepts_new_notifications(client: AsyncClient, auth_headers: dict):
    resp = await client.post(
        "/notifications:ingest",
        headers=auth_headers,
        json={"notifications": [_notification("n1"), _notification("n2")]},
    )
    assert resp.status_code == 202
    body = resp.json()
    assert body["accepted"] == 2
    assert body["duplicates"] == 0


async def test_ingest_is_idempotent_by_client_id(client: AsyncClient, auth_headers: dict):
    payload = {"notifications": [_notification("dup-1")]}

    first = await client.post("/notifications:ingest", headers=auth_headers, json=payload)
    assert first.status_code == 202
    assert first.json()["accepted"] == 1
    assert first.json()["duplicates"] == 0

    second = await client.post("/notifications:ingest", headers=auth_headers, json=payload)
    assert second.status_code == 202
    assert second.json()["accepted"] == 0
    assert second.json()["duplicates"] == 1


async def test_ingest_mixed_batch_new_and_duplicate(client: AsyncClient, auth_headers: dict):
    first = await client.post(
        "/notifications:ingest",
        headers=auth_headers,
        json={"notifications": [_notification("mix-1")]},
    )
    assert first.json()["accepted"] == 1

    second = await client.post(
        "/notifications:ingest",
        headers=auth_headers,
        json={"notifications": [_notification("mix-1"), _notification("mix-2")]},
    )
    body = second.json()
    assert body["accepted"] == 1
    assert body["duplicates"] == 1


async def test_ingest_same_client_id_different_devices_not_duplicate(client: AsyncClient):
    """Идемпотентность — по (device_id, client_id), а не по client_id глобально."""
    dev1 = (await client.post("/devices:register", json={"platform": "android", "device_name": "d1"})).json()
    dev2 = (await client.post("/devices:register", json={"platform": "android", "device_name": "d2"})).json()

    payload = {"notifications": [_notification("same-id")]}

    resp1 = await client.post(
        "/notifications:ingest",
        headers={"Authorization": f"Bearer {dev1['token']}"},
        json=payload,
    )
    resp2 = await client.post(
        "/notifications:ingest",
        headers={"Authorization": f"Bearer {dev2['token']}"},
        json=payload,
    )

    assert resp1.json()["accepted"] == 1
    assert resp2.json()["accepted"] == 1  # разные устройства — не дубликат


async def test_ingest_triggers_pipeline_creates_item(client: AsyncClient, auth_headers: dict):
    """После ingest (и фоновой обработки) должен появиться Item через PassthroughClassifier."""
    resp = await client.post(
        "/notifications:ingest",
        headers=auth_headers,
        json={"notifications": [_notification("pipeline-1")]},
    )
    assert resp.status_code == 202

    # Фоновая задача (BackgroundTasks) в httpx ASGITransport выполняется синхронно
    # после отправки ответа, но дадим event loop шанс её выполнить.
    await asyncio.sleep(0.2)

    items_resp = await client.get("/items", headers=auth_headers)
    assert items_resp.status_code == 200
    items = items_resp.json()["items"]
    assert any(i["title"] == "Иван Иванов" for i in items)
