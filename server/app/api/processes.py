"""GET /v1/processes, /v1/processes/{id}, /v1/processes/timeline, POST /v1/processes/freeze.

Процессы — RAG-надстройка над Item (см. app/pipeline/process_linker.py).
Cursor-пагинация по (last_activity_at DESC, id) — как в groups.py.
"""
import base64
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_device
from app.config import get_settings
from app.db import get_db
from app.models import Device, Item, Process
from app.models.entities import ProcessStatus as ORMProcessStatus
from app.models.entities import Theme
from app.pipeline.llm_provider import build_provider
from app.pipeline.relation_finder import ProcInfo, RelationFinder
from app.schemas.common import ProcessStatus
from app.schemas.item import Item as ItemSchema
from app.schemas.process import (
    Process as ProcessSchema,
)
from app.schemas.process import (
    ProcessDetail,
    ProcessPage,
    ProcessTimeline,
    ProcessTimelineEntry,
)
from app.schemas.process_graph import GraphEdge, GraphNode, GraphTheme, ProcessGraph

router = APIRouter(tags=["processes"])
settings = get_settings()

# Кэш графа связей: LLM-анализ дорогой (до минуты), а результат для одного окна
# меняется медленно. Держим готовый ProcessGraph в памяти по ключу окна с TTL —
# повторные открытия «Связей» отдаются мгновенно, без LLM-перегенерации.
# Параметр ?refresh=true форсирует пересчёт. Кэш per-worker (uvicorn 1 воркер),
# сбрасывается на рестарте — это ок.
import time as _time  # noqa: E402

_graph_cache: dict[str, tuple[float, "ProcessGraph"]] = {}


def _graph_cache_key(from_: datetime | None, to: datetime | None) -> str:
    return f"{from_.isoformat() if from_ else '-'}|{to.isoformat() if to else '-'}"


def _floor_hour(dt: datetime | None) -> datetime | None:
    """Округлить границу окна вниз до часа — чтобы кэш графа попадал в течение часа
    (иначе to=now с миллисекундами делает каждый заход уникальным → LLM каждый раз)."""
    return dt.replace(minute=0, second=0, microsecond=0) if dt is not None else None

_CURSOR_SEP = "|"


def _encode_cursor(last_activity_at: datetime, process_id: uuid.UUID) -> str:
    raw = f"{last_activity_at.isoformat()}{_CURSOR_SEP}{process_id}"
    return base64.urlsafe_b64encode(raw.encode("utf-8")).decode("ascii")


def _decode_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        raw = base64.urlsafe_b64decode(cursor.encode("ascii")).decode("utf-8")
        ts_str, id_str = raw.split(_CURSOR_SEP, 1)
        return datetime.fromisoformat(ts_str), uuid.UUID(id_str)
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Некорректный cursor") from exc


# ── H7: важность процесса (пик важности × свежесть × открытость) ──
import math  # noqa: E402

_H7_OPENNESS = {ORMProcessStatus.open: 1.0, ORMProcessStatus.frozen: 0.55, ORMProcessStatus.closed: 0.25}


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _process_importance(max_imp: int, avg_imp: float, count: int, last_activity: datetime, status, now: datetime) -> int:
    """H7 из промоделированной формулы (веса согласованы с пользователем).

    salience = 0.6·пик + 0.25·среднее + 0.15·min(100, 12·ln(1+N))
    freshness = exp(-дни_простоя / 7);  openness = {open 1.0, frozen .55, closed .25}
    """
    salience = 0.6 * max_imp + 0.25 * avg_imp + 0.15 * min(100.0, 12.0 * math.log(1 + max(0, count)))
    idle_days = max(0.0, (now - last_activity).total_seconds() / 86400.0)
    freshness = math.exp(-idle_days / 7.0)
    openness = _H7_OPENNESS.get(status, 0.5)
    return round(salience * freshness * openness)


async def _load_item_agg(db: AsyncSession, process_ids: list[uuid.UUID]) -> dict:
    """Пер-процесс агрегаты важности сообщений: pid → (max_imp, avg_imp, count)."""
    if not process_ids:
        return {}
    stmt = (
        select(Item.process_id, func.max(Item.importance), func.avg(Item.importance), func.count(Item.id))
        .where(Item.process_id.in_(process_ids))
        .group_by(Item.process_id)
    )
    return {pid: (int(mx or 0), float(av or 0), int(cnt or 0)) for pid, mx, av, cnt in (await db.execute(stmt)).all()}


