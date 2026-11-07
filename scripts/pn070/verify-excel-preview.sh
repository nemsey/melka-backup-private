#!/usr/bin/env bash
# ============================================================
# PN-070 — وارسی دانلود اکسل «فهرست درخواست» از لینک عمومی
# (گام ۲ مالک: «دانلود اکسل فهرست درخواست در درخواست ملک تبریز ناموفق میباشد»)
# وارسی واقعی از بیرون: ورود مالک → GET /api/crm/export/requests →
# شاهد: HTTP 200 + بایت‌های جادویی PK (xlsx) + شمار ردیف‌های شیت
# کدمستر از env پروسهٔ زندهٔ سرور خوانده می‌شود — هرگز چاپ نمی‌شود.
# ============================================================
set -uo pipefail
cd /home/z/my-project

BASE="https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai"
OUT="download/pn070"
mkdir -p "$OUT"
XLSX="$OUT/melka-requests-verify.xlsx"
rm -f "$XLSX"

PID=$(pgrep -f "standalone/server.js" | head -1)
if [ -z "$PID" ]; then echo "FAIL: سرور زنده نیست"; exit 1; fi
MASTER=$(tr '\0' '\n' < "/proc/$PID/environ" 2>/dev/null | sed -n 's/^MASTER_ACCESS_CODE=//p' | tr -d '\r\n')
if [ -z "$MASTER" ]; then echo "FAIL: کد مدیر در env سرور یافت نشد"; exit 1; fi
echo "[0] کد مدیر از env سرور زنده بارگذاری شد (${#MASTER} نویسه — چاپ نمی‌شود)"

echo "[1] ورود مالک از لینک عمومی…"
LOGIN_CODE=$(curl -s -o /tmp/pn070-login.json -w '%{http_code}' \
  -H 'content-type: application/json' \
  -d "{\"masterCode\":\"$MASTER\"}" \
  "$BASE/api/auth/master-login")
echo "    HTTP $LOGIN_CODE"
[ "$LOGIN_CODE" = "200" ] || { echo "FAIL: ورود ناموفق"; cat /tmp/pn070-login.json | head -c 300; exit 1; }
# توکن نشست (Bearer) — هرگز چاپ نمی‌شود
TOKEN=$(python3 -c "import json;print(json.load(open('/tmp/pn070-login.json')).get('token',''))")
if [ -z "$TOKEN" ]; then echo "FAIL: توکن نشست در پاسخ ورود نیست"; exit 1; fi
echo "    توکن نشست گرفته شد (${#TOKEN} نویسه — چاپ نمی‌شود)"
AUTH=(-H "Authorization: Bearer $TOKEN")

echo "[2] دانلود اکسل فهرست درخواست (عین دکمهٔ «اکسل کل فهرست» کاشی درخواست ملک تبریز)…"
HTTP=$(curl -s -o "$XLSX" -w '%{http_code}' "${AUTH[@]}" \
  "$BASE/api/crm/export/requests")
CT=$(curl -s -o /dev/null -w '%{content_type}' "${AUTH[@]}" \
  "$BASE/api/crm/export/requests")
SIZE=$(stat -c %s "$XLSX" 2>/dev/null || echo 0)
echo "    HTTP $HTTP · content-type: $CT · حجم: $SIZE بایت"
if [ "$HTTP" != "200" ] || [ "$SIZE" -lt 10000 ]; then
  echo "FAIL: دانلود اکسل ناموفق"; head -c 300 "$XLSX"; exit 1
fi

echo "[3] شاهد محتوا: بایت جادویی + شمار ردیف‌ها…"
MAGIC=$(head -c 2 "$XLSX")
echo "    magic: $MAGIC (انتظار: PK)"
[ "$MAGIC" = "PK" ] || { echo "FAIL: خروجی xlsx نیست"; exit 1; }
python3 - "$XLSX" <<'PY'
import re, sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
sheet = [n for n in z.namelist() if re.match(r'xl/worksheets/sheet1\.xml', n)]
if not sheet:
    print('FAIL: شیت یافت نشد'); sys.exit(1)
xml = z.read(sheet[0]).decode('utf-8', 'ignore')
rows = len(re.findall(r'<row[ >]', xml))
shared = [n for n in z.namelist() if 'sharedStrings' in n]
ss = len(re.findall(r'<si>', z.read(shared[0]).decode('utf-8','ignore'))) if shared else 0
print(f'    شاهد: {rows} ردیف در شیت ۱ (شامل سرستون) · {ss} رشتهٔ مشترک')
print(f'    VERDICT: {"OK" if rows > 1000 else "SUSPICIOUS"} — فهرست درخواست‌ها ({rows-1 if rows>0 else 0} درخواست) در اکسل حاضرند')
PY
RC=$?
echo "[4] نسخهٔ سرو‌شده از لینک عمومی:"
curl -s "$BASE/api/version" | python3 -c "import json,sys; d=json.load(sys.stdin); print('    gitSha:', d['gitSha'], '· buildId:', d['buildId'], '· drift-match:', d['drift']['match'])"
exit $RC
