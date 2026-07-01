#!/usr/bin/env bash
# Сборка debug-APK и установка на телефон, подключённый по USB.
#
# Требования на компе:
#   - Android SDK (ANDROID_HOME / ANDROID_SDK_ROOT) + platform-tools (adb)
#   - JDK 17+
#   - на телефоне включена «Отладка по USB» (Настройки → Для разработчиков)
#
# Первый раз, если нет gradle wrapper: открой android/ в Android Studio один раз
# (он досоздаст gradlew/gradlew.bat), либо выполни `gradle wrapper` при наличии gradle.
set -euo pipefail

cd "$(dirname "$0")/.."

# 1. adb доступен?
if ! command -v adb >/dev/null 2>&1; then
  echo "ОШИБКА: adb не найден. Установи Android SDK platform-tools и добавь в PATH." >&2
  exit 1
fi

# 2. Есть подключённое устройство?
devices=$(adb devices | awk 'NR>1 && $2=="device" {print $1}')
if [ -z "$devices" ]; then
  echo "ОШИБКА: телефон не найден. Подключи по USB, включи отладку и подтверди доверие." >&2
  echo "Проверь: adb devices" >&2
  exit 1
fi
echo "Устройство: $devices"

# 3. Gradle wrapper / gradle
if [ -x ./gradlew ]; then
  GRADLE=./gradlew
elif command -v gradle >/dev/null 2>&1; then
  GRADLE=gradle
else
  echo "ОШИБКА: нет ./gradlew и нет gradle в PATH." >&2
  echo "Открой android/ в Android Studio один раз (создаст gradlew) или установи Gradle." >&2
  exit 1
fi

# 4. Сборка + установка (installDebug ставит APK на подключённое устройство через adb).
echo "Сборка и установка debug-APK..."
$GRADLE installDebug

echo ""
echo "Готово. На телефоне:"
echo "  1. Открой приложение Aggregat."
echo "  2. Выдай доступ к уведомлениям (кнопка в приложении → системные настройки)."
echo "  3. Адрес сервера уже стоит: http://100.93.215.38:8000 (Netbird)."
echo "  4. Приложение зарегистрируется и получит токен — скопируй его для сайта."
