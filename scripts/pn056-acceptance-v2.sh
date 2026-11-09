#!/usr/bin/env bash
# ============================================================================
# pn056-acceptance-v2.sh — آزمون پذیرش قلاب طلایی PN-056 (جلسهٔ دوم)
# ----------------------------------------------------------------------------
# زمینه: رستاخیز دستی 08:23 (bbc5b10) پس از حادثهٔ ریست سخت 07:40 که قلاب
# طلایی را از درخت حذف کرد (repo.tar کهنه). این آزمون اثبات می‌کند که قلابِ
# بازیابی‌شده در «هر» فراخوانی بوت، استک را خودکار برمی‌گرداند.
#
# هفت گام (عین پروتکل جلسهٔ اول + سنجش صفر-اتلاف):
#   ۱) شاهد پیش از کشتن (healthz · version · شمارش داده)
#   ۲) kill -9 کل استک — نگهبان اول (تا ری‌استارت نکند)
#   ۳) شبیه‌سازی بوت کانتینر: فراخوانی .zscripts/dev.sh (مثل /start.sh)
#   ۴) پایش آمادگی هر ۱ ثانیه (healthz 3100/3101)
#   ۵) راستی‌آزمایی drift (gitSha سرور == HEAD)
#   ۶) منتظر کارگر (TTL قفل ≤۹۰ث طبیعی)
#   ۷) شاهد پس: healthz · version · شمارش داده · ps — پیش=پس (صفر اتلاف)
# ============================================================================
set -uo pipefail
cd /home/z/my-project
LOG_DIR="download/PN-056/logs/acceptance-v2"
mkdir -p "$LOG_DIR"
TL="$LOG_DIR/timeline.log"
ts(){ date -u +%FT%TZ; }
log(){ printf '[%s] %s\n' "$(ts)" "$*" | tee -a "$TL"; }

counts(){ python3 <<'PY'
import sqlite3
c = sqlite3.connect('file:db/custom.db?mode=ro', uri=True)
print('{"PropertyRecord":%d,"RequestRecord":%d}' % (
    c.execute('SELECT COUNT(*) FROM PropertyRecord').fetchone()[0],
    c.execute('SELECT COUNT(*) FROM RequestRecord').fetchone()[0]))
PY
}

# ─── صبر برای پایان بکاپ‌های گذرا (پاکیزگی آزمون — اسنپ‌شات مقدس نصفه نماند) ───
W=0
while pgrep -f "vacuum-copy" >/dev/null 2>&1 && [ "$W" -lt 120 ]; do sleep 5; W=$((W+5)); done
log "بکاپ‌های گذرا تمام شدند (انتظار ${W}s)"

# ═══ گام ۱: شاهد پیش از کشتن ═══
log "═══ گام ۱: شاهد پیش از کشتن ═══"
curl -fsS -m 5 http://127.0.0.1:3100/healthz >"$LOG_DIR/healthz-before.json" 2>/dev/null \
  || curl -fsS -m 5 http://127.0.0.1:3101/healthz >"$LOG_DIR/healthz-before.json" 2>/dev/null || true
curl -fsS -m 5 http://localhost:3000/api/version >"$LOG_DIR/version-before.json" 2>/dev/null || true
counts >"$LOG_DIR/counts-before.json"
log "healthz قبل: $(head -c 130 "$LOG_DIR/healthz-before.json" 2>/dev/null)"
log "نسخهٔ قبل: $(python3 -c "import json;print(json.load(open('$LOG_DIR/version-before.json'))['buildId'])" 2>/dev/null)"
log "دادهٔ قبل: $(cat "$LOG_DIR/counts-before.json")"

# ═══ گام ۲: کشتن کل استک (نگهبان اول!) ═══
log "═══ گام ۲: کشتن کل استک با kill -9 (نگهبان اول) ═══"
for PAT in "prod-watchdog\.sh" "socket-master\.py" "next-server|standalone/server\.js" "runtime/worker\.ts" "pn055/hot-mirror\.sh"; do
  PIDS="$(pgrep -f "$PAT" | tr '\n' ' ')"
  if [ -n "${PIDS// /}" ]; then log "kill -9: $PAT → $PIDS"; kill -9 $PIDS 2>/dev/null || true; fi
