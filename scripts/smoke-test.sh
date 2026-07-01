#!/usr/bin/env bash
# Сквозной smoke-тест связки: регистрация устройства → ingest уведомлений →
# классификация → чтение ленты. Проверяет, что три половины стыкуются по контракту.
#
# Требует запущенный сервер (docker compose up -d  ИЛИ  uvicorn на :8000).
#   BASE_URL=http://localhost:8000 ./scripts/smoke-test.sh
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8000}"
echo "== Aggregat smoke-test против $BASE_URL =="

j() { python -c "import sys,json; print(json.load(sys.stdin)$1)"; }

# 1. Регистрация устройства → токен
reg=$(curl -fsS -X POST "$BASE_URL/v1/devices:register" \
  -H 'Content-Type: application/json' \
  -d '{"platform":"android","device_name":"smoke-test"}')
TOKEN=$(echo "$reg" | j "['token']")
echo "1. Устройство зарегистрировано, токен получен."

AUTH=(-H "Authorization: Bearer $TOKEN")

# 2. Ingest двух уведомлений (одно повторяется — проверка идемпотентности)
# Пейлоады намеренно ASCII-only: на Windows/Git Bash не-ASCII в inline -d ломает UTF-8.
ingest_body='{"notifications":[
  {"client_id":"smoke-1","source_app":"com.bank","app_label":"Bank","title":"Payment","text":"Debit 5000","posted_at":"2026-07-01T10:00:00Z"},
  {"client_id":"smoke-2","source_app":"com.chat","app_label":"Chat","title":"Hi","text":"how are you","posted_at":"2026-07-01T10:01:00Z"}
]}'
ing=$(curl -fsS -X POST "$BASE_URL/v1/notifications:ingest" "${AUTH[@]}" -H 'Content-Type: application/json' -d "$ingest_body")
echo "2. Ingest #1: accepted=$(echo "$ing" | j "['accepted']") duplicates=$(echo "$ing" | j "['duplicates']")"

# Повторная отправка тех же — должны стать дубликатами
ing2=$(curl -fsS -X POST "$BASE_URL/v1/notifications:ingest" "${AUTH[@]}" -H 'Content-Type: application/json' -d "$ingest_body")
dups=$(echo "$ing2" | j "['duplicates']")
echo "   Ingest #2 (повтор): duplicates=$dups"
[ "$dups" = "2" ] || { echo "FAIL: идемпотентность — ожидали 2 дубля, получили $dups" >&2; exit 1; }

# 3. Дать фоновому пайплайну обработать
sleep 2

# 4. Чтение ленты
items=$(curl -fsS "$BASE_URL/v1/items?limit=50" "${AUTH[@]}")
count=$(echo "$items" | j "['items'].__len__()")
echo "3. Лента: получено Item = $count"
[ "$count" -ge 2 ] || { echo "FAIL: ожидали >=2 Item, получили $count" >&2; exit 1; }

echo "== SMOKE OK: register → ingest (идемпотентно) → классификация → feed работают =="
