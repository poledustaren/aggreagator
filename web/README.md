# Aggregat — веб-дашборд «реально важные вещи»

Фаза 3 проекта Aggregat: клиент поверх серверного REST API (`server/`, FastAPI),
показывающий отсортированную по важности ленту уведомлений, треды и
GTD-структуру (зоны/проекты/теги), чтобы разбирать входящий поток осознанно.

Дашборд ничего не знает о внутренней логике сервера (правила, LLM-роутер,
группировка) — он просто читает и патчит `Item`/`Group`/`Area`/`Project`/`Rule`
через эндпоинты `/v1/*`, описанные в `../contracts/openapi.yaml`.

## Стек

- **React 19 + TypeScript + Vite** — сборка и dev-сервер.
- **TanStack Query** — кэш данных, инвалидация после PATCH, бесконечный скролл
  (`useInfiniteQuery` + `IntersectionObserver`), оптимистичные апдейты карточек.
- **React Router v7** (`react-router-dom`, `BrowserRouter`) — навигация между
  экранами.
- **Tailwind CSS v4** (плагин `@tailwindcss/vite`) — тёмная тема, утилитарные
  классы, без визуального мусора.
- **vis-timeline / vis-data** — интерактивная временная шкала для экрана
  «Таймлайн процессов» (масштабирование, перетаскивание, клик по полосе).
  Подключается императивно (не как декларативный React-компонент): инстанс
  создаётся в `useEffect` на ref div'а и уничтожается в cleanup.
- **Типы API** — описаны вручную 1:1 с `openapi.yaml` в `src/types/api.ts`
  (никакой кодогенерации, но поля/типы соответствуют контракту построчно;
  при изменении контракта нужно синхронизировать этот файл руками).

## Запуск

```bash
cd web
npm install
npm run dev       # http://localhost:5173
```

Проверка типов и сборка:

```bash
npm run build      # tsc -b && vite build
# или только типы:
npx tsc --noEmit -p tsconfig.app.json
```

## Настройка подключения к серверу

Дашборд self-host: сам он не хранит ни URL сервера, ни секретов в коде.
При первом открытии (или после ответа 401 от API) вас перекинет на экран
**Настройки** (`/settings`), где нужно указать:

- **Base URL сервера** — например, `https://api.aggregat.local/v1` (тот же
  сервер, что поднят из `server/`, см. его `README.md` и `docker-compose.yml`).
- **Bearer-токен устройства** — opaque-токен, выданный сервером на
  `POST /devices:register` (обычно уже есть после регистрации Android-клиента;
  можно взять тот же токен или зарегистрировать отдельное «устройство» для
  дашборда).

Оба значения сохраняются в `localStorage` браузера (ключ
`aggregat.settings.v1`) и подставляются во все запросы как
`Authorization: Bearer <token>`. Кнопка «Сохранить и проверить связь» делает
тестовый запрос `GET /v1/tags` и показывает индикатор соединения.

## Экраны

| Маршрут      | Экран                          | Что делает |
|--------------|----------------------------------|------------|
| `/`          | Лента «Важное»                  | `GET /v1/items` с фильтрами (статус/зона/проект/тег/важность/дата), бесконечный скролл по `cursor`. Быстрые действия в карточке: Done, Snooze (с выбором времени), Dismiss, переназначение зоны/проекта — все через `PATCH /v1/items/{id}` с оптимистичным апдейтом кэша. |
| `/groups`    | Группы/треды                    | `GET /v1/groups`, раскрывающиеся треды со вложенными Item и теми же быстрыми действиями. |
| `/gtd`       | Управление GTD                  | CRUD зон (`/v1/areas`) и проектов (`/v1/projects`, привязка к зоне, флаг активности). |
| `/rules`     | Правила                         | Список + CRUD `/v1/rules`: условия match (source_app / title_regex / text_regex / category, всё по AND) и действие (set_area_id / set_project_id / add_tags / set_importance / confident). |
| `/processes` | Процессы                        | `GET /v1/processes` с фильтром по статусу (open/frozen/closed), бесконечный скролл по `cursor`. Клик по карточке открывает модалку с деталями процесса (`GET /v1/processes/{id}`) и списком его Item. |
| `/timeline`  | Таймлайн процессов              | `GET /v1/processes/timeline`, рендер на **vis-timeline**: каждая полоса — процесс, сгруппированный по зоне (`useAreas` + «Без зоны»). Клик по полосе открывает ту же модалку деталей. Кнопки День/Неделя/Месяц/Всё двигают окно через `timeline.setWindow`/`fit`. Ссылка «Процесс» на карточке Item (`/timeline?process=<id>`) сразу выделяет и фокусирует нужную полосу. |
| `/stats`     | Статистика                      | `GET /v1/stats/overview` (карточки: всего, за 7 дней, счётчики процессов), распределения по статусу/важности, `GET /v1/stats/by-area` и `/stats/by-source` (бар-таблицы), `GET /v1/stats/timeline?bucket=day|week|month` (CSS-график, переключатель бакета). |
| `/settings`  | Настройки                       | Base URL + Bearer-токен, индикатор соединения. Доступен без авторизации (иначе некуда было бы попасть при 401). |

