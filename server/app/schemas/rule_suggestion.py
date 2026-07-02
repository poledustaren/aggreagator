"""Схемы LLM-предложений правил группировки."""
from __future__ import annotations

import uuid

from pydantic import BaseModel, Field

from app.schemas.rule import RuleAction, RuleMatch


class RuleSuggestRequest(BaseModel):
    sample_per_app: int = Field(default=5, ge=1, le=20)
    max_apps: int = Field(default=25, ge=1, le=100)
    apply: bool = False  # true → сразу создать предложенные правила


class ProposedRule(BaseModel):
    name: str
    match: RuleMatch
    action: RuleAction
    rationale: str | None = None
    coverage: int = 0                    # сколько неразмеченных Item матчит правило
    created_id: uuid.UUID | None = None  # заполняется, если apply=true


class RuleSuggestResponse(BaseModel):
    unlabeled_total: int
    suggestions: list[ProposedRule]
