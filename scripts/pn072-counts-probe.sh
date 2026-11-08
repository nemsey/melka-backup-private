#!/usr/bin/env bash
# PN-072 — شمارش total فهرست‌ها (در برابر سقف ۲۵٬۰۰۰) + شمارش واقعی DB
set -uo pipefail
BASE="${1:-http://localhost:3000}"
LOG=$(mktemp)

CODE=""
[ -f .env.local ] && CODE=$(grep -m1 '^MASTER_ACCESS_CODE=' .env.local 2>/dev/null | cut -d= -f2- | tr -d "\"'" || true)
[ -z "$CODE" ] && [ -f upload/.runtime/boot-secrets.json ] && CODE=$(jq -r '.MASTER_ACCESS_CODE // empty' upload/.runtime/boot-secrets.json 2>/dev/null || true)
[ -z "$CODE" ] && { echo "❌ کدمستر یافت نشد"; exit 1; }

curl -sS -m 20 -o "$LOG" -H 'Content-Type: application/json' -X POST "$BASE/api/auth/master-login" \
  --data "{\"masterCode\":\"$CODE\"}" 2>/dev/null
TOKEN=$(jq -r '.token // empty' "$LOG" 2>/dev/null || true)
[ -z "$TOKEN" ] && { echo "❌ ورود ناموفق"; cat "$LOG"; exit 1; }

for E in requests listings; do
  curl -sS -m 60 -o "$LOG" -H "Authorization: Bearer $TOKEN" "$BASE/api/crm/arm-catalog/$E?limit=1" 2>/dev/null
  T=$(jq -r '.total // .pagination.total // empty' "$LOG" 2>/dev/null || echo "?")
  R=$(jq -r '.rows | length // empty' "$LOG" 2>/dev/null || echo "?")
  echo "→ $E: total=$T (با limit=1، ردیف‌های برگشتی=$R)"
done
rm -f "$LOG"
echo "---DB-RAW---"
python3 - <<'PY'
import sqlite3
con = sqlite3.connect('file:db/custom.db?mode=ro', uri=True)
for t in ('PropertyRecord', 'RequestRecord', 'TransactionRecord', 'ExpertProfile'):
    try:
        print(f"{t}: {con.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]}")
    except Exception as e:
        print(f"{t}: ERR {e}")
con.close()
PY
