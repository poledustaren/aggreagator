import uuid
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Item

pytestmark = pytest.mark.asyncio


async def _make_item(db_session: AsyncSession, **overrides) -> Item:
    defaults = dict(
        title="Test item",
        importance=10,
        status="inbox",
        tags=[],
        source_apps=["com.test"],
    )
    defaults.update(overrides)
    item = Item(**defaults)
    db_session.add(item)
    await db_session.commit()
    await db_session.refresh(item)
    return item


async def test_items_feed_sorted_by_importance_then_created_at(
    client: AsyncClient, auth_headers: dict, db_session: AsyncSession
):
    await _make_item(db_session, title="low", importance=10)
    await _make_item(db_session, title="high", importance=90)
    await _make_item(db_session, title="mid", importance=50)

    resp = await client.get("/items", headers=auth_headers)
    assert resp.status_code == 200
    items = resp.json()["items"]
    importances = [i["importance"] for i in items]
    assert importances == sorted(importances, reverse=True)
    assert items[0]["title"] == "high"


async def test_items_filter_importance_min(client: AsyncClient, auth_headers: dict, db_session: AsyncSession):
    await _make_item(db_session, title="low", importance=5)
    await _make_item(db_session, title="high", importance=80)

    resp = await client.get("/items", headers=auth_headers, params={"importance_min": 50})
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert all(i["importance"] >= 50 for i in items)
    assert all(i["title"] != "low" for i in items)


async def test_items_filter_status(client: AsyncClient, auth_headers: dict, db_session: AsyncSession):
    await _make_item(db_session, title="inbox-item", status="inbox")
    await _make_item(db_session, title="done-item", status="done")

    resp = await client.get("/items", headers=auth_headers, params={"status": "done"})
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["title"] == "done-item"


async def test_items_filter_tag(client: AsyncClient, auth_headers: dict, db_session: AsyncSession):
    await _make_item(db_session, title="tagged", tags=["urgent"])
    await _make_item(db_session, title="untagged", tags=[])

    resp = await client.get("/items", headers=auth_headers, params={"tag": "urgent"})
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["title"] == "tagged"


async def test_items_pagination_cursor(client: AsyncClient, auth_headers: dict, db_session: AsyncSession):
    for i in range(5):
        await _make_item(db_session, title=f"item-{i}", importance=i * 10)

    first_page = await client.get("/items", headers=auth_headers, params={"limit": 2})
    assert first_page.status_code == 200
    first_body = first_page.json()
    assert len(first_body["items"]) == 2
    assert first_body["next_cursor"] is not None

    second_page = await client.get(
        "/items", headers=auth_headers, params={"limit": 2, "cursor": first_body["next_cursor"]}
    )
    assert second_page.status_code == 200
    second_body = second_page.json()
    first_ids = {i["id"] for i in first_body["items"]}
    second_ids = {i["id"] for i in second_body["items"]}
    assert first_ids.isdisjoint(second_ids)


async def test_get_item_by_id(client: AsyncClient, auth_headers: dict, db_session: AsyncSession):
    item = await _make_item(db_session, title="single")

    resp = await client.get(f"/items/{item.id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["title"] == "single"


async def test_get_item_not_found(client: AsyncClient, auth_headers: dict):
    resp = await client.get(f"/items/{uuid.uuid4()}", headers=auth_headers)
    assert resp.status_code == 404


async def test_patch_item_status(client: AsyncClient, auth_headers: dict, db_session: AsyncSession):
    item = await _make_item(db_session, title="to-be-done")

    resp = await client.patch(f"/items/{item.id}", headers=auth_headers, json={"status": "done"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "done"


async def test_patch_item_manual_reassign_sets_classified_by_manual(
    client: AsyncClient, auth_headers: dict, db_session: AsyncSession
):
    item = await _make_item(db_session, title="reassign-me")

    resp = await client.patch(
        f"/items/{item.id}",
        headers=auth_headers,
        json={"tags": ["work", "important"]},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["classified_by"] == "manual"
    assert set(body["tags"]) == {"work", "important"}


async def test_patch_item_snooze(client: AsyncClient, auth_headers: dict, db_session: AsyncSession):
    item = await _make_item(db_session, title="snooze-me")
    snooze_until = datetime.now(UTC).isoformat()

    resp = await client.patch(
        f"/items/{item.id}",
        headers=auth_headers,
        json={"status": "snoozed", "snoozed_until": snooze_until},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "snoozed"
    assert resp.json()["snoozed_until"] is not None