Семантический поиск (`POST /v1/search`) описан в типах и API-клиенте
(`src/hooks/useSearch.ts`, `searchItems` в `src/api/client.ts`) для повторного
использования на будущих экранах; при 503 (эмбеддер выключен на сервере)
показывайте пользователю сообщение «семантический поиск недоступен» — так
уже обрабатывает `ApiRequestError` с `status === 503`.

### Маппинг статусов процесса на vis-timeline

| Статус процесса | `end` полосы                     | CSS-класс     | Вид |
|------------------|-----------------------------------|----------------|-----|
| `open`           | `new Date()` (текущий момент)     | `proc-open`    | Сплошная, яркий зелёный, открытый конец «сейчас» |
| `frozen`         | `entry.end` (= `last_activity_at`)| `proc-frozen`  | Пунктирная рамка, приглушённый серый |
| `closed`         | `entry.end` (= `ended_at`)        | `proc-closed`  | Сплошная заливка, синий |

Стили `.proc-open/.proc-frozen/.proc-closed` и остальная тёмная тема
vis-timeline — в `src/components/processes/vis-timeline-dark.css`.

Item теперь несёт поле `process_id`: если оно есть, в карточке (`ItemCard`)
показывается бейдж-ссылка «Процесс», ведущая на `/timeline?process=<id>` с
автоматическим выделением нужной полосы.

Все экраны, кроме `/settings`, защищены гардом `RequireSettings`
(`src/components/common/RequireSettings.tsx`): без настроенного подключения
или при получении 401 от API пользователя уводит на `/settings`.

## Структура

```
src/
  api/
    client.ts       # централизованный fetch-клиент (base URL + Bearer, обработка 401)
    settings.ts      # localStorage-хранилище настроек подключения
  types/api.ts        # типы 1:1 с contracts/openapi.yaml
  hooks/               # TanStack Query хуки по ресурсам (items/groups/areas/projects/rules/tags/settings/
                        # processes/stats/search)
  components/
    common/            # Layout, StateViews (loading/error/empty), ImportanceBadge, RequireSettings
    items/             # ItemCard + быстрые действия (SnoozeMenu, ReassignMenu), ItemFilters
    groups/            # GroupCard (раскрывающийся тред)
    gtd/                # формы и списки Area/Project
    rules/              # форма и список Rule
    processes/          # VisTimelineView (обёртка vis-timeline), ScaleControls, ProcessCard,
                         # ProcessDetailPanel, ProcessStatusBadge, vis-timeline-dark.css
    stats/               # StatCard, DistributionBars, BarListTable, TimelineChart
  pages/                # по одному компоненту-странице на маршрут (включая TimelinePage, StatsPage,
                        # ProcessesPage)
  App.tsx               # роутинг + QueryClientProvider
```

## Стыковка с server/

Дашборд — чистый клиент контракта `contracts/openapi.yaml`, реализация
сервера (`server/`, FastAPI + Postgres) не читается и не импортируется
из `web/`. Единственная связь — HTTP по адресу, указанному в настройках.
Если сервер поднят локально через `server/docker-compose.yml`, укажите его
адрес (по умолчанию порт см. в `server/README.md` и `server/docker-compose.yml`)
как base URL в настройках дашборда.
