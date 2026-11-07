#!/usr/bin/env bash
# PN-072 — آزمایش زندهٔ دانلود اکسل «فهرست درخواست» (گام دوم فرمان مالک ۲۰۲۶-۱۱-۰۷)
# جریان عین کاربر: POST master-login → GET /api/crm/export/requests → اعتبارسنجی xlsx
# ⚠️ کدمستر هرگز چاپ نمی‌شود — فقط در حافظهٔ همین پوسته می‌زید
set -uo pipefail
BASE="${1:-http://localhost:3000}"
ENTITY="${2:-requests}"
OUT=$(mktemp --suffix=.xlsx)
LOG=$(mktemp)

# ۱) کدمستر از زنجیرهٔ رسمی (.env.local → boot-secrets) — بدون echo
CODE=""
if [ -f .env.local ]; then
  CODE=$(grep -m1 '^MASTER_ACCESS_CODE=' .env.local 2>/dev/null | cut -d= -f2- | tr -d "\"'" || true)
fi
if [ -z "$CODE" ] && [ -f upload/.runtime/boot-secrets.json ]; then
  CODE=$(jq -r '.MASTER_ACCESS_CODE // empty' upload/.runtime/boot-secrets.json 2>/dev/null || true)
fi
if [ -z "$CODE" ]; then
  echo "❌ کدمستر در هیچ لایه‌ای یافت نشد"
  exit 1
fi
echo "✓ کدمستر از زنجیرهٔ رسمی برداشته شد (طول: ${#CODE})"

# ۲) ورود مالک — عین کلاینت: توکن از پاسخ برداشته می‌شود (Bearer · نه کوکی)
HTTP=$(curl -sS -m 20 -o "$LOG" -w '%{http_code}' \
  -H 'Content-Type: application/json' \
  -X POST "$BASE/api/auth/master-login" \
  --data "{\"masterCode\":\"$CODE\"}" 2>&1) || HTTP="curl-fail"
ROLE=$(jq -r '.user.role // .role // empty' "$LOG" 2>/dev/null || true)
TOKEN=$(jq -r '.token // empty' "$LOG" 2>/dev/null || true)
echo "→ master-login: HTTP=$HTTP role=${ROLE:-?} token=${#TOKEN}چار"
if [ "$HTTP" != "200" ] || [ -z "$TOKEN" ]; then
  echo "❌ ورود مالک ناموفق (توکن نداریم):"; head -c 400 "$LOG"; echo; exit 1
fi

# ۳) دانلود اکسل فهرست (بدون فیلتر = کل فهرست — عین دکمهٔ «اکسل کل فهرست»)
T0=$(date +%s)
HTTP=$(curl -sS -m 150 -o "$OUT" -w '%{http_code}' \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE/api/crm/export/$ENTITY" 2>&1) || HTTP="curl-fail"
T1=$(date +%s)
CT=$(file -b "$OUT" 2>/dev/null || echo '?')
SIZE=$(stat -c%s "$OUT" 2>/dev/null || echo 0)
echo "→ اکسل $ENTITY: HTTP=$HTTP · ${SIZE} بایت · $((T1-T0))ثانیه · نوع: $CT"
if [ "$HTTP" != "200" ]; then
  echo "❌ دانلود اکسل ناموفق:"; head -c 400 "$OUT"; echo; exit 1
fi

# ۴) اعتبارسنجی محتوای xlsx — امضای ZIP + سلامت آرشیو + شمارش ردیف‌های شیت
python3 - "$OUT" <<'PY'
import sys, zipfile, re
f = sys.argv[1]
with open(f, 'rb') as fh:
    assert fh.read(2) == b'PK', "امضای ZIP غایب — فایل xlsx معتبر نیست"
z = zipfile.ZipFile(f)
bad = z.testzip()
assert bad is None, f"آرشیو خراب: {bad}"
sheets = [n for n in z.namelist() if re.match(r'xl/worksheets/sheet\d+\.xml', n)]
assert sheets, "شیت یافت نشد"
rows = 0
with z.open(sheets[0]) as s:
    for chunk in iter(lambda: s.read(1 << 20), b''):
        rows += chunk.count(b'<row ')
print(f"✓ xlsx معتبر — شیت: {sheets[0]} · ردیف: {rows} (شامل سرستون)")
sys.exit(0)
PY
RC=$?
rm -f "$LOG" "$OUT"
[ $RC -eq 0 ] && echo "✅ PN-072: دانلود اکسل «$ENTITY» سالم است" || echo "❌ اعتبارسنجی xlsx شکست خورد"
exit $RC