async def _process_theme_names(db: AsyncSession, procs: list[Process]) -> dict:
    """pid → имя персистентной темы (process.theme_id). Темы ведёт theme_linker при
    ингесте, поэтому граф читает их напрямую из БД — без LLM и без лимита на процессы."""
    theme_ids = {p.theme_id for p in procs if p.theme_id is not None}
    if not theme_ids:
        return {}
    rows = (await db.execute(select(Theme.id, Theme.name).where(Theme.id.in_(theme_ids)))).all()
    name_by_theme = {tid: nm for tid, nm in rows}
    return {p.id: name_by_theme[p.theme_id] for p in procs if p.theme_id in name_by_theme}


def _attach_importance(schema, agg: dict, now: datetime, p: Process) -> None:
    """Проставить schema.importance (H7) и max_importance из агрегатов."""
    mx, av, cnt = agg.get(p.id, (0, 0.0, 0))
    schema.max_importance = mx
    schema.importance = _process_importance(mx, av, cnt, p.last_activity_at, p.status, now)


def _timeline_end(p: Process) -> datetime | None:
    """Конец полосы: closed→ended_at, frozen→last_activity_at, open→None (идёт)."""
    if p.status == ORMProcessStatus.closed:
        return p.ended_at or p.last_activity_at
    if p.status == ORMProcessStatus.frozen:
        return p.last_activity_at
    return None


# ── timeline, graph и freeze объявляем ДО /{id}, чтобы путь не перехватился как uuid ──
@router.get("/processes/timeline", response_model=ProcessTimeline)
async def processes_timeline(
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
    device: Device = Depends(get_current_device),
    db: AsyncSession = Depends(get_db),
) -> ProcessTimeline:
    # Оконный режим: если задан промежуток — конец процесса = последнее его сообщение
    # В ОКНЕ (процесс «формально конечен для текущего вида»), начало = первое в окне.
    if from_ is not None or to is not None:
        return ProcessTimeline(entries=await _windowed_entries(db, from_, to))

    # Полный режим (без окна): границы по полям самого процесса.
    rows = (await db.execute(select(Process).order_by(Process.started_at))).scalars().all()
    entries = [
        ProcessTimelineEntry(
            id=p.id,
            title=p.title,
            status=ProcessStatus(p.status.value),
            area_id=p.area_id,
            project_id=p.project_id,
            start=p.started_at,
            end=_timeline_end(p),
            item_count=p.item_count,
        )
        for p in rows
    ]
    return ProcessTimeline(entries=entries)


async def _window_item_agg(db: AsyncSession, from_: datetime | None, to: datetime | None):
    """Агрегаты сообщений по процессам В ОКНЕ: (process_id → min/max created_at, count)."""
    conds = [Item.process_id.is_not(None)]
    if from_ is not None:
        conds.append(Item.created_at >= from_)
    if to is not None:
        conds.append(Item.created_at <= to)
    stmt = (
        select(
            Item.process_id,
            func.min(Item.created_at),
            func.max(Item.created_at),
            func.count(Item.id),
        )
        .where(and_(*conds))
        .group_by(Item.process_id)
    )
    return {pid: (mn, mx, cnt) for pid, mn, mx, cnt in (await db.execute(stmt)).all()}


async def _windowed_entries(
    db: AsyncSession, from_: datetime | None, to: datetime | None
) -> list[ProcessTimelineEntry]:
    agg = await _window_item_agg(db, from_, to)
    if not agg:
        return []
    procs = (await db.execute(select(Process).where(Process.id.in_(agg.keys())))).scalars().all()
    entries = []
    for p in procs:
        mn, mx, cnt = agg[p.id]
        entries.append(
            ProcessTimelineEntry(
                id=p.id,
                title=p.title,
                status=ProcessStatus(p.status.value),
                area_id=p.area_id,
                project_id=p.project_id,
                start=mn,
                end=mx,  # последнее сообщение в окне — формальный конец для вида
                item_count=cnt,
            )
        )
    entries.sort(key=lambda e: e.start)
    return entries


