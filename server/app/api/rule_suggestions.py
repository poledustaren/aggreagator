"""POST /v1/rules/suggest — LLM предлагает правила группировки неразмеченных Item.

Неразмеченные = без зоны, проекта и тегов. Агрегируем по приложению-источнику,
LLM предлагает правила (match/action), считаем покрытие (сколько неразмеченных Item
матчит каждое). При apply=true — сразу создаём правила (иначе только предложение).
"""
import logging
import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_device
from app.config import get_settings
from app.db import get_db
from app.models import Area, Device, Item, Rule
from app.pipeline.llm_provider import build_provider
from app.pipeline.rule_suggester import RuleSuggester
from app.schemas.rule_suggestion import ProposedRule, RuleSuggestRequest, RuleSuggestResponse

router = APIRouter(tags=["rules"])
logger = logging.getLogger(__name__)


def _unlabeled_condition():
    return and_(Item.area_id.is_(None), Item.project_id.is_(None), func.cardinality(Item.tags) == 0)


@router.post("/rules/suggest", response_model=RuleSuggestResponse)
async def suggest_rules(
    payload: RuleSuggestRequest,
    device: Device = Depends(get_current_device),
    db: AsyncSession = Depends(get_db),
) -> RuleSuggestResponse:
    settings = get_settings()
    llm = build_provider(settings)
    if llm is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="LLM выключен (llm_provider=none) — предложение правил недоступно.",
        )

    unlabeled = _unlabeled_condition()
    total = (await db.execute(select(func.count(Item.id)).where(unlabeled))).scalar_one()
    if total == 0:
        return RuleSuggestResponse(unlabeled_total=0, suggestions=[])

    # Забираем неразмеченные (с ограничением) и агрегируем по source_app в Python.
    rows = (
        (
            await db.execute(
                select(Item.source_apps, Item.title, Item.summary)
                .where(unlabeled)
                .order_by(Item.created_at.desc())
                .limit(3000)
            )
        )
        .all()
    )
    agg: dict[str, dict] = {}
    for source_apps, title, summary in rows:
        app = (source_apps or ["?"])[0]
        bucket = agg.setdefault(app, {"source_app": app, "app_label": app, "count": 0, "samples": []})
        bucket["count"] += 1
        if len(bucket["samples"]) < payload.sample_per_app:
            sample = (title or summary or "").strip()
            if sample:
                bucket["samples"].append(sample[:120])

    aggregates = sorted(agg.values(), key=lambda b: b["count"], reverse=True)[: payload.max_apps]

    areas = [
        {"id": str(a.id), "name": a.name}
        for a in (await db.execute(select(Area))).scalars().all()
    ]

    suggester = RuleSuggester(llm, settings)
    proposals = await suggester.suggest(aggregates, areas)

    result: list[ProposedRule] = []
    for p in proposals:
        coverage = await _coverage(db, p["match"], unlabeled)
        created_id = None
        if payload.apply:
            rule = Rule(name=p["name"], priority=100, match=p["match"], action=p["action"], enabled=True)
            db.add(rule)
            await db.flush()
            created_id = rule.id
        result.append(
            ProposedRule(
                name=p["name"],
                match=p["match"],
                action=p["action"],
                rationale=p.get("rationale"),
                coverage=coverage,
                created_id=created_id,
            )
        )
    if payload.apply:
        await db.commit()

    return RuleSuggestResponse(unlabeled_total=total, suggestions=result)


async def _coverage(db: AsyncSession, match: dict, unlabeled) -> int:
    """Сколько неразмеченных Item матчит предложенное правило (оценка по items).

    Regex предвалидируем в Python, а сам COUNT оборачиваем в SAVEPOINT (begin_nested),
    чтобы возможная ошибка Postgres не отравляла внешнюю транзакцию (в т.ч. созданные
    при apply=true правила).
    """
    conds = [unlabeled]
    if match.get("source_app"):
        conds.append(Item.source_apps.any(match["source_app"]))
    for field, col in (("title_regex", Item.title), ("text_regex", Item.summary)):
        rx = match.get(field)
        if rx:
            try:
                re.compile(rx)
            except re.error:
                return 0  # битый regex — правило нерабочее, покрытие 0
            conds.append(col.op("~")(rx))
    try:
        async with db.begin_nested():
            return (await db.execute(select(func.count(Item.id)).where(and_(*conds)))).scalar_one()
    except Exception:
        logger.warning("Не удалось посчитать покрытие для match=%s", match)
        return 0
