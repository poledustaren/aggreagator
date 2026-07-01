"""POST /v1/devices:register — регистрация устройства без авторизации."""
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import generate_device_token, hash_token
from app.db import get_db
from app.models import Device
from app.schemas.device import DeviceRegisterRequest, DeviceRegisterResponse

router = APIRouter(tags=["devices"])


@router.post(
    "/devices:register",
    response_model=DeviceRegisterResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register_device(
    payload: DeviceRegisterRequest,
    db: AsyncSession = Depends(get_db),
) -> DeviceRegisterResponse:
    token = generate_device_token()

    device = Device(
        platform=payload.platform,
        device_name=payload.device_name,
        push_token=payload.push_token,
        token_hash=hash_token(token),
    )
    db.add(device)
    await db.commit()
    await db.refresh(device)

    return DeviceRegisterResponse(device_id=device.id, token=token)
