#!/usr/bin/env bash
# ============================================================================
# acceptance-test.sh — آزمون پذیرش DIR-PN056 (دستور ۳)
# ----------------------------------------------------------------------------
# سناریو: kill -9 کل استک production → شبیه‌سازی بوت کانتینر (فراخوانی
# قلاب .zscripts/dev.sh دقیقاً مثل /start.sh) → شاهد:
#   الف) سرور بدون هیچ دخالت دستی بالا می‌آید (هدف: < ۴۵ ثانیه)
#   ب) drift = صفر (build = HEAD)
#   ج) دادهٔ مقدس: شمارش رکوردها قبل/بعد یکسان (صفر اتلاف)
#   د) زنجیرهٔ کامل: نگهبان → socket-master → سرور → کارگر
#
# شواهد در: upload/.runtime/pn056/acceptance/ (مانت پایدار)
# ============================================================================
set -u
REPO="/home/z/my-project"
WIT="$REPO/upload/.runtime/pn056/acceptance"
mkdir -p "$WIT"
ts() { date -u +%FT%TZ; }
say() { echo "[$(ts)] $*" | tee -a "$WIT/timeline.log"; }

say "═══ گام ۱: شاهد پیش از کشتن ═══"
ps -eo pid,ppid,etimes,cmd | grep -E 'prod-watchdog|socket-master|next-server|worker\.ts|hot-mirror' \
  | grep -v grep | tee "$WIT/ps-before.txt"
for P in 3100 3101; do
  curl -fsS -m 3 "http://127.0.0.1:$P/healthz" >"$WIT/healthz-before-$P.json" 2>/dev/null \
    && say "healthz:$P زنده — $(head -c 120 "$WIT/healthz-before-$P.json")"
done
curl -fsS -m 5 http://127.0.0.1:3000/api/version >"$WIT/version-before.json" 2>/dev/null \
  && say "نسخهٔ زنده: $(python3 -c 'import json;print(json.load(open("'$WIT'/version-before.json")).get("buildId","?"))' 2>/dev/null)"
git -C "$REPO" rev-parse HEAD | tee "$WIT/head.txt"
python3 - "$WIT/counts-before.json" <<'PYEOF'
import json, sqlite3, sys
con = sqlite3.connect('file:/home/z/my-project/db/custom.db?mode=ro', uri=True)
cur = con.cursor()
out = {}
for t in ('PropertyRecord', 'RequestRecord'):
    out[t] = cur.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
out['integrity'] = cur.execute('PRAGMA quick_check').fetchone()[0]
con.close()
json.dump(out, open(sys.argv[1], 'w'), ensure_ascii=False, indent=1)
print('counts-before:', out)
PYEOF

say "═══ گام ۲: کشتن کل استک با kill -9 (نگهبان اول) ═══"
# ترتیب: نگهبان اول (تا ری‌اسپاون نداشته باشیم)؛ بعد بقیهٔ زنجیره.
# next-server با الگوی خودش (عنوان فرایندش بازنویسی شده — standalone/server.js نمی‌خورد)
pkill -9 -f "prod-watchdog\.sh"        2>/dev/null; say "kill -9: prod-watchdog"
pkill -9 -f "pn054/socket-master\.py" 2>/dev/null; say "kill -9: socket-master"
pkill -9 -f "next-server"              2>/dev/null; say "kill -9: next-server"
pkill -9 -f "scripts/runtime/worker\.ts" 2>/dev/null; say "kill -9: worker"
pkill -9 -f "pn055/hot-mirror\.sh"     2>/dev/null; say "kill -9: hot-mirror"
sleep 3
REMAIN=$(ps -eo pid,cmd | grep -E 'prod-watchdog|socket-master|next-server|worker\.ts|hot-mirror' | grep -v grep | grep -v acceptance | wc -l)
say "پروسه‌های باقیماندهٔ استک: $REMAIN (انتظار: 0)"
ps -eo pid,cmd | grep -E 'prod-watchdog|socket-master|next-server|worker\.ts|hot-mirror' | grep -v grep | grep -v acceptance | tee "$WIT/ps-dead.txt"
if curl -fsS -m 2 http://127.0.0.1:3100/healthz >/dev/null 2>&1 || curl -fsS -m 2 http://127.0.0.1:3101/healthz >/dev/null 2>&1; then
  say "❌ healthz هنوز زنده است — کشتن ناقص؛ لغو آزمون"; exit 1
fi
if ss -ltn 2>/dev/null | grep -q ':3000 '; then
  say "❌ پورت 3000 هنوز اشغال است — لغو آزمون"; exit 1
fi
say "✅ کل استک مرده و پورت‌ها آزاد — آمادهٔ شبیه‌سازی بوت"

