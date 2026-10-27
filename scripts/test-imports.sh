#!/bin/bash
# تست آپلود اکسل — round-trip ایدمپوتنت (گام ۱-ب) + گارد دادهٔ مقدس (شمارش قبل/بعد یکسان)
cd /home/z/my-project

MASTER=$(grep -E "^MASTER_ACCESS_CODE=" .env.local | head -1 | cut -d'=' -f2- | tr -d '"' | sed 's/\r$//')
HTTP=$(curl -s -o /tmp/ml.json -w "%{http_code}" -X POST http://localhost:3000/api/auth/master-login \
  -H "Content-Type: application/json" -d "{\"masterCode\": \"$MASTER\"}")
TOKEN=$(jq -r '.token // empty' /tmp/ml.json)
echo "session: $(jq -r '.user.displayName' /tmp/ml.json) role=$(jq -r '.user.role' /tmp/ml.json)"
[ -z "$TOKEN" ] && { echo "❌ no token"; exit 1; }

count_db() {
  python3 -c "
import sqlite3
c = sqlite3.connect('file:db/custom.db?mode=ro', uri=True)
t = '$2'
cond = \"tenantId='melketun'\" if t == 'melketun' else \"(tenantId='melk-tabriz' OR tenantId IS NULL)\"
tbl = {'listings':'PropertyRecord','requests':'RequestRecord','transactions':'TransactionRecord','experts':'ExpertRecord'}['$1']
print(c.execute(f'SELECT COUNT(*) FROM {tbl} WHERE {cond}').fetchone()[0])
c.close()"
}

echo ""
echo "═══ تست آپلود (round-trip) — ۸ سلول ═══"
declare -A FILES=(
  ["melk-tabriz|listings"]="/tmp/sample-melk-tabriz-listings.xlsx"
  ["melk-tabriz|requests"]="/tmp/sample-melk-tabriz-requests.xlsx"
  ["melk-tabriz|transactions"]="/tmp/export-melk-tabriz-transactions.xlsx"
  ["melk-tabriz|experts"]="/tmp/export-melk-tabriz-experts.xlsx"
  ["melketun|listings"]="/tmp/sample-melketun-listings.xlsx"
  ["melketun|requests"]="/tmp/sample-melketun-requests.xlsx"
  ["melketun|transactions"]="/tmp/export-melketun-transactions.xlsx"
  ["melketun|experts"]="/tmp/export-melketun-experts.xlsx"
)

PASS=0; FAIL=0
for KEY in "melk-tabriz|listings" "melk-tabriz|requests" "melk-tabriz|transactions" "melk-tabriz|experts" "melketun|listings" "melketun|requests" "melketun|transactions" "melketun|experts"; do
  TENANT="${KEY%%|*}"; ENTITY="${KEY##*|}"
  FILE="${FILES[$KEY]}"
  BEFORE=$(count_db "$ENTITY" "$TENANT")
  RESP=$(curl -s -m 180 -X POST "http://localhost:3000/api/crm/import/${ENTITY}?tenantId=${TENANT}" \
    -H "Authorization: Bearer $TOKEN" -F "file=@${FILE};type=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  AFTER=$(count_db "$ENTITY" "$TENANT")
  # Parse result
  OKF=$(echo "$RESP" | jq -r '.ok // empty' 2>/dev/null)
  CREATED=$(echo "$RESP" | jq -r '.created // .result.created // 0' 2>/dev/null)
  UPDATED=$(echo "$RESP" | jq -r '.updated // .result.updated // 0' 2>/dev/null)
  ERRORS=$(echo "$RESP" | jq -r '.errors // .result.errors // 0' 2>/dev/null)
  MSG=$(echo "$RESP" | jq -r '.message // .error.message // ""' 2>/dev/null | head -c 100)
  if [ "$OKF" = "true" ] && [ "$BEFORE" = "$AFTER" ]; then
    echo "✓ ${TENANT}/${ENTITY}: ok · created=${CREATED} updated=${UPDATED} errors=${ERRORS} · DB ${BEFORE}→${AFTER} (دادهٔ مقدس سالم) — ${MSG}"
    PASS=$((PASS+1))
  else
    echo "✗ ${TENANT}/${ENTITY}: ok=${OKF} · DB ${BEFORE}→${AFTER} — ${MSG}"
    echo "$RESP" | head -c 250; echo ""
    FAIL=$((FAIL+1))
  fi
done
echo ""
echo "RESULT import: $PASS pass / $FAIL fail"
