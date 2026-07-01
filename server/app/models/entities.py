"""ORM-модели (SQLAlchemy 2.0, async).

1:1 соответствуют таблицам из server/db/schema.sql. Порядок объявления учитывает
FK-зависимости, но для SQLAlchemy это не критично (metadata сама строит граф).
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    ARRAY,
    REAL,
    Boolean,
    CheckConstraint,
    Enum,
    ForeignKey,
    Integer,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from pgvector.sqlalchemy import Vector

from app.db import Base

# Размерность эмбеддинга bge-m3 (см. миграцию 0002_processes_rag).
EMBED_DIM = 1024


class ItemStatus(str, enum.Enum):
    inbox = "inbox"
    snoozed = "snoozed"
    done = "done"
    dismissed = "dismissed"


class ClassifiedBy(str, enum.Enum):
    rules = "rules"
    llm = "llm"
    manual = "manual"


class ProcessStatus(str, enum.Enum):
    open = "open"       # идёт
    frozen = "frozen"   # тишина — заморожен, может ожить
    closed = "closed"   # явный признак завершения


# Отдельные Enum-типы Postgres, имена совпадают с CREATE TYPE в schema.sql / миграциях.
item_status_pg = Enum(ItemStatus, name="item_status", create_type=False)
classified_by_pg = Enum(ClassifiedBy, name="classified_by", create_type=False)
process_status_pg = Enum(ProcessStatus, name="process_status", create_type=False)


class Device(Base):
    __tablename__ = "device"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    platform: Mapped[str] = mapped_column(Text, CheckConstraint("platform IN ('android')"), nullable=False)
    device_name: Mapped[str] = mapped_column(Text, nullable=False)
    push_token: Mapped[str | None] = mapped_column(Text)
    token_hash: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    last_seen_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))


class Area(Base):
    __tablename__ = "area"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    name: Mapped[str] = mapped_column(Text, nullable=False)
    color: Mapped[str | None] = mapped_column(Text)
    sort: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")


class Project(Base):
    __tablename__ = "project"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    area_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("area.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    due_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))


class Group(Base):
    __tablename__ = "group"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    group_key: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    title: Mapped[str | None] = mapped_column(Text)
    area_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("area.id", ondelete="SET NULL"))
    project_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("project.id", ondelete="SET NULL"))
    last_activity_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    items: Mapped[list["Item"]] = relationship(back_populates="group")


class Item(Base):
    __tablename__ = "item"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    title: Mapped[str | None] = mapped_column(Text)
    summary: Mapped[str | None] = mapped_column(Text)
    importance: Mapped[int] = mapped_column(
        Integer, CheckConstraint("importance BETWEEN 0 AND 100"), nullable=False, default=0, server_default="0"
    )
    status: Mapped[ItemStatus] = mapped_column(item_status_pg, nullable=False, default=ItemStatus.inbox, server_default="inbox")
    suggested_action: Mapped[str | None] = mapped_column(Text)
    area_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("area.id", ondelete="SET NULL"))
    project_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("project.id", ondelete="SET NULL"))
    group_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("group.id", ondelete="SET NULL"))
    tags: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, default=list, server_default="{}")
    source_apps: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, default=list, server_default="{}")
    classified_by: Mapped[ClassifiedBy | None] = mapped_column(classified_by_pg)
    confidence: Mapped[float | None] = mapped_column(REAL, CheckConstraint("confidence BETWEEN 0 AND 1"))
    snoozed_until: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    # RAG / процессы (миграция 0002)
    process_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("process.id", ondelete="SET NULL"))
    embedding: Mapped[list[float] | None] = mapped_column(Vector(EMBED_DIM))

    group: Mapped["Group | None"] = relationship(back_populates="items")


class RawNotification(Base):
    __tablename__ = "raw_notification"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    device_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("device.id", ondelete="CASCADE"), nullable=False)
    client_id: Mapped[str] = mapped_column(Text, nullable=False)
    source_app: Mapped[str] = mapped_column(Text, nullable=False)
    app_label: Mapped[str | None] = mapped_column(Text)
    title: Mapped[str | None] = mapped_column(Text)
    text: Mapped[str | None] = mapped_column(Text)
    subtext: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str | None] = mapped_column(Text)
    posted_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    extras: Mapped[dict | None] = mapped_column(JSONB)
    received_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    item_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("item.id", ondelete="SET NULL"))


class Rule(Base):
    __tablename__ = "rule"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    name: Mapped[str] = mapped_column(Text, nullable=False)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=100, server_default="100")
    match: Mapped[dict] = mapped_column(JSONB, nullable=False)
    action: Mapped[dict] = mapped_column(JSONB, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")


class Classification(Base):
    __tablename__ = "classification"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("item.id", ondelete="CASCADE"), nullable=False)
    layer: Mapped[ClassifiedBy] = mapped_column(classified_by_pg, nullable=False)
    model: Mapped[str | None] = mapped_column(Text)
    confidence: Mapped[float | None] = mapped_column(REAL)
    raw_output: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())


class Process(Base):
    """Процесс/проблема, живущая во времени — надстройка над Item (RAG-связка)."""

    __tablename__ = "process"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    title: Mapped[str | None] = mapped_column(Text)
    summary: Mapped[str | None] = mapped_column(Text)
    status: Mapped[ProcessStatus] = mapped_column(
        process_status_pg, nullable=False, default=ProcessStatus.open, server_default="open"
    )
    area_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("area.id", ondelete="SET NULL"))
    project_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("project.id", ondelete="SET NULL"))
    started_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    last_activity_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    ended_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    item_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    centroid: Mapped[list[float] | None] = mapped_column(Vector(EMBED_DIM))
