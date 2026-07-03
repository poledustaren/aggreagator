"""POST /v1/auth/login — вход на дашборд по общему паролю.

Если пароль верный (== WEB_PASSWORD), выдаём Bearer-токен «веб-устройства», которым
дашборд авторизует все /v1-запросы (как токен телефона). Так на сайт пускает НЕ ТОЛЬКО
по токену устройства, но и по паролю. Открытый эндпоинт (сам логин), проверка — на сервере.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import generate_device_token, hash_token
from app.config import get_settings
from app.db import get_db
from app.models import Device

router = APIRouter(tags=["auth"])


class LoginRequest(BaseModel):
    password: str


class LoginResponse(BaseModel):
    token: str


@router.post("/auth/login", response_model=LoginResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)) -> LoginResponse:
    web_password = get_settings().web_password
    if not web_password or payload.password != web_password:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверный пароль")

    # Отдельное «веб-устройство» на сессию (platform=android — единственное разрешённое схемой).
    token = generate_device_token()
    device = Device(platform="android", device_name="web-portal", token_hash=hash_token(token))
    db.add(device)
    await db.commit()
    return LoginResponse(token=token)
