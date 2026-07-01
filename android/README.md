# Aggregat — Android-клиент (Фаза 1)

Нативное Android-приложение на Kotlin, которое перехватывает все системные push-уведомления
через `NotificationListenerService`, складывает их в локальную очередь (Room) и батчами
отправляет на self-host сервер Aggregat (см. `../server/` и контракт `../contracts/openapi.yaml`).

## Требования

- Android Studio (Koala или новее) или Android SDK вручную (compileSdk 34, min SDK 26).
- JDK 17.
- `adb` из Android SDK platform-tools доступен в PATH (скрипт `deploy-usb.bat`
  автоматически ищет `adb` в стандартном расположении Windows, если его нет в PATH).
- Реальное Android-устройство или эмулятор с Android 8.0 (API 26)+.

## Сборка

### Вариант A — из терминала

**Linux / macOS:**
```bash
cd android
./gradlew assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk
```

**Windows:**
```cmd
cd android
gradlew.bat assembleDebug
REM APK: app\build\outputs\apk\debug\app-debug.apk
```

Если `gradlew`/`gradlew.bat` отсутствуют, сгенерируйте wrapper в Android Studio
(`File → Sync Project with Gradle Files`) либо командой
`gradle wrapper --gradle-version 8.9`, если Gradle установлен локально.

### Вариант B — Android Studio

Открыть каталог `android/` как проект — Gradle sync подтянет все зависимости,
а `Build → Build Bundle(s) / APK(s) → Build APK(s)` соберёт `app-debug.apk`.

## Установка на телефон по USB

1. На телефоне включить **Отладку по USB**:
   `Настройки → Система → Для разработчиков → Отладка по USB`.
2. Подключить телефон к компьютеру USB-кабелем и подтвердить доверие этому компьютеру.
3. Убедиться, что устройство видно:
   ```bash
   adb devices
   ```
   Должно вывести что-то вроде `41051FDJG004SU device`.
4. Запустить скрипт деплоя:
   - **Linux / macOS:** `android/scripts/deploy-usb.sh`
   - **Windows:** `android\scripts\deploy-usb.bat`

   Или вручную:
   ```bash
   cd android
   ./gradlew installDebug     # Linux / macOS
   gradlew.bat installDebug   # Windows
   ```

## Troubleshooting

| Симптом | Причина / решение |
|---|---|
| `adb: command not found` | Добавь `platform-tools` в PATH или используй полный путь: `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`. |
| `no devices/emulators found` | Проверь кабель, включи отладку по USB, подтверди диалог «Разрешить отладку» на телефоне. |
| `Conflicting declarations: MIN_BACKOFF_MILLIS` | В `app/src/main/kotlin/ru/aggregat/app/work/UploadScheduler.kt` остался дубль константы — удали повторное объявление. |
| Ошибки вида `Overload resolution ambiguity` | Часто следствие дублирующих объявлений в том же файле; читай сообщение компилятора и убирай дубль. |
| `Could not resolve all dependencies` / `AGP` mismatch | Проверь JDK 17 и согласованность версий в `gradle/libs.versions.toml` / `build.gradle.kts`. |
| Установка падает с `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | На телефоне уже стоит APK с другой подписью — удали старое приложение вручную. |

## Настройка после установки

1. Запустить приложение — откроется единственный экран настроек.
2. Ввести **адрес self-host сервера** (например, `https://aggregat.mydomain.com` или
   `http://192.168.1.50:8000` для локальной сети) и нажать «Зарегистрировать устройство».
   Приложение вызовет `POST /v1/devices:register`, получит `device_id` и bearer-`token`
   и сохранит их в `EncryptedSharedPreferences` (AES-256, ключ в Android Keystore).
3. Нажать «Открыть настройки доступа к уведомлениям» — откроется системный экран
   `Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS`. Включить переключатель для Aggregat.
   Без этого разрешения `NotificationListenerService` не получит ни одного уведомления —
   это ограничение системы Android, обойти в коде нельзя.
4. Экран показывает статус доступа к уведомлениям и счётчики «Ожидают отправки» / «Отправлено».

## Архитектура

```
app/src/main/kotlin/ru/aggregat/app/
├── AggregatApp.kt            — Application, ручная сборка зависимостей (DI)
├── data/
│   ├── local/                — Room: PendingNotification, DAO, Database, Converters
│   │                            + DeviceSettingsStore (EncryptedSharedPreferences)
│   ├── remote/                — Retrofit: AggregatApi, DTO (ApiModels), ApiClientFactory
│   └── repository/            — NotificationRepository: единая точка входа для
│                                 Service/Worker, скрывает Room+Retrofit за одним API
├── service/
│   ├── AggregatNotificationListenerService.kt — перехват системных уведомлений
│   ├── ClientIdGenerator.kt   — стабильный client_id = SHA-256(sbn.key + postTime)
│   └── IsoTime.kt             — форматирование posted_at в ISO-8601
├── work/
│   ├── UploadWorker.kt        — CoroutineWorker: цикл отправки батчей по 100
│   └── UploadScheduler.kt     — периодическая задача (15 мин) + немедленный триггер
└── ui/
    ├── MainActivity.kt
    ├── settings/               — SettingsScreen (Compose) + SettingsViewModel
    └── theme/                  — Material3 тема
```

