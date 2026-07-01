import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_register_device_returns_id_and_token(client: AsyncClient):
    resp = await client.post(
        "/devices:register",
        json={"platform": "android", "device_name": "Pixel 8"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert "device_id" in body
    assert "token" in body
    assert len(body["token"]) > 10


async def test_register_device_with_push_token(client: AsyncClient):
    resp = await client.post(
        "/devices:register",
        json={"platform": "android", "device_name": "Pixel 8", "push_token": "abc123"},
    )
    assert resp.status_code == 201


async def test_register_device_rejects_unknown_platform(client: AsyncClient):
    resp = await client.post(
        "/devices:register",
        json={"platform": "ios", "device_name": "iPhone"},
    )
    assert resp.status_code == 422
