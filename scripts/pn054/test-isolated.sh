#!/usr/bin/env bash
# ============================================================================
# test-isolated.sh — تست کامل ایزولهٔ PN-054 روی پورت موقت 3999
# ----------------------------------------------------------------------------
# ⚠️ درس زندهٔ ۱۴۰۵/۰۸/۱۷ (رویداد خرابی DB): این تست «هرگز» به DB زنده
# وصل نمی‌شود — همیشه روی «کپی» کار می‌کند. نمونهٔ قبلی به db/custom.db
# زنده وصل بود و هم‌زمانی چند فرایند در پنجرهٔ cutover به خرابی B-tree
# انجامید (شاهد: db/custom.db.CORRUPT-Q).
#
# کل چرخه در «یک» فراخوانی bash اجرا می‌شود و همهٔ PID ها دقیق‌اند.
# ============================================================================
set -uo pipefail
cd /home/z/my-project

PORT=3999
HP1=3100; HP2=3101
LOAD_LOG=/tmp/pn054-iso-load.log
SM_LOG=/tmp/pn054-iso-sm.log
TEST_DB=/tmp/pn054-iso-test.db
: > "$SM_LOG"

say() { echo "[iso] $*"; }

health_pid() { curl -s --max-time 3 "http://127.0.0.1:$1/healthz" | python3 -c "import json,sys;print(json.load(sys.stdin).get('pid',''))" 2>/dev/null; }

say "۰) کپی DB برای ایزوله (هرگز DB زنده!)"
cp db/custom.db "$TEST_DB" || { say "❌ کپی DB ممکن نشد"; exit 1; }

say "۱) بوت socket-master تستی (setsid، پورت $PORT)"
MELKA_MASTER_PORT=$PORT MELK_WORKER=disabled \
  DATABASE_URL="file:$TEST_DB?connection_limit=1&socket_timeout=30" \
  setsid nohup python3 scripts/pn054/socket-master.py >> "$SM_LOG" 2>&1 &
sleep 0.3
MASTER_PID=$(ps aux | grep "python3 scripts/pn054/socket-master.py" | grep -v grep | awk '{print $2}' | head -1)
say "master pid=$MASTER_PID"

for i in $(seq 1 40); do
  H=$(curl -s --max-time 3 "http://127.0.0.1:$HP1/healthz" 2>/dev/null)
  [ -n "$H" ] && break
  sleep 0.5
done
say "۲) سلامت: $H"
V=$(curl -s --max-time 8 "http://localhost:$PORT/api/version" 2>/dev/null | head -c 60)
say "۳) نسخه از پورت $PORT: $V"
[ -n "$V" ] || { say "❌ سرور تستی بالا نیامد"; kill -TERM "$MASTER_PID" 2>/dev/null; rm -f "$TEST_DB"; exit 1; }

: > "$LOAD_LOG"
say "۴) بار ۲۲ ثانیه‌ای + سه اختلال (Blue/Green · kill -15 · kill -9)"
( end=$(( $(date +%s) + 22 )); while [ $(date +%s) -lt $end ]; do
    OUT=$(curl -s --max-time 4 -o /dev/null -w '%{http_code}' "http://localhost:$PORT/api/version" 2>/dev/null)
    if [ "$OUT" = "200" ]; then echo OK >> "$LOAD_LOG"; else echo "FAIL($OUT)" >> "$LOAD_LOG"; fi
  done ) &
LOAD_PID=$!

sleep 2
say "── Blue/Green:"
echo '{"cmd":"deploy"}' > upload/.runtime/pn054-cmd
sleep 7
P1=$(health_pid $HP1); P2=$(health_pid $HP2)
say "   آبی pid=$P1 · سبز pid=$P2 (باید متفاوت باشند)"

sleep 1
say "── kill -15 فرزند فعلی:"
CP=$(health_pid $HP1); [ -z "$CP" ] && CP=$(health_pid $HP2)
T0=$(date +%s.%N)
kill -15 "$CP" 2>/dev/null
for i in $(seq 1 60); do N=$(health_pid $HP1); [ -z "$N" ] && N=$(health_pid $HP2); [ -n "$N" ] && [ "$N" != "$CP" ] && break; sleep 0.05; done
T1=$(date +%s.%N)
say "   جایگزینی در $(echo "$T1 $T0" | awk '{printf "%.2f", $1-$2}')s (pid $CP → $N)"

sleep 1
say "── kill -9 فرزند فعلی (کرش سخت):"
CP=$(health_pid $HP1); [ -z "$CP" ] && CP=$(health_pid $HP2)
kill -9 "$CP" 2>/dev/null

wait $LOAD_PID
OK=$(grep -c '^OK$' "$LOAD_LOG" || true)
FL=$(grep -c '^FAIL' "$LOAD_LOG" || true)
say "۵) نتیجهٔ بار: موفق=$OK خطا=$FL"

say "۶) پاکسازی تست"
kill -TERM "$MASTER_PID" 2>/dev/null
sleep 2
kill -9 "$MASTER_PID" 2>/dev/null
for p in $(ps aux | grep "node .*pn054/listen-patch" | grep -v grep | awk '{print $2}'); do kill -9 "$p" 2>/dev/null; done
rm -f "$TEST_DB"
sleep 0.5
LEFT=$(ss -tlnp 2>/dev/null | grep -E ":$PORT|:$HP1|:$HP2" | wc -l)
say "پورت‌های باقی‌مانده: $LEFT (باید 0 باشد)"

echo "══════ نتیجهٔ نهایی: OK=$OK FAIL=$FL ══════"
[ "$FL" = "0" ] && say "✅ صفر خطا در هر سه اختلال — معیار دستور ۱ برآورده" || say "❌ خطا دیده شد"
[ "$FL" = "0" ]
