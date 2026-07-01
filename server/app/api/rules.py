"""CRUD /v1/rules.

Хранение match/action как JSONB (см. schema.sql). Семантика применения правил —
Фаза 2b (RulesEngine); здесь только персистентность.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_device
from app.db import get_db
from app.models import Device, Rule
from app.schemas.rule import Rule as RuleSchema
from app.schemas.rule import RuleInput

router = APIRouter(tags=["rules"])


def _to_schema(rule: Rule) -> RuleSchema:
    return RuleSchema(
        id=rule.id,
        name=rule.name,
        priority=rule.priority,
        match=rule.match,
        action=rule.action,
        enabled=rule.enabled,
    )


@router.get("/rules", response_model=list[RuleSchema])
async def list_rules(
    device: Device = Depends(get_current_device),
    db: AsyncSession = Depends(get_db),
) -> list[RuleSchema]:
    result = await db.execute(select(Rule).order_by(Rule.priority))
    return [_to_schema(r) for r in result.scalars().all()]


@router.post("/rules", response_model=RuleSchema, status_code=status.HTTP_201_CREATED)
async def create_rule(
    payload: RuleInput,
    device: Device = Depends(get_current_device),
    db: AsyncSession = Depends(get_db),
) -> RuleSchema:
    rule = Rule(
        name=payload.name,
        priority=payload.priority,
        match=payload.match.model_dump(exclude_none=True),
        action=payload.action.model_dump(mode="json", exclude_none=True),
        enabled=payload.enabled,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return _to_schema(rule)


@router.patch("/rules/{rule_id}", response_model=RuleSchema)
async def update_rule(
    rule_id: uuid.UUID,
    payload: RuleInput,
    device: Device = Depends(get_current_device),
    db: AsyncSession = Depends(get_db),
) -> RuleSchema:
    rule = await db.get(Rule, rule_id)
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule не найдено")

    rule.name = payload.name
    rule.priority = payload.priority
    rule.match = payload.match.model_dump(exclude_none=True)
    rule.action = payload.action.model_dump(mode="json", exclude_none=True)
    rule.enabled = payload.enabled

    await db.commit()
    await db.refresh(rule)
    return _to_schema(rule)


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(
    rule_id: uuid.UUID,
    device: Device = Depends(get_current_device),
    db: AsyncSession = Depends(get_db),
) -> None:
    rule = await db.get(Rule, rule_id)
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule не найдено")

    await db.delete(rule)
    await db.commit()
