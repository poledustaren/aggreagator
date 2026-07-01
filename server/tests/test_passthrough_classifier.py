"""Unit-тест PassthroughClassifier — не требует БД."""
import uuid
from datetime import UTC, datetime

import pytest

from app.pipeline.classifier import ClassifyContext, RawNotificationData
from app.pipeline.passthrough import PassthroughClassifier

pytestmark = pytest.mark.asyncio


async def test_passthrough_creates_1to1_result_with_zero_importance():
    raw = RawNotificationData(
        id=uuid.uuid4(),
        device_id=uuid.uuid4(),
        client_id="c1",
        source_app="com.whatsapp",
        app_label="WhatsApp",
        title="Иван",
        text="привет",
        subtext=None,
        category="msg",
        posted_at=datetime(2026, 7, 1, 10, 0, tzinfo=UTC),
        extras=None,
    )

    result = await PassthroughClassifier().classify(raw, ClassifyContext())

    assert result.importance == 0
    assert result.classified_by is None
    assert result.area_id is None
    assert result.project_id is None
    assert result.tags == []
    assert result.title == "Иван"
    assert result.group_key == "com.whatsapp:2026-07-01"


async def test_passthrough_falls_back_to_app_label_when_no_title():
    raw = RawNotificationData(
        id=uuid.uuid4(),
        device_id=uuid.uuid4(),
        client_id="c2",
        source_app="com.example",
        app_label="Example App",
        title=None,
        text=None,
        subtext=None,
        category=None,
        posted_at=datetime(2026, 7, 1, 10, 0, tzinfo=UTC),
        extras=None,
    )

    result = await PassthroughClassifier().classify(raw, ClassifyContext())

    assert result.title == "Example App"