@router.get("/processes/graph", response_model=ProcessGraph)
async def processes_graph(
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
    refresh: bool = Query(default=False),
    device: Device = Depends(get_current_device),
    db: AsyncSession = Depends(get_db),
) -> ProcessGraph:
    """Раздел «Связи»: процессы окна → тематические кластеры + связи с аргументацией.

    Темы берутся из персистентного дерева (process.theme_id) — без LLM и без лимита
    на число процессов. Рёбра LLM обосновывает пачками по парам-кандидатам (похожим
    по centroid), поэтому число процессов ничего не упирает. Если LLM выключен —
    отдаём узлы+темы без рёбер (граф всё равно полезен как карта тем).

    Результат кэшируется в памяти на graph_cache_ttl_seconds — повторные открытия
    отдаются мгновенно, без LLM-перегенерации. ?refresh=true форсирует пересчёт.
    """
    # Округляем окно до часа — стабильный ключ кэша (клиент шлёт to=now с мс).
    from_ = _floor_hour(from_)
    to = _floor_hour(to)
    cache_key = _graph_cache_key(from_, to)
    ttl = settings.graph_cache_ttl_seconds
    if not refresh and ttl > 0:
        cached = _graph_cache.get(cache_key)
        if cached is not None and (_time.monotonic() - cached[0]) < ttl:
            return cached[1]

    agg = await _window_item_agg(db, from_, to)
    if not agg:
        empty = ProcessGraph(window_from=from_, window_to=to, nodes=[], themes=[], edges=[])
        _graph_cache[cache_key] = (_time.monotonic(), empty)
        return empty

    # Процессы окна по убыванию активности; лимит — лишь предохранитель широких окон.
    ordered_ids = sorted(agg.keys(), key=lambda pid: agg[pid][2], reverse=True)
    max_procs = settings.graph_max_processes
    truncated = len(ordered_ids) > max_procs
    ordered_ids = ordered_ids[:max_procs]

    procs = (await db.execute(select(Process).where(Process.id.in_(ordered_ids)))).scalars().all()
    by_id = {p.id: p for p in procs}
    ordered_ids = [pid for pid in ordered_ids if pid in by_id]

    # Важность (H7) для окраски/балла + темы из БД (persistent, без LLM).
    imp_agg = await _load_item_agg(db, ordered_ids)
    theme_name_of = await _process_theme_names(db, [by_id[pid] for pid in ordered_ids])
    now = _utc_now()

    nodes = []
    infos = []
    for pid in ordered_ids:
        p = by_id[pid]
        mn, mx, cnt = agg[pid]
        i_mx, i_av, i_cnt = imp_agg.get(pid, (0, 0.0, 0))
        nodes.append(
            GraphNode(
                id=p.id,
                title=p.title,
                status=ProcessStatus(p.status.value),
                area_id=p.area_id,
                start=mn,
                end=mx,
                item_count=cnt,
                importance=_process_importance(i_mx, i_av, i_cnt, p.last_activity_at, p.status, now),
                max_importance=i_mx,
                theme=theme_name_of.get(pid),
            )
        )
        centroid = list(p.centroid) if p.centroid is not None else None
        infos.append(ProcInfo(id=p.id, title=p.title, summary=p.summary, centroid=centroid))

    # Темы графа = группировка узлов по персистентной теме (для кластеров/легенды).
    themes_map: dict[str, list[uuid.UUID]] = {}
    for pid in ordered_ids:
        name = theme_name_of.get(pid)
        if name:
            themes_map.setdefault(name, []).append(pid)
    themes = [GraphTheme(name=name, process_ids=ids) for name, ids in themes_map.items()]

    # Рёбра: LLM только по парам-кандидатам, пачками. Без LLM — просто карта тем.
    edges = []
    llm = build_provider(settings)
    if llm is not None:
        finder = RelationFinder(llm, settings)
        pairs = finder.candidate_pairs(infos)
        raw_edges = await finder.find_edges(infos, pairs)
        edges = [
            GraphEdge(
                source=uuid.UUID(e["source"]),
                target=uuid.UUID(e["target"]),
                relation=e["relation"],
                reason=e["reason"],
                confidence=e["confidence"],
            )
            for e in raw_edges
        ]

    graph = ProcessGraph(window_from=from_, window_to=to, nodes=nodes, themes=themes, edges=edges, truncated=truncated)
    _graph_cache[cache_key] = (_time.monotonic(), graph)
    return graph


