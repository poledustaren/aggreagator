# Aggregat — процессы, RAG и таймлайн (дизайн)

> Дата: 2026-07-02 · Модель: opus · Надстройка над Фазами 0–3

## Цель

Видеть **процессы жизни** во времени: сообщения, относящиеся к одной проблеме/теме,
собираются в **Process** с началом, ходом и концом — даже если растянуты на дни.
Визуализация — масштабируемый таймлайн (Гант) со стартами/концами.

## Решения (брейншторм 2026-07-02)

| Вопрос | Решение |
|---|---|
| Emb-модель | **bge-m3** (1024d, мультиязычная, сильная на RU) |
| Emb-рантайм | **Локальный/хостовый Ollama** (Cloud НЕ хостит emb-модели — проверено). LLM остаётся glm-5.2:cloud |
| Жизненный цикл процесса | 3 состояния: `open` / `frozen` (тишина) / `closed` (явный признак конца) |
| Таймлайн UI | **vis-timeline** (нативный zoom/масштаб/диапазоны) |

## RAG / pgvector

- Postgres-образ → `pgvector/pgvector:pg16`, `CREATE EXTENSION vector`.
- `item.embedding vector(1024)` + HNSW-индекс (`vector_cosine_ops`).
- `EmbeddingProvider` (Protocol) → `OllamaEmbeddingProvider` (`/api/embed`, модель bge-m3, локально).
- RAG используется: (1) привязка Item к процессу, (2) семантический поиск `/v1/search`.

## Process — модель и жизненный цикл

```
process(id, title, summary, status, area_id, project_id,
        started_at, last_activity_at, ended_at, item_count, centroid vector(1024))
item.process_id → process(id)
```

Состояния:
- **open** — идёт; на таймлайне полоса до «сейчас» (открытый конец).
- **frozen** — тишина ≥ N дней (по умолчанию 7, `PROCESS_FREEZE_IDLE_DAYS`); полоса
  заканчивается на `last_activity_at`, стиль пунктиром. **Может ожить**: новое
  связанное сообщение → снова `open`.
- **closed** — LLM увидел явный признак завершения; полоса до `ended_at`, сплошная.

## Пайплайн: привязка к процессу (после классификации)

`ProcessLinker.link(db, item, ctx)`:
1. Эмбеддим текст Item (title+summary) → `item.embedding`.
2. **RAG**: cosine-поиск top-K процессов в статусе open/frozen в окне недавности
   (буст за ту же зону/проект).
3. **LLM-решение** по кандидатам (glm-5.2:cloud): `attach:<id>` | `new` | плюс флаг
   `ended` (явный признак завершения). Без LLM — эвристика: attach если cosine > порога, иначе new.
4. Применяем:
   - attach → `process_id`, `last_activity_at=now`, инкремент `item_count`,
     инкрементальный пересчёт centroid; если был `frozen` → `open` (ожил).
   - new → создать процесс (centroid = emb, started_at=now).
   - ended → `status=closed`, `ended_at=now`.

Фоновый «морозильник» (`freeze_stale_processes`): open-процессы без активности
≥ `PROCESS_FREEZE_IDLE_DAYS` → `frozen`. Тишина замораживает, явный признак — закрывает.

## Статистика (`/v1/stats/*`)

- `overview` — счётчики по статусам/важности, поток/день, кол-во открытых процессов.
- `by-area`, `by-source` — распределения.
- `timeline` — item'ы по бакетам времени (для графиков).

## API (расширение contracts/openapi.yaml)

```
GET /v1/processes            ?status&area_id&project_id&cursor&limit
GET /v1/processes/{id}       (+ вложенные items)
GET /v1/processes/timeline   ?from&to&scale   → спаны для vis-timeline
GET /v1/stats/overview
GET /v1/stats/by-area
GET /v1/stats/by-source
GET /v1/stats/timeline       ?from&to&bucket=day|week|month
POST /v1/search              {query} → семантический RAG-поиск по items
```

## Сайт

- Экран `/timeline` — vis-timeline: полоса на процесс (цвет по зоне, стиль по статусу),
  масштаб день/неделя/месяц, клик → сообщения процесса.
- Экран `/stats` — карточки и графики по /v1/stats/*.
- В карточке Item — ссылка на процесс.
