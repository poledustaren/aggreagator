"""CRUD /v1/projects (фильтр area_id)."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_device
from app.db import get_db
from app.models import Device, Project
from app.schemas.project import Project as ProjectSchema
from app.schemas.project import ProjectInput

router = APIRouter(tags=["projects"])


@router.get("/projects", response_model=list[ProjectSchema])
async def list_projects(
    area_id: uuid.UUID | None = Query(default=None),
    device: Device = Depends(get_current_device),
    db: AsyncSession = Depends(get_db),
) -> list[ProjectSchema]:
    stmt = select(Project)
    if area_id is not None:
        stmt = stmt.where(Project.area_id == area_id)
    stmt = stmt.order_by(Project.name)

    result = await db.execute(stmt)
    return [ProjectSchema.model_validate(p) for p in result.scalars().all()]


@router.post("/projects", response_model=ProjectSchema, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectInput,
    device: Device = Depends(get_current_device),
    db: AsyncSession = Depends(get_db),
) -> ProjectSchema:
    project = Project(
        area_id=payload.area_id,
        name=payload.name,
        active=payload.active,
        due_at=payload.due_at,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return ProjectSchema.model_validate(project)


@router.patch("/projects/{project_id}", response_model=ProjectSchema)
async def update_project(
    project_id: uuid.UUID,
    payload: ProjectInput,
    device: Device = Depends(get_current_device),
    db: AsyncSession = Depends(get_db),
) -> ProjectSchema:
    project = await db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project не найден")

    project.area_id = payload.area_id
    project.name = payload.name
    project.active = payload.active
    project.due_at = payload.due_at

    await db.commit()
    await db.refresh(project)
    return ProjectSchema.model_validate(project)


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: uuid.UUID,
    device: Device = Depends(get_current_device),
    db: AsyncSession = Depends(get_db),
) -> None:
    project = await db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project не найден")

    await db.delete(project)
    await db.commit()