@router.post("/processes/freeze")
async def trigger_freeze(
    device: Device = Depends(get_current_device),
) -> dict:
    """Ручной/крон-триггер заморозки процессов по тишине. Возвращает число замороженных."""
    from app.pipeline.runner import freeze_stale_processes

    frozen = await freeze_stale_processes()
    return {"frozen": frozen}


@router.get("/processes", response_model=ProcessPage)
async def list_processes(
    status_filter: ProcessStatus | None = Query(default=None, alias="status"),
    area_id: uuid.UUID | None = Query(default=None),
    project_id: uuid.UUID | None = Query(default=None),
    sort: str = Query(default="importance"),  # importance (H7) | recency
    cursor: str | None = Query(default=None),
    limit: int = Query(default=settings.default_page_limit, le=settings.max_page_limit, gt=0),
    device: Device = Depends(get_current_device),
    db: AsyncSession = Depends(get_db),
) -> ProcessPage:
    conditions = []
    if status_filter is not None:
        conditions.append(Process.status == ORMProcessStatus(status_filter.value))
    if area_id is not None:
        conditions.append(Process.area_id == area_id)
    if project_id is not None:
        conditions.append(Process.project_id == project_id)

    now = _utc_now()

    # По важности (H7): важность считается из сообщений, поэтому сортировать в SQL нельзя —
    # берём всех кандидатов по фильтрам, считаем H7, отдаём топ. Курсора нет (топ-N экран).
    if sort != "recency":
        base = select(Process)
        if conditions:
            base = base.where(and_(*conditions))
        rows = (await db.execute(base.limit(settings.process_rank_max))).scalars().all()
        agg = await _load_item_agg(db, [p.id for p in rows])
        out = []
        for p in rows:
            s = ProcessSchema.model_validate(p)
            _attach_importance(s, agg, now, p)
            out.append(s)
        out.sort(key=lambda s: s.importance, reverse=True)
        return ProcessPage(processes=out[:limit], next_cursor=None)

    # По свежести: прежняя cursor-пагинация + важность проставляем на странице.
    if cursor is not None:
        c_ts, c_id = _decode_cursor(cursor)
        conditions.append(
            or_(
                Process.last_activity_at < c_ts,
                and_(Process.last_activity_at == c_ts, Process.id < c_id),
            )
        )
    stmt = select(Process)
    if conditions:
        stmt = stmt.where(and_(*conditions))
    stmt = stmt.order_by(Process.last_activity_at.desc(), Process.id.desc()).limit(limit + 1)

    rows = (await db.execute(stmt)).scalars().all()
    has_more = len(rows) > limit
    page = rows[:limit]

    agg = await _load_item_agg(db, [p.id for p in page])
    processes = []
    for p in page:
        s = ProcessSchema.model_validate(p)
        _attach_importance(s, agg, now, p)
        processes.append(s)

    next_cursor = None
    if has_more and page:
        last = page[-1]
        next_cursor = _encode_cursor(last.last_activity_at, last.id)

    return ProcessPage(processes=processes, next_cursor=next_cursor)


@router.get("/processes/{process_id}", response_model=ProcessDetail)
async def get_process(
    process_id: uuid.UUID,
    device: Device = Depends(get_current_device),
    db: AsyncSession = Depends(get_db),
) -> ProcessDetail:
    proc = await db.get(Process, process_id)
    if proc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Процесс не найден")

    items = (
        (await db.execute(select(Item).where(Item.process_id == process_id).order_by(Item.created_at)))
        .scalars()
        .all()
    )
    detail = ProcessDetail.model_validate(proc)
    detail.items = [ItemSchema.model_validate(i) for i in items]
    # H7 из уже загруженных сообщений (без лишнего запроса).
    imps = [i.importance for i in items]
    if imps:
        mx = max(imps)
        detail.max_importance = mx
        detail.importance = _process_importance(mx, sum(imps) / len(imps), len(imps), proc.last_activity_at, proc.status, _utc_now())
    return detail
