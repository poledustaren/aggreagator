import uuid

from pydantic import BaseModel, Field


class DeviceRegisterRequest(BaseModel):
    platform: str = Field(pattern="^android$")
    device_name: str
    push_token: str | None = None
    # Пароль доступа: обязателен, если на сервере задан WEB_PASSWORD (иначе регистрация открыта).
    password: str | None = None


class DeviceRegisterResponse(BaseModel):
    device_id: uuid.UUID
    token: str
