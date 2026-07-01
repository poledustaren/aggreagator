-- Aggregat — схема БД (Postgres) · фаза 0
-- Соответствует contracts/openapi.yaml
-- Порядок таблиц учитывает FK-зависимости (исполняется сверху вниз без ошибок).

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- gen_random_uuid()

CREATE TYPE item_status AS ENUM ('inbox', 'snoozed', 'done', 'dismissed');
CREATE TYPE classified_by AS ENUM ('rules', 'llm', 'manual');

-- ── Устройства ────────────────────────────────────────────────────────────
CREATE TABLE device (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform    TEXT NOT NULL CHECK (platform IN ('android')),
    device_name TEXT NOT NULL,
    push_token  TEXT,
    token_hash  TEXT NOT NULL,            -- bearer-токен хранится только как хэш
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX device_token_hash_idx ON device (token_hash);

-- ── GTD-ядро ──────────────────────────────────────────────────────────────
CREATE TABLE area (
    id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name  TEXT NOT NULL,
    color TEXT,
    sort  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE project (
    id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    area_id UUID NOT NULL REFERENCES area(id) ON DELETE CASCADE,
    name    TEXT NOT NULL,
    active  BOOLEAN NOT NULL DEFAULT true,
    due_at  TIMESTAMPTZ
);
CREATE INDEX project_area_idx ON project (area_id);
CREATE INDEX project_active_idx ON project (active) WHERE active;

-- ── Группы (треды) ────────────────────────────────────────────────────────
CREATE TABLE "group" (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_key        TEXT NOT NULL,       -- ключ дедупа от пайплайна
    title            TEXT,
    area_id          UUID REFERENCES area(id) ON DELETE SET NULL,
    project_id       UUID REFERENCES project(id) ON DELETE SET NULL,
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX group_key_idx ON "group" (group_key);

-- ── Item (обогащённая единица) ────────────────────────────────────────────
CREATE TABLE item (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title            TEXT,
    summary          TEXT,
    importance       INTEGER NOT NULL DEFAULT 0 CHECK (importance BETWEEN 0 AND 100),
    status           item_status NOT NULL DEFAULT 'inbox',
    suggested_action TEXT,
    area_id          UUID REFERENCES area(id) ON DELETE SET NULL,
    project_id       UUID REFERENCES project(id) ON DELETE SET NULL,
    group_id         UUID REFERENCES "group"(id) ON DELETE SET NULL,
    tags             TEXT[] NOT NULL DEFAULT '{}',
    source_apps      TEXT[] NOT NULL DEFAULT '{}',
    classified_by    classified_by,
    confidence       REAL CHECK (confidence BETWEEN 0 AND 1),
    snoozed_until    TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX item_feed_idx ON item (status, importance DESC, created_at DESC);
CREATE INDEX item_area_idx ON item (area_id);
CREATE INDEX item_project_idx ON item (project_id);
CREATE INDEX item_group_idx ON item (group_id);
CREATE INDEX item_tags_idx ON item USING GIN (tags);

-- ── Сырые уведомления ─────────────────────────────────────────────────────
CREATE TABLE raw_notification (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id   UUID NOT NULL REFERENCES device(id) ON DELETE CASCADE,
    client_id   TEXT NOT NULL,            -- ключ идемпотентности с устройства
    source_app  TEXT NOT NULL,
    app_label   TEXT,
    title       TEXT,
    text        TEXT,
    subtext     TEXT,
    category    TEXT,
    posted_at   TIMESTAMPTZ NOT NULL,
    extras      JSONB,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    item_id     UUID REFERENCES item(id) ON DELETE SET NULL
);
-- идемпотентность ingest: один client_id на устройство
CREATE UNIQUE INDEX raw_notification_idem_idx ON raw_notification (device_id, client_id);
CREATE INDEX raw_notification_item_idx ON raw_notification (item_id);

-- ── Правила классификации ─────────────────────────────────────────────────
CREATE TABLE rule (
    id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name     TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 100,   -- меньше = раньше
    match    JSONB NOT NULL,                 -- {source_app,title_regex,text_regex,category}
    action   JSONB NOT NULL,                 -- {set_area_id,set_project_id,add_tags,set_importance,confident}
    enabled  BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX rule_order_idx ON rule (enabled, priority);

-- ── Аудит классификации ───────────────────────────────────────────────────
CREATE TABLE classification (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id     UUID NOT NULL REFERENCES item(id) ON DELETE CASCADE,
    layer       classified_by NOT NULL,
    model       TEXT,                         -- claude-haiku-4-5 / claude-opus-4-8 / rule:<id>
    confidence  REAL,
    raw_output  JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX classification_item_idx ON classification (item_id);
