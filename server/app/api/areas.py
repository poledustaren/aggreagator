"""CRUD /v1/areas."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_device
from app.db import get_db
from app.models import Area, Device
from app.schemas.area import Area as AreaSchema
from app.schemas.area import AreaInput

router = APIRouter(tags=["areas"])


@router.get("/areas", response_model=list[AreaSchema])
async def list_areas(
    device: Device = Depends(get_current_device),
    db: AsyncSession = Depends(get_db),
) -> list[AreaSchema]:
    result = await db.execute(select(Area).order_by(Area.sort, Area.name))
    return [AreaSchema.model_validate(a) for a in result.scalars().all()]


@router.post("/areas", response_model=AreaSchema, status_code=status.HTTP_201_CREATED)
async def create_area(
    payload: AreaInput,
    device: Device = Depends(get_current_device),
    db: AsyncSession = Depends(get_db),
) -> AreaSchema:
    area = Area(name=payload.name, color=payload.color, sort=payload.sort)
    db.add(area)
    await db.commit()
    await db.refresh(area)
    return AreaSchema.model_validate(area)


@router.patch("/areas/{area_id}", response_model=AreaSchema)
async def update_area(
    area_id: uuid.UUID,
    payload: AreaInput,
    device: Device = Depends(get_current_device),
    db: AsyncSession = Depends(get_db),
) -> AreaSchema:
    area = await db.get(Area, area_id)
    if area is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Area не найдена")

    area.name = payload.name
    area.color = payload.color
    area.sort = payload.sort

    await db.commit()
    await db.refresh(area)
    return AreaSchema.model_validate(area)


@router.delete("/areas/{area_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_area(
    area_id: uuid.UUID,
    device: Device = Depends(get_current_device),
    db: AsyncSession = Depends(get_db),
) -> None:
    area = await db.get(Area, area_id)
    if area is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Area не найдена")

    await db.delete(area)
    await db.commit()
