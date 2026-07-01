FROM python:3.12-slim

WORKDIR /app

# Системные зависимости для сборки asyncpg (при необходимости) минимальны на slim,
# но libpq не нужен — asyncpg сам по себе бинарный протокол без libpq.
RUN pip install --no-cache-dir --upgrade pip

COPY pyproject.toml ./
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./
COPY db ./db

RUN pip install --no-cache-dir ".[dev]"

EXPOSE 8000

CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
