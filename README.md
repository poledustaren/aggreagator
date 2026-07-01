# Aggregat

Система, которая ловит все пуш-уведомления с телефона, на сервере группирует их,
тегирует по GTD-структуре (зоны/проекты) и оценивает важность — чтобы видеть
**реально важные вещи** и заниматься ими, а не тонуть в шуме.

```
Android (ловит пуши) ──ingest──▶ Server (FastAPI+PG: Rules→LLM-роутер→Grouping) ◀──REST── Web (дашборд «важного»)
```

Компоненты:
- **[android/](android/)** — Kotlin-приложение, `NotificationListenerService` → очередь (Room) → батчи на сервер.
- **[server/](server/)** — FastAPI + Postgres. Ingestion, классификация (правила + LLM), CRUD, grouping.
- **[web/](web/)** — React + TypeScript дашборд.
- **[contracts/openapi.yaml](contracts/openapi.yaml)** — контракт API (источник истины).
- **[docs/plans/](docs/plans/)** — дизайн системы.

Адрес сервера в сети **Netbird**: `http://100.93.215.38:8000` — уже прописан
дефолтом в приложении и на сайте.

Классификация — **Ollama Cloud, модель `glm-5.2:cloud`** (нужен API-ключ с ollama.com).

---

## 1. Запуск сервера + сайта (Docker)

```bash
# 1. Настроить LLM-ключ
cp server/.env.example server/.env
#   → впиши OLLAMA_API_KEY=<ключ с ollama.com>  (Settings → API keys)
#   провайдер и модель glm-5.2:cloud уже прописаны

# 2. Поднять весь стек
docker compose up -d --build
```

После запуска:
- **Сервер (API):** `http://100.93.215.38:8000` (и `http://localhost:8000` локально). Docs: `/docs`.
- **Сайт (дашборд):** `http://100.93.215.38:8080` (и `http://localhost:8080`).

Миграции БД (`alembic upgrade head`) применяются автоматически при старте контейнера сервера.

### Без Docker (dev)
```bash
# Сервер
cd server && python3.11 -m venv .venv && source .venv/Scripts/activate
pip install -e ".[dev,llm]"
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000

# Сайт
cd web && npm install && npm run dev
```

---

## 2. Первичная настройка данных

Через сайт (`/gtd`) или API создай **зоны** (Работа, Здоровье, Финансы, …) и
**проекты** внутри них — классификатор привяжет уведомления к ним.
При желании добавь **правила** (`/rules`): напр. «`com.bank` → зона Финансы,
importance 80, confident» — такие уведомления классифицируются без LLM.

---

## 3. Телефон (Android)

Собрать и залить APK по USB — см. **[android/README.md](android/README.md)** и скрипты
**[android/scripts/deploy-usb.sh](android/scripts/deploy-usb.sh)** (Linux/macOS) /
**[android/scripts/deploy-usb.bat](android/scripts/deploy-usb.bat)** (Windows). Кратко:

```bash
# на компе с Android SDK, телефон подключён по USB с включённой отладкой
cd android
./scripts/deploy-usb.sh          # Linux / macOS: gradle installDebug → adb на телефон
# или
scripts\deploy-usb.bat          # Windows
```

На телефоне: открыть приложение → выдать доступ к уведомлениям (кнопка в настройках
приложения) → адрес сервера уже стоит (`http://100.93.215.38:8000`) → приложение
само зарегистрируется и получит токен.

**Токен для сайта:** после регистрации устройства скопируй его токен (виден в
приложении / в БД) и введи на сайте в разделе «Настройки» вместе с URL сервера.

---

## Проверка связки (smoke-тест)

```bash
scripts/smoke-test.sh            # поднимает Postgres, гоняет ingest→классификацию→feed
```

## Статус
Все 4 фазы реализованы. Тесты: сервер — 35 (ingestion/CRUD, реальный Postgres) +
19 (классификация, без БД/сети); сайт — сборка `tsc`+`vite build` зелёная.
