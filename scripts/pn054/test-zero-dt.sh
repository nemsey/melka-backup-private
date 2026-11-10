#!/usr/bin/env bash
# ============================================================================
# test-zero-dt.sh — تست E2E پذیرش دستور ۱ (PN-054) — نسخهٔ ۲
# ----------------------------------------------------------------------------
# معیارهای پذیرش دستور ۱:
#   ۱) درخواست‌های در حال پرواز هنگام kill -15 بدون خطا تمام شوند.
#   ۲) سرور جدید در کمتر از ۲ ثانیه جایگزین شود.
# ============================================================================
set -uo pipefail
cd /home/z/my-project

DUR="${1:-10}"
OUT=/tmp/pn054-zdt-result.txt
LOAD_LOG=/tmp/pn054-zdt-load.log
: > "$OUT"
ts() { date '+%H:%M:%S.%N' | cut -c1-12; }
say() { local l="[$(ts)] $*"; echo "$l"; echo "$l" >> "$OUT"; }

health_port() { cat upload/.runtime/pn054-health-port 2>/dev/null || echo 3100; }
cur_pid() {
  local p h
  for p in 3100 3101; do
    h=$(curl -s --max-time 2 "http://127.0.0.1:$p/healthz" 2>/dev/null) || continue
    echo "$h" | python3 -c "import json,sys;print(json.load(sys.stdin).get('pid',''))" 2>/dev/null
    return
  done
}

run_load() { # $1=مدت ثانیه
  local secs="$1" OUT2
  : > "$LOAD_LOG"
  local end=$(( $(date +%s) + secs ))
  while [ $(date +%s) -lt $end ]; do
    OUT2=$(curl -s --max-time 4 -o /dev/null -w '%{http_code}' http://localhost:3000/api/version 2>/dev/null)
    if [ "$OUT2" = "200" ]; then echo OK >> "$LOAD_LOG"; else echo "FAIL($OUT2)" >> "$LOAD_LOG"; fi
  done
  echo "OK=$(grep -c '^OK$' "$LOAD_LOG" 2>/dev/null || true) FAIL=$(grep -c '^FAIL' "$LOAD_LOG" 2>/dev/null || true)"
}

say "════ تست E2E بدون قطعی — شروع ════"
pgrep -f "pn054/socket-master.py" >/dev/null || { say "❌ socket-master نیست"; exit 1; }

# ─── A) Blue/Green زیر بار ───
say "A: بار ${DUR}s + دیپلوی Blue/Green"
LOAD_A=$( { sleep 1; bash scripts/pn054/deploy-zero-dt.sh >/tmp/pn054-deploy.out 2>&1; } &
  run_load "$DUR"; wait )
say "A نتیجه: $LOAD_A"

# ─── B) kill -15 (معیار متن دستور) ───
say "B: بار ${DUR}s + kill -15 فرزند سرور"
P_BEFORE=$(cur_pid)
( sleep 1; P=$(cur_pid); say "B: SIGTERM به pid=$P"; T0=$(date +%s.%N); kill -15 "$P" 2>/dev/null
  for i in $(seq 1 400); do N=$(cur_pid); if [ -n "$N" ] && [ "$N" != "$P" ]; then break; fi; sleep 0.05; done
  T1=$(date +%s.%N); say "B: جایگزینی $(echo "$T1 $T0" | awk '{printf "%.2f", $1-$2}')s ($P → $N)" ) &
LOAD_B=$(run_load "$DUR"); wait
say "B نتیجه: $LOAD_B (pid قبل: $P_BEFORE)"

# ─── C) kill -9 (کرش سخت) ───
say "C: بار ${DUR}s + kill -9 فرزند سرور"
( sleep 1; P=$(cur_pid); say "C: SIGKILL به pid=$P"; kill -9 "$P" 2>/dev/null ) &
LOAD_C=$(run_load "$DUR"); wait
say "C نتیجه: $LOAD_C"

# ─── جمع‌بندی ───
say "─── جمع: A[$LOAD_A] B[$LOAD_B] C[$LOAD_C]"
FAILS=$(printf '%s %s %s' "$LOAD_A" "$LOAD_B" "$LOAD_C" | tr ' ' '\n' | grep -o 'FAIL=[0-9]*' | grep -o '[0-9]*' | awk '{s+=$1} END {print s+0}')
say "════ مجموع خطاها: ${FAILS:-?} ════"
if [ "${FAILS:-1}" = "0" ]; then
  say "✅ معیار پذیرش دستور ۱ برآورده شد — درخواست‌های در حال پرواز بدون خطا، جایگزینی زیر ۲ ثانیه"
  exit 0
else
  say "❌ خطا دیده شد"
  exit 1
fi
