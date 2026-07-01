"""Авторизация по bearer-токену устройства.

Токен генерируется при регистрации устройства (POST /v1/devices:register),
клиенту отдаётся один раз в открытом виде, в БД хранится только SHA-256 хэш
(device.token_hash). При каждом защищённом запросе токен из заголовка
Authorization хэшируется и ищется в БД — сам токен на сервере не хранится.
"""
import hashlib
import secrets

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import Device

_bearer_scheme = HTTPBearer(auto_error=False)


def generate_device_token() -> str:
    """Криптостойкий opaque-токен для устройства."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """Необратимый хэш токена для хранения в БД (device.token_hash)."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def get_current_device(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> Device:
    """FastAPI-зависимость для защищённых эндпоинтов: проверяет Bearer-токен по хэшу."""
    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")

    token_hash = hash_token(credentials.credentials)
    result = await db.execute(select(Device).where(Device.token_hash == token_hash))
    device = result.scalar_one_or_none()
    if device is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or unknown token")

    return device