### Ключевые решения

**DI: ручная сборка (Service Locator в `AggregatApp`), без Hilt.**
Граф зависимостей плоский (Room + Retrofit + один сервис + один воркер + один экран).
Hilt добавил бы KSP-кодоген и конфигурацию ради контейнера, который здесь выражается
тремя полями в `Application`. Тот же принцип KISS, что применялся в других личных
Android-проектах: ручной DI, пока граф действительно не разрастётся.

**Сериализация: kotlinx.serialization**, не Moshi/Gson. Нативна для Kotlin, не требует
reflection на рантайме, схемы DTO (`ApiModels.kt`) один в один повторяют
`contracts/openapi.yaml` (snake_case через `@SerialName`).

**Стратегия client_id (идемпотентность).**
`ClientIdGenerator.generate(sbn.key, sbn.postTime)` = `SHA-256("$sbnKey|$postTime")`.
`StatusBarNotification.key` уникален в рамках системы для конкретного уведомления
(пакет + id + tag + user), но одно и то же уведомление может прийти в
`onNotificationPosted` повторно (обновление прогресса и т.п.) — если `postTime` не
меняется, `client_id` остаётся тем же, и сервер отбросит дубликат по контракту.
Если приложение переиспользует id уведомления для нового события — `postTime` меняется,
и это уже другой `client_id`, как и должно быть. Заголовок/текст в хэш намеренно не
включены: редактирование текста существующего уведомления не должно плодить дубли.

**Локальная очередь на Room.** Уведомление сначала пишется в таблицу
`pending_notification` (статус `PENDING`), потом асинхронно отправляется. Уникальный
индекс по `clientId` — локальная дедупликация (`OnConflictStrategy.IGNORE`).
После успешной отправки (202) статус меняется на `SENT`. Старые `SENT`-записи
(>7 дней) периодически удаляются `UploadWorker`, чтобы БД не росла бесконечно.

**Batch uploader.** `WorkManager` `PeriodicWorkRequest` каждые 15 минут (минимально
допустимый Android интервал для периодических задач) + немедленный `OneTimeWorkRequest`,
если после очередной вставки в очереди накопилось ≥20 `PENDING`-записей — не ждём
до 15 минут, если пришла пачка уведомлений разом. Отправка идёт батчами по ≤100 записей
в цикле, пока очередь не опустеет. При сетевой ошибке или 5xx — `Result.retry()`
(WorkManager сам делает экспоненциальный backoff, минимум 30 сек). При 401 —
токен сбрасывается (`DeviceSettingsStore.clearRegistration()`), воркер завершается
`Result.failure()` без бесконечных попыток; пользователю нужно зайти на экран настроек
и зарегистрировать устройство заново. При остальных 4xx — тоже `Result.failure()`
(повторять с теми же данными бессмысленно).

**Фильтрация мусора.** В `AggregatNotificationListenerService` отбрасываются:
- уведомления от самого Aggregat (`sbn.packageName == packageName`);
- `FLAG_ONGOING_EVENT` и `FLAG_FOREGROUND_SERVICE` (таймеры, музыка, "приложение работает
  в фоне" — не события, а служебный шум);
- `FLAG_GROUP_SUMMARY` (пустая сводная нотификация без собственного контента);
- уведомления без `title` И без `text` одновременно (нет полезной нагрузки) —
  проверка продублирована и в сервисе, и в `NotificationRepository.enqueue()`.

## Известные ограничения / что доделать вручную

- Иконка приложения — заглушка (`mipmap-anydpi-v26/ic_launcher.xml` с одноцветным фоном),
  не сгенерирован полный набор PNG для старых плотностей экрана и legacy-иконки
  (`mipmap-*/ic_launcher.png`) — для API 26+ adaptive icon достаточно, но стоит заменить
  на нормальный дизайн.
- Нет обработки Android 13+ runtime-запроса `POST_NOTIFICATIONS` (разрешение объявлено
  в манифесте, но код явно не запрашивает его в рантайме через
  `ActivityResultContracts.RequestPermission` — стоит добавить на экране настроек,
  иначе собственные уведомления приложения (если появятся, например foreground-service
  индикатор) не будут показываться на Android 13+).
- `usesCleartextTraffic="true"` в манифесте разрешает `http://` для всех хостов
  (нужно для локальных self-host серверов без TLS) — если сервер всегда за HTTPS,
  стоит сузить через `network_security_config.xml` до конкретных доменов/диапазонов.
- Нет UI-подтверждения/тоста при ошибках Worker'а (401, 4xx) — пользователь узнает
  о проблеме только заглянув на экран настроек и увидев, что pending не уменьшается.
  Можно добавить локальное уведомление "нужна перерегистрация" при `Result.failure()`
  с кодом 401.
- Тесты (unit/instrumented) не написаны — только структурная проверка кода.
