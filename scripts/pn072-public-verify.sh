#!/usr/bin/env bash
# PN-072 — راستی‌آزمایی عمومی از لینک preview: اکسل «فهرست درخواست» + بینش چهار کاشی
# یک ورود مالک → چند شاهد (پرهیز از محدودیت نرخ ۵/۱۵دقیقه)
set -uo pipefail
BASE="${1:-https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai}"
OUT=$(mktemp --suffix=.xlsx)
LOG=$(mktemp)

CODE=""
[ -f .env.local ] && CODE=$(grep -m1 '^MASTER_ACCESS_CODE=' .env.local 2>/dev/null | cut -d= -f2- | tr -d "\"'" || true)
[ -z "$CODE" ] && [ -f upload/.runtime/boot-secrets.json ] && CODE=$(jq -r '.MASTER_ACCESS_CODE // empty' upload/.runtime/boot-secrets.json 2>/dev/null || true)
[ -z "$CODE" ] && { echo "❌ کدمستر یافت نشد"; exit 1; }

# ۱) یک ورود
HTTP=$(curl -sS -m 25 -o "$LOG" -w '%{http_code}' -H 'Content-Type: application/json' \
  -X POST "$BASE/api/auth/master-login" --data "{\"masterCode\":\"$CODE\"}" 2>&1) || HTTP="curl-fail"
TOKEN=$(jq -r '.token // empty' "$LOG" 2>/dev/null || true)
ROLE=$(jq -r '.user.role // empty' "$LOG" 2>/dev/null || true)
echo "→ master-login (عمومی): HTTP=$HTTP role=${ROLE:-?}"
[ "$HTTP" != "200" ] || [ -z "$TOKEN" ] && { echo "❌ ورود ناموفق:"; head -c 300 "$LOG"; echo; exit 1; }

# ۲) اکسل فهرست درخواست — عین دکمهٔ «اکسل کل فهرست»
T0=$(date +%s)
HTTP=$(curl -sS -m 150 -o "$OUT" -w '%{http_code}' -H "Authorization: Bearer $TOKEN" \
  "$BASE/api/crm/export/requests" 2>&1) || HTTP="curl-fail"
T1=$(date +%s)
SIZE=$(stat -c%s "$OUT" 2>/dev/null || echo 0)
CT=$(file -b "$OUT" 2>/dev/null | head -c 40)
echo "→ اکسل درخواست‌ها (عمومی): HTTP=$HTTP · ${SIZE} بایت · $((T1-T0))ثانیه · $CT"
if [ "$HTTP" = "200" ]; then
  python3 - "$OUT" <<'PY'
import sys, zipfile
with open(sys.argv[1], 'rb') as f: assert f.read(2) == b'PK', 'not zip'
z = zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None
sheets = [n for n in z.namelist() if n.startswith('xl/worksheets/sheet')]
rows = 0
with z.open(sheets[0]) as s:
    for chunk in iter(lambda: s.read(1<<20), b''): rows += chunk.count(b'<row ')
print(f"  ✓ xlsx معتبر — {rows} ردیف (شامل سرستون)")
PY
else
  echo "  ❌ $(head -c 200 "$OUT")"
fi

# ۳) بینش چهار کاشی اصلی (M1-M4)
for T in arm-listings arm-requests transactions-contracts experts; do
  HTTP=$(curl -sS -m 25 -o "$LOG" -w '%{http_code}' -H "Authorization: Bearer $TOKEN" \
    "$BASE/api/agent/$T/insight" 2>&1) || HTTP="curl-fail"
  N=$(jq -r '.insights | length // .items | length // 0' "$LOG" 2>/dev/null || echo 0)
  echo "→ بینش $T: HTTP=$HTTP · آیتم=$N"
done
rm -f "$OUT" "$LOG"
echo "✅ PN-072: راستی‌آزمایی عمومی کامل شد"
