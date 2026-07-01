import uuid

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_create_and_list_area(client: AsyncClient, auth_headers: dict):
    resp = await client.post("/areas", headers=auth_headers, json={"name": "Work", "color": "#ff0000", "sort": 1})
    assert resp.status_code == 201
    area = resp.json()
    assert area["name"] == "Work"

    list_resp = await client.get("/areas", headers=auth_headers)
    assert list_resp.status_code == 200
    assert any(a["id"] == area["id"] for a in list_resp.json())


async def test_update_area(client: AsyncClient, auth_headers: dict):
    created = (await client.post("/areas", headers=auth_headers, json={"name": "Old"})).json()

    resp = await client.patch(
        f"/areas/{created['id']}", headers=auth_headers, json={"name": "New", "sort": 5}
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "New"
    assert resp.json()["sort"] == 5


async def test_delete_area(client: AsyncClient, auth_headers: dict):
    created = (await client.post("/areas", headers=auth_headers, json={"name": "ToDelete"})).json()

    resp = await client.delete(f"/areas/{created['id']}", headers=auth_headers)
    assert resp.status_code == 204

    get_resp = await client.get("/areas", headers=auth_headers)
    assert all(a["id"] != created["id"] for a in get_resp.json())


async def test_area_not_found_on_update(client: AsyncClient, auth_headers: dict):
    resp = await client.patch(f"/areas/{uuid.uuid4()}", headers=auth_headers, json={"name": "X"})
    assert resp.status_code == 404


async def test_create_project_requires_area(client: AsyncClient, auth_headers: dict):
    area = (await client.post("/areas", headers=auth_headers, json={"name": "Home"})).json()

    resp = await client.post(
        "/projects", headers=auth_headers, json={"area_id": area["id"], "name": "Renovation"}
    )
    assert resp.status_code == 201
    project = resp.json()
    assert project["area_id"] == area["id"]
    assert project["active"] is True


async def test_list_projects_filtered_by_area(client: AsyncClient, auth_headers: dict):
    area1 = (await client.post("/areas", headers=auth_headers, json={"name": "A1"})).json()
    area2 = (await client.post("/areas", headers=auth_headers, json={"name": "A2"})).json()

    await client.post("/projects", headers=auth_headers, json={"area_id": area1["id"], "name": "P1"})
    await client.post("/projects", headers=auth_headers, json={"area_id": area2["id"], "name": "P2"})

    resp = await client.get("/projects", headers=auth_headers, params={"area_id": area1["id"]})
    assert resp.status_code == 200
    projects = resp.json()
    assert len(projects) == 1
    assert projects[0]["name"] == "P1"


async def test_update_and_delete_project(client: AsyncClient, auth_headers: dict):
    area = (await client.post("/areas", headers=auth_headers, json={"name": "Area"})).json()
    project = (
        await client.post("/projects", headers=auth_headers, json={"area_id": area["id"], "name": "Proj"})
    ).json()

    update_resp = await client.patch(
        f"/projects/{project['id']}",
        headers=auth_headers,
        json={"area_id": area["id"], "name": "Proj2", "active": False},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["name"] == "Proj2"
    assert update_resp.json()["active"] is False

    delete_resp = await client.delete(f"/projects/{project['id']}", headers=auth_headers)
    assert delete_resp.status_code == 204