done
sleep 4
LEFT="$(pgrep -f "prod-watchdog|socket-master|next-server|standalone/server|runtime/worker|hot-mirror" | wc -l)"
log "پروسه‌های باقیماندهٔ استک: $LEFT (انتظار: 0)"

# ═══ گام ۳: شبیه‌سازی بوت — فراخوانی قلاب (عین /start.sh) ═══
log "═══ گام ۳: شبیه‌سازی بوت کانتینر — فراخوانی قلاب (مثل /start.sh) ═══"
T0=$(date +%s)
OUT="$(bash .zscripts/dev.sh 2>&1)"
echo "$OUT" >"$LOG_DIR/devsh-sim.out"
log "قلاب فراخوانی شد (T0) — خروجی: $(printf '%s' "$OUT" | tr '\n' ' | ' | head -c 200)"

# ═══ گام ۴: پایش آمادگی (هر ۱ ثانیه) ═══
log "═══ گام ۴: پایش آمادگی (هر ۱ ثانیه) ═══"
UP=0
while true; do
  if curl -fsS -m 2 http://127.0.0.1:3100/healthz >/dev/null 2>&1 \
     || curl -fsS -m 2 http://127.0.0.1:3101/healthz >/dev/null 2>&1; then UP=1; break; fi
  NOW=$(date +%s); [ $((NOW - T0)) -gt 300 ] && break
  sleep 1
done
T1=$(date +%s)
DUR=$((T1 - T0))
if [ "$UP" -eq 1 ]; then log "✅ healthz پاسخ داد پس از ${DUR} ثانیه"; else log "❌ سرور در ۳۰۰ث آماده نشد"; fi

# ═══ گام ۵: راستی‌آزمایی drift ═══
log "═══ گام ۵: راستی‌آزمایی drift ═══"
sleep 3
curl -fsS -m 5 http://localhost:3000/api/version >"$LOG_DIR/version-after.json" 2>/dev/null || true
VSERV="$(python3 -c "import json;print(json.load(open('$LOG_DIR/version-after.json'))['gitSha'])" 2>/dev/null || echo '?')"
HEADSHA="$(git rev-parse --short HEAD)"
DRIFT_V="TRUE"
[ "$VSERV" = "$HEADSHA" ] && DRIFT_V="FALSE"
log "سرور $VSERV می‌سرود · HEAD=$HEADSHA → drift=$DRIFT_V"

# ═══ گام ۶: منتظر کارگر (TTL قفل ≤۹۰ث طبیعی) ═══
log "═══ گام ۶: منتظر کارگر ═══"
WUP=0; W=0
while [ "$W" -lt 180 ]; do
  if pgrep -f "runtime/worker\.ts" >/dev/null 2>&1; then WUP=1; break; fi
  sleep 2; W=$((W+2))
done
if [ "$WUP" -eq 1 ]; then log "✅ کارگر زنده شد پس از ${W}s"; else log "⚠️ کارگر ظرف ۱۸۰ث ظاهر نشد"; fi

# ═══ گام ۷: شاهد پس از رستاخیز ═══
log "═══ گام ۷: شاهد پس از رستاخیز ═══"
curl -fsS -m 5 http://127.0.0.1:3100/healthz >"$LOG_DIR/healthz-after.json" 2>/dev/null \
  || curl -fsS -m 5 http://127.0.0.1:3101/healthz >"$LOG_DIR/healthz-after.json" 2>/dev/null || true
counts >"$LOG_DIR/counts-after.json"
ps aux | grep -E "prod-watchdog|socket-master|next-server|runtime/worker|hot-mirror" | grep -v grep >"$LOG_DIR/ps-after.txt" || true
CB="$(cat "$LOG_DIR/counts-before.json")"; CA="$(cat "$LOG_DIR/counts-after.json")"
log "— خلاصه: سرور=${DUR}s · drift=$DRIFT_V · کارگر=${W}s"
log "— دادهٔ پیش: $CB · پس: $CA"
if [ "$CB" = "$CA" ]; then log "✅ صفر اتلاف داده (پیش = پس)"; else log "⚠️ تغییر شمارش — بررسی لازم"; fi
log "آزمون پایان یافت."
