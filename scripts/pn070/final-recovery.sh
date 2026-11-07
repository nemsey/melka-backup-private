#!/usr/bin/env bash
# PN-070-و — بازیابی نهایی یک‌کمانچه (پس از پیچ‌خوردگی پارک + همگام‌ساز پلتفرم)
# همه‌چیز در «یک» اجرا: توقف حلقه‌ها → بازگرداندن پارک (بدون کپی یتیم) →
# آزادسازی دیسک → نصب وابستگی → بیلد v2 → سرو → آزمون حافظهٔ اکسل
set -uo pipefail
cd /home/z/my-project

echo "═══ [0] توقف حلقه‌ها ═══"
touch .prod-stop
pkill -9 -f "prod-watchdog.sh"        2>/dev/null || true
pkill -9 -f "build-with-parking"      2>/dev/null || true
pkill -9 -f "bun run build"           2>/dev/null || true
pkill -9 -f "next build"              2>/dev/null || true
pkill -9 -f "standalone/server.js"    2>/dev/null || true
pkill -9 -f "scripts/runtime/worker"  2>/dev/null || true
sleep 2

echo "═══ [1] بازگرداندن پارک (نسخه‌های اصلی) + حذف کپی‌های یتیم ═══"
P=".build-parking"
if [ -f "$P/manifest" ]; then
  while IFS=$'\t' read -r key orig; do
    [ -n "$key" ] || continue
    [ -e "$P/$key" ] || continue
    case "$orig" in
      upload/.survival)
        # نسخهٔ اصلی در جای خود است (کپی یتیمِ mv قدیمی) — نسخهٔ پارک حذف می‌شود
        rm -rf "$P/$key"
        echo "  dropped duplicate: $orig"
        ;;
      *)
        mkdir -p "$(dirname "$orig")"
        rm -rf "$orig"
        mv -f "$P/$key" "$orig"
        echo "  restored: $orig"
        ;;
    esac
  done < "$P/manifest"
  rm -f "$P/manifest"
fi
rm -rf "$P"

echo "═══ [2] آزادسازی قطعی (در همین اجرا) ═══"
rm -rf upload/.survival/PN-059-20261101 upload/.survival/R7-20261101
rm -rf upload/.survival/upload__.survival
rm -f  upload/.data/rolling/live-*.db upload/.data/rolling/*.db-journal
rm -f  db/custom.db.broken-*
echo "  survival packages: $(ls upload/.survival/ 2>/dev/null | tr '\n' ' ')"
df -h / | tail -1

echo "═══ [3] وابستگی‌ها ═══"
if [ ! -x node_modules/.bin/next ]; then
  rm -rf node_modules
  bun install 2>&1 | tail -2
fi
if [ ! -x node_modules/.bin/next ]; then
  echo "❌ INSTALL FAILED — next هنوز غایب است"
  exit 1
fi
echo "  next: $(node_modules/.bin/next --version 2>/dev/null || echo '?')"

echo "═══ [4] بیلد (parking v2) ═══"
rm -rf .next
if ! bun run build 2>&1 | tail -5; then
  echo "❌ BUILD FAILED"
  exit 1
fi
ls .next/standalone/server.js >/dev/null 2>&1 || { echo "❌ standalone غایب"; exit 1; }

echo "═══ [5] سرو ═══"
rm -f .prod-stop
bash scripts/start-prod.sh
V=""
for i in $(seq 1 45); do
  V=$(curl -fsS -m 3 http://localhost:3000/api/version 2>/dev/null) && break
  sleep 2
done
echo "$V" | python3 -c "import json,sys; d=json.load(sys.stdin); print('SERVING:', d['gitSha'], '· drift:', d['drift']['match'])" 2>/dev/null \
  || { echo "❌ سرور پاسخ نداد"; exit 1; }

echo "═══ [6] آزمون حافظهٔ اکسل فهرست درخواست (localhost) ═══"
PID=$(pgrep -f "standalone/server.js" | head -1)
( while kill -0 "$PID" 2>/dev/null; do
    RSS=$(awk '/VmRSS/{print $2}' "/proc/$PID/status" 2>/dev/null)
    [ -n "$RSS" ] && echo "$RSS"
    sleep 1
  done ) > /tmp/rss-watch.log 2>&1 &
WATCHER=$!
MASTER=$(tr '\0' '\n' < "/proc/$PID/environ" | sed -n 's/^MASTER_ACCESS_CODE=//p' | tr -d '\r\n')
TOKEN=$(curl -s -H 'content-type: application/json' -d "{\"masterCode\":\"$MASTER\"}" \
  http://localhost:3000/api/auth/master-login | python3 -c "import json,sys;print(json.load(sys.stdin).get('token',''))")
[ -n "$TOKEN" ] || { echo "❌ توکن نشست نگرفته"; exit 1; }
time curl -s -o /tmp/pn070-export-test.xlsx -w 'HTTP %{http_code} · %{size_download} bytes · %{time_total}s\n' \
  -H "Authorization: Bearer $TOKEN" "http://localhost:3000/api/crm/export/requests"
sleep 2
kill "$WATCHER" 2>/dev/null || true
echo "  RSS حین اکسل: min=$(sort -n /tmp/rss-watch.log | head -1)kB · max=$(sort -n /tmp/rss-watch.log | tail -1)kB (سقف جعبه: ~$(awk '/MemTotal/{print int($2)}' /proc/meminfo)kB)"
MAGIC=$(head -c 2 /tmp/pn070-export-test.xlsx 2>/dev/null)
echo "  magic: $MAGIC (انتظار: PK)"
if [ "$MAGIC" = "PK" ]; then
  python3 - << 'PY'
import re, zipfile
z = zipfile.ZipFile('/tmp/pn070-export-test.xlsx')
sheet = [n for n in z.namelist() if re.match(r'xl/worksheets/sheet1\.xml', n)][0]
xml = z.read(sheet).decode('utf-8', 'ignore')
rows = len(re.findall(r'<row[ >]', xml))
print(f'  شاهد شیت: {rows} ردیف (شامل سرستون) — {rows-1} درخواست')
PY
fi
echo "═══ [7] سرور هنوز زنده؟ ═══"
curl -fsS -m 3 http://localhost:3000/api/version >/dev/null 2>&1 && echo "✅ سرور زنده و پاسخگو" || echo "⚠️ سرور نیاز به توجه دارد"
df -h / | tail -1
