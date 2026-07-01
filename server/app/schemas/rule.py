import uuid

from pydantic import BaseModel, ConfigDict, Field


class RuleMatch(BaseModel):
    """Все указанные условия должны совпасть (AND). Семантика реализуется в Фазе 2b."""

    model_config = ConfigDict(extra="allow")

    source_app: str | None = None
    title_regex: str | None = None
    text_regex: str | None = None
    category: str | None = None


class RuleAction(BaseModel):
    """Что навесить при срабатывании. confident=true завершает пайплайн без LLM (Фаза 2b)."""

    model_config = ConfigDict(extra="allow")

    set_area_id: uuid.UUID | None = None
    set_project_id: uuid.UUID | None = None
    add_tags: list[str] = Field(default_factory=list)
    set_importance: int | None = Field(default=None, ge=0, le=100)
    confident: bool = False


class Rule(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    priority: int
    match: RuleMatch
    action: RuleAction
    enabled: bool


class RuleInput(BaseModel):
    name: str
    priority: int = 100
    match: RuleMatch
    action: RuleAction
    enabled: bool = True
