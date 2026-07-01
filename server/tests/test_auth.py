import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_items_without_token_returns_401(client: AsyncClient):
    resp = await client.get("/items")
    assert resp.status_code == 401


async def test_items_with_invalid_token_returns_401(client: AsyncClient):
    resp = await client.get("/items", headers={"Authorization": "Bearer not-a-real-token"})
    assert resp.status_code == 401


async def test_ingest_without_token_returns_401(client: AsyncClient):
    resp = await client.post("/notifications:ingest", json={"notifications": []})
    assert resp.status_code == 401


async def test_items_with_valid_token_returns_200(client: AsyncClient, auth_headers: dict):
    resp = await client.get("/items", headers=auth_headers)
    assert resp.status_code == 200
