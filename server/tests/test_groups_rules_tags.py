import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Group, Item

pytestmark = pytest.mark.asyncio


async def test_list_groups_with_nested_items_and_max_importance(
    client: AsyncClient, auth_headers: dict, db_session: AsyncSession
):
    group = Group(group_key="com.test:2026-07-01", title="Test group")
    db_session.add(group)
    await db_session.flush()

    db_session.add(Item(title="low", importance=10, group_id=group.id))
    db_session.add(Item(title="high", importance=70, group_id=group.id))
    await db_session.commit()

    resp = await client.get("/groups", headers=auth_headers)
    assert resp.status_code == 200
    groups = resp.json()["groups"]
    found = next(g for g in groups if g["id"] == str(group.id))
    assert found["importance"] == 70
    assert found["item_count"] == 2
    assert len(found["items"]) == 2


async def test_create_and_list_rule(client: AsyncClient, auth_headers: dict):
    resp = await client.post(
        "/rules",
        headers=auth_headers,
        json={
            "name": "WhatsApp important",
            "priority": 10,
            "match": {"source_app": "com.whatsapp"},
            "action": {"add_tags": ["personal"], "confident": True},
        },
    )
    assert resp.status_code == 201
    rule = resp.json()
    assert rule["name"] == "WhatsApp important"
    assert rule["match"]["source_app"] == "com.whatsapp"
    assert rule["action"]["confident"] is True

    list_resp = await client.get("/rules", headers=auth_headers)
    assert list_resp.status_code == 200
    assert any(r["id"] == rule["id"] for r in list_resp.json())


async def test_delete_rule(client: AsyncClient, auth_headers: dict):
    created = (
        await client.post(
            "/rules",
            headers=auth_headers,
            json={"name": "tmp", "match": {}, "action": {}},
        )
    ).json()

    resp = await client.delete(f"/rules/{created['id']}", headers=auth_headers)
    assert resp.status_code == 204


async def test_list_tags_unique(client: AsyncClient, auth_headers: dict, db_session: AsyncSession):
    db_session.add(Item(title="a", tags=["work", "urgent"]))
    db_session.add(Item(title="b", tags=["urgent", "home"]))
    await db_session.commit()

    resp = await client.get("/tags", headers=auth_headers)
    assert resp.status_code == 200
    tags = resp.json()
    assert set(tags) == {"work", "urgent", "home"}
    assert len(tags) == len(set(tags))
