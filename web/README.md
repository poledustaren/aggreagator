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
- **vis-timeline / vis-data** — интерактивная временная шкала для экранов
  «Таймлайн процессов» и «Связи» (масштабирование, перетаскивание, клик по
  полосе). Подключается императивно (не как декларативный React-компонент):
  инстанс создаётся в `useEffect` на ref div'а и уничтожается в cleanup.
- **vis-network** — граф процессов на экране «Связи» (то же семейство, что
  vis-timeline; тот же императивный паттерн — `new Network(container, {nodes,
  edges}, options)` в `useEffect`, `destroy()` в cleanup).
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
| `/timeline`  | Таймлайн процессов              | `GET /v1/processes/timeline?from&to` с пикером временного окна (пресеты Сегодня/7 дней/30 дней + произвольные даты, дефолт — 7 дней), рендер на **vis-timeline**: каждая полоса — процесс, сгруппированный по зоне (`useAreas` + «Без зоны»). Клик по полосе открывает ту же модалку деталей. Кнопки День/Неделя/Месяц/Всё двигают окно через `timeline.setWindow`/`fit`. Ссылка «Процесс» на карточке Item (`/timeline?process=<id>`) сразу выделяет и фокусирует нужную полосу. |
| `/relations` | Связи                           | `GET /v1/processes/graph?from&to` (LLM на лету, ~несколько секунд) с тем же пикером окна. Граф процессов на **vis-network**: узлы — процессы (цвет по теме, размер по числу сообщений), рёбра — связи между ними с LLM-аргументацией (тип связи, обоснование, уверенность). Клик по узлу/ребру открывает боковую панель с деталями. Таймлайн окна снизу (vis-timeline, группировка по темам) синхронизирует выделение с графом. См. подробности ниже. |
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

### Оконный режим таймлайна (`from`/`to`)

`/timeline` всегда запрашивает `/v1/processes/timeline` **с окном** (`from`/
`to` из пикера, дефолт — последние 7 дней). В этом режиме сервер отдаёт
процессы «оконно-конечными»: `start` — первое сообщение процесса в окне,
`end` — последнее сообщение процесса В ОКНЕ (заполнен всегда, даже для
`open` — такой процесс не тянется до «сейчас», а формально завершается на
виде). Без окна (если когда-нибудь понадобится полный режим) `end` может
быть `null` для `open` — `VisTimelineView` в этом случае по-прежнему рисует
полосу до текущего момента (`entry.end ?? new Date()`).

### Раздел «Связи» (`/relations`)

`GET /v1/processes/graph?from&to` — LLM на лету анализирует процессы
выбранного окна, группирует их в темы и находит связи между ними с
аргументацией. Запрос не быстрый (несколько секунд), возвращает 503, если
LLM выключен на сервере (`llm_provider=none`).

- **Граф** (`RelationsGraph`, vis-network): узел = процесс (`label` = title,
  цвет заливки = цвет темы узла, размер = `log2(item_count)` — от 16 до
  42px), рамка узла — по статусу (open/frozen/closed, как на бейдже). Ребро =
  связь (`label` = человекочитаемое название `relation`, толщина и цвет —
  по `confidence`/типу связи; для `causal`/`follow_up` рисуется стрелка).
  Клик по узлу → инфопанель (заголовок, диапазон в окне, `item_count`,
  ссылки на `/timeline?process=<id>` и `/processes`). Клик по ребру →
  панель с `relation` + `reason` + `confidence` (сама LLM-аргументация,
  ради которой раздел и существует). Клик по пустому месту снимает
  выделение.
- **Темы**: цвет назначается детерминированно по индексу появления темы в
  `data.themes` (фиксированная палитра из 8 цветов по кругу); узлы без темы
  — нейтральный серый. Легенда (`RelationsLegend`) показывает и типы связей,
  и темы текущего окна.
- **Таймлайн окна** (`RelationsTimeline`) — тот же паттерн, что
  `VisTimelineView`, но группировка **по темам** (не по зонам) и вход —
  `GraphNode[]` вместо `ProcessTimelineEntry[]`. Выделение синхронизировано
  с графом в обе стороны через общий `selectedNodeId` в `RelationsPage`
  (клик по узлу графа фокусирует полосу и наоборот).
- **Пикер окна** (`WindowPicker`, `src/components/common/`) — общий для
  `/relations` и `/timeline`: пресеты Сегодня/7 дней/30 дней + произвольные
  `from`/`to` через `<input type="datetime-local">`. Смена окна сбрасывает
  выделение и перезапрашивает граф/таймлайн.
- **Состояния**: `isPending` (не `isLoading`!) — граф долгий (LLM), явно
  просим пользователя подождать; `truncated=true` от сервера → баннер
  «показаны 24 крупнейших процесса»; `nodes.length === 0` → пусто; 503 →
  отдельное сообщение «LLM выключен».

  ⚠️ **TanStack Query v5 нюанс**: при недоступном сервере запрос может
  перейти в `fetchStatus === 'paused'` вместо завершения как `error`
  (`networkMode: 'online'` по умолчанию ставит запрос на паузу, если
  внутренний `onlineManager` считает сеть недоступной — это может не
  совпадать с `navigator.onLine`, особенно в headless/CDP-браузерах). В этом
  состоянии `isPending === true`, но `isLoading === false` и
  `isError === false` — старый паттерн `if (isLoading) ... else if (isError)
  ...` оставляет экран пустым. И `/relations`, и `/timeline` проверяют
  `fetchStatus === 'paused' && isPending` отдельно и показывают понятное
  сообщение с кнопкой «Повторить» вместо белого экрана.

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
    common/            # Layout, StateViews (loading/error/empty), ImportanceBadge, RequireSettings,
                        # WindowPicker (пикер from/to, общий для /relations и /timeline)
    items/             # ItemCard + быстрые действия (SnoozeMenu, ReassignMenu), ItemFilters
    groups/            # GroupCard (раскрывающийся тред)
    gtd/                # формы и списки Area/Project
    rules/              # форма и список Rule
    processes/          # VisTimelineView (обёртка vis-timeline), ScaleControls, ProcessCard,
                         # ProcessDetailPanel, ProcessStatusBadge, vis-timeline-dark.css
    relations/           # RelationsGraph (обёртка vis-network), RelationsTimeline (vis-timeline
                        # по темам), RelationsLegend, SelectionPanel
    stats/               # StatCard, DistributionBars, BarListTable, TimelineChart
  pages/                # по одному компоненту-странице на маршрут (включая TimelinePage, RelationsPage,
                        # StatsPage, ProcessesPage)
  App.tsx               # роутинг + QueryClientProvider
```

## Стыковка с server/

Дашборд — чистый клиент контракта `contracts/openapi.yaml`, реализация
сервера (`server/`, FastAPI + Postgres) не читается и не импортируется
из `web/`. Единственная связь — HTTP по адресу, указанному в настройках.
Если сервер поднят локально через `server/docker-compose.yml`, укажите его
адрес (по умолчанию порт см. в `server/README.md` и `server/docker-compose.yml`)
как base URL в настройках дашборда.