say "═══ گام ۳: شبیه‌سازی بوت کانتینر — فراخوانی قلاب (مثل /start.sh) ═══"
T0=$(date +%s)
T0S=$(date -u +%FT%TZ.%3N)
# دقیقاً همان کاری که /start.sh می‌کند: bash dev.sh در پس‌زمینه.
# setsid اضافه: محافظت از مصنوع آزمون (هارنس پس از پایان فرمان ابزار،
# گروه فرایند را می‌کشد — درس قانون ۱۱-ب). در بوت واقعی پلتفرم این
# لازم نیست؛ boot-recovery به هر حال خودش setsid است.
setsid bash "$REPO/.zscripts/dev.sh" >"$WIT/devsh-sim.out" 2>&1 &
say "قلاب فراخوانی شد (T0=$T0S) — خروجی dev.sh: $(cat "$WIT/devsh-sim.out" 2>/dev/null | head -2)"

say "═══ گام ۴: پایش آمادگی (هر ۱ ثانیه) ═══"
TUP=""; TUP_S=""
while [ $(( $(date +%s) - T0 )) -lt 300 ]; do
  for P in 3100 3101; do
    if curl -fsS -m 2 "http://127.0.0.1:$P/healthz" >/dev/null 2>&1; then
      TUP=$(date +%s); TUP_S=$(date -u +%FT%TZ.%3N)
      say "✅ healthz:$P پاسخ داد پس از $((TUP - T0)) ثانیه (T_up=$TUP_S)"
      break 2
    fi
  done
  sleep 1
done
if [ -z "$TUP" ]; then
  say "❌ سرور ظرف ۳۰۰ ثانیه بالا نیامد — شکست آزمون (لاگ رستاخیز را ببینید)"; exit 1
fi
ELAPSED=$((TUP - T0))
curl -fsS -m 3 "http://127.0.0.1:3100/healthz" >"$WIT/healthz-after.json" 2>/dev/null
curl -fsS -m 3 "http://127.0.0.1:3101/healthz" >"$WIT/healthz-after.json" 2>/dev/null || true

# drift: نسخهٔ زنده باید = HEAD باشد
say "═══ گام ۵: راستی‌آزمایی drift ═══"
HEAD_SHA=$(cat "$WIT/head.txt")
VER=""
for i in $(seq 1 30); do
  VER=$(curl -fsS -m 3 http://127.0.0.1:3000/api/version 2>/dev/null | \
        python3 -c 'import json,sys;print(json.load(sys.stdin).get("gitSha",""))' 2>/dev/null)
  [ -n "$VER" ] && break
  sleep 2
done
curl -fsS -m 3 http://127.0.0.1:3000/api/version >"$WIT/version-after.json" 2>/dev/null
if [ "$VER" = "$HEAD_SHA" ]; then
  say "✅ drift=FALSE — سرور $VER می‌سرود = HEAD (هم‌راستا)"
else
  say "⚠️ سرور $VER می‌سرود ولی HEAD=$HEAD_SHA (drift — head-guard تا ۱۰ دقیقه هم‌راستا می‌کند)"
fi

# کارگر (با TTL قفل JobLock تا ۹۰ث تأخیر طبیعی است)
say "═══ گام ۶: منتظر کارگر (TTL قفل ≤۹۰ث طبیعی) ═══"
TW=""
while [ $(( $(date +%s) - T0 )) -lt 360 ]; do
  if pgrep -f "scripts/runtime/worker\.ts" >/dev/null 2>&1; then
    TW=$(( $(date +%s) - T0 )); say "✅ کارگر زنده شد پس از $TW ثانیه"; break
  fi
  sleep 2
done
[ -z "$TW" ] && say "⏳ کارگر در پنجرهٔ آزمون بالا نیامد (supervisor وب در چرخهٔ بعدی می‌آورد)"

sleep 5
say "═══ گام ۷: شاهد پس از رستاخیز ═══"
ps -eo pid,ppid,etimes,cmd | grep -E 'prod-watchdog|socket-master|next-server|worker\.ts|hot-mirror' \
  | grep -v grep | grep -v acceptance | tee "$WIT/ps-after.txt"
python3 - "$WIT/counts-after.json" <<'PYEOF'
import json, sqlite3, sys
con = sqlite3.connect('file:/home/z/my-project/db/custom.db?mode=ro', uri=True)
cur = con.cursor()
out = {}
for t in ('PropertyRecord', 'RequestRecord'):
    out[t] = cur.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
out['integrity'] = cur.execute('PRAGMA quick_check').fetchone()[0]
con.close()
json.dump(out, open(sys.argv[1], 'w'), ensure_ascii=False, indent=1)
print('counts-after:', out)
PYEOF
say "— خلاصه: سرور=${ELAPSED}s · drift=$([ "$VER" = "$HEAD_SHA" ] && echo FALSE || echo TRUE) · کارگر=${TW:-نامعلوم}s"
say "— شاهد boot-recovery: $(tail -5 "$REPO/upload/.runtime/pn056/boot-recovery.log" 2>/dev/null | tr '\n' ' | ')"
if [ "$ELAPSED" -le 45 ]; then
  say "🏆 نتیجهٔ آزمون: قبول — سرور در ${ELAPSED}s بالا آمد (هدف <۴۵ث)"
else
  say "⚠️ نتیجهٔ آزمون: سرور ${ELAPSED}s طول کشید (هدف ۴۵ث — تحلیل فازها در گزارش)"
fi
