# Aggregat — сервер (Фаза 2a)

Серверная часть проекта Aggregat: ingestion пуш-уведомлений с Android-устройств,
CRUD по Area/Project/Rule, лента Item и группы (треды). Классификационный
пайплайн (rules-движок + LLM-роутер) — это Фаза 2b, здесь есть только чистый
интерфейс `Classifier` и заглушка `PassthroughClassifier` (см. `app/pipeline/`).

## Стек

- FastAPI + Pydantic v2
- Async SQLAlchemy 2.0 (драйвер asyncpg) — обоснование см. в `app/db.py`
- Alembic для миграций (первая ревизия выполняет `db/schema.sql` как есть)
- PostgreSQL 16

## Запуск через docker-compose

```bash
cd server
docker compose up --build
```

Поднимет Postgres (`5432`) и приложение (`8000`). При старте контейнер `app`
сам применяет миграции (`alembic upgrade head`) перед запуском uvicorn — см.
`CMD` в `Dockerfile`.

Проверка: `curl http://localhost:8000/health` → `{"status": "ok"}`.

Swagger UI: `http://localhost:8000/docs`.

## Локальный запуск без docker

Требуется Python 3.11+ и доступный PostgreSQL 16.

```bash
cd server
python -m venv .venv
. .venv/Scripts/activate  # Windows Git Bash
pip install -e ".[dev]"

cp .env.example .env
# отредактировать DATABASE_URL в .env под свою БД

alembic upgrade head
uvicorn app.main:app --reload
```

## Переменные окружения

См. `.env.example`. Основные:

- `DATABASE_URL` — строка подключения async SQLAlchemy (`postgresql+asyncpg://...`)
- `LOG_LEVEL` — уровень логирования
- `SQL_ECHO` — echo SQL-запросов (только для отладки)

## Миграции (Alembic)

- `alembic/versions/0001_initial_schema.py` — читает `db/schema.sql` и выполняет
  его построчно через `op.execute(...)`. `db/schema.sql` — источник истины по
  схеме (см. корневой `server/db/schema.sql`), Alembic его не дублирует
  в виде `op.create_table(...)`, чтобы не было риска расхождения.
- Дальнейшие миграции (после 0001) создаются обычным способом:
  ```bash
  alembic revision -m "описание изменения"
  # отредактировать upgrade()/downgrade()
  alembic upgrade head
  ```
- ORM-модели в `app/models/entities.py` синхронизированы со схемой вручную
  (1:1 с `schema.sql`) — используются для запросов, а не для генерации DDL.

## Структура

```
app/
  main.py          — точка входа FastAPI, монтирование роутеров под /v1
  config.py        — pydantic-settings (DATABASE_URL и т.д.)
  db.py            — async engine/session, Base
  auth.py          — bearer-токен устройства (хранится только SHA-256 хэш)
  models/          — SQLAlchemy ORM-модели (1:1 со schema.sql)
  schemas/         — pydantic DTO по contracts/openapi.yaml
  api/             — роутеры: devices, ingest, items, groups, areas,
                     projects, rules, tags
  pipeline/
    classifier.py  — Protocol Classifier + ClassifyContext/ClassificationResult
                     — КОНТРАКТ для Фазы 2b (RulesEngine + LLMRouter)
    passthrough.py — PassthroughClassifier: заглушка 1:1 без реальной логики
    runner.py      — фоновая обработка после ingest (BackgroundTasks)
alembic/           — миграции
tests/             — pytest + httpx AsyncClient, требуют реальный Postgres
db/schema.sql       — источник истины по схеме (Фаза 0, не менять здесь)
```

## Фоновый классификационный пайплайн

`POST /v1/notifications:ingest` вставляет `raw_notification` батчем (идемпотентно
по `(device_id, client_id)` — `ON CONFLICT DO NOTHING`) и сразу отвечает `202`.
Обработка новых записей (создание `Item`, upsert `Group` по `group_key`, запись
аудита в `Classification`) выполняется в `BackgroundTasks` после ответа —
см. `app/pipeline/runner.py::run_pipeline_for_raw_notifications`.

Точка подмены классификатора для Фазы 2b — функция `get_classifier()` в
`app/pipeline/runner.py`. Сейчас она возвращает `PassthroughClassifier`;
разработчику 2b нужно подставить свою реализацию, соответствующую протоколу
`Classifier` (`app/pipeline/classifier.py`), — больше никаких изменений в
ingest/runner не требуется.

## Тесты

```bash
pip install -e ".[dev]"

# запустить одноразовый Postgres для тестов, например:
docker run -d --name aggregat_test_pg \
  -e POSTGRES_USER=aggregat -e POSTGRES_PASSWORD=aggregat -e POSTGRES_DB=aggregat_test \
  -p 55432:5432 postgres:16-alpine

TEST_DATABASE_URL="postgresql+asyncpg://aggregat:aggregat@localhost:55432/aggregat_test" \
  pytest -v
```

Тесты требуют реального PostgreSQL (используются `TEXT[]`, `JSONB` и
Postgres-enum из `schema.sql` — SQLite-совместимость не гарантируется и
намеренно не поддерживается). `conftest.py` сам применяет `db/schema.sql`
к тестовой БД и чистит таблицы (`TRUNCATE`) между тестами.

Покрытие: регистрация устройства, ingest + идемпотентность (повторный
`client_id` → `duplicates` растёт, `accepted` не растёт), авторизация
(401 без токена / с невалидным токеном), лента items (фильтры + сортировка
+ cursor-пагинация), PATCH item (включая `classified_by=manual` при ручном
reassign), areas/projects CRUD, groups (nested items, importance=max),
rules CRUD, tags, unit-тест `PassthroughClassifier`.
