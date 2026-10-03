#!/usr/bin/env bash
# ============================================================
# دیمن آینهٔ برون‌پلتفرمی ملکا — قانون تثبیت ۰۳۱ / بند ل (P6544)
# ------------------------------------------------------------
#   • هر ۶ ساعت: پوش خودکار همهٔ شاخه‌ها/تگ‌ها به مخزن خصوصی GitHub
#   • هر ۲۴ ساعت (هر چهارمین سیکل): وارسی هش — تطابق HEAD محلی با ریموت
#   • هر هفته (هر بیست‌وهشتمین سیکل): گزارش خلاصه برای مالک
#   • هر سیکل: بازتنظیم امن ریموت از credentials.env (تاب‌پذیری پس از ریست)
# ------------------------------------------------------------
# ماندگاری: credentials.env و لاگ‌ها در upload/.mirror (ذخیره‌ساز پایدار)اند؛
# پس از ریست پلتفرم این دیمن می‌میرد → با scripts/mirror/re-arm.sh دوباره
# فعال شود (وارسی آغاز جلسه — بند و).
# ============================================================
set -u
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

MIRROR_DIR="upload/.mirror"
CRED_FILE="$MIRROR_DIR/credentials.env"
LOG="$MIRROR_DIR/push-log.jsonl"
PID_FILE="$MIRROR_DIR/daemon.pid"
CYCLE_FILE="$MIRROR_DIR/cycle-count"
WEEKLY="$MIRROR_DIR/weekly-report.md"

INTERVAL_SECONDS=21600   # ۶ ساعت
VERIFY_EVERY=4            # هر چهارمین سیکل = ۲۴ ساعت
WEEKLY_EVERY=28           # هر بیست‌وهشتمین سیکل = ۱ هفته

# --- گارد: تنها یک نمونه از دیمن ---
if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE" 2>/dev/null)" 2>/dev/null; then
  echo "daemon already running (pid $(cat "$PID_FILE"))" >&2
  exit 0
fi
echo $$ > "$PID_FILE"
trap 'rm -f "$PID_FILE"' EXIT

log_event() {
  # $1 = kind, بقیه = فیلدهای json آماده
  local kind="$1"; shift
  printf '{"at":"%s","kind":"%s",%s}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$kind" "$*" >> "$LOG"
}

ensure_remote() {
  # shellcheck disable=SC1090
  source "$CRED_FILE" || return 1
  git remote remove mirror >/dev/null 2>&1
  git remote add mirror "$MIRROR_URL_AUTHED"
}

do_push() {
  local t0 t1 dur head_before result
  head_before="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
  t0=$(date +%s)
  if git push mirror --all --tags --force >/dev/null 2>&1; then result=ok; else result=fail; fi
  t1=$(date +%s); dur=$((t1 - t0))
  log_event push "\"result\":\"$result\",\"head\":\"$head_before\",\"durationSec\":$dur"
  [[ "$result" == "ok" ]]
}

do_verify() {
  # وارسی هش: HEAD محلی در برابر refs/heads/main ریموت
  local local_head remote_head
  # shellcheck disable=SC1090
  source "$CRED_FILE" || return 1
  local_head="$(git rev-parse refs/heads/main 2>/dev/null || echo unknown)"
  remote_head="$(timeout 60 git ls-remote "$MIRROR_URL_AUTHED" refs/heads/main 2>/dev/null | awk '{print $1}')"
  if [[ -n "${remote_head:-}" && "$local_head" == "$remote_head" ]]; then
    log_event verify "\"result\":\"match\",\"head\":\"$local_head\""
  else
    log_event verify "\"result\":\"MISMATCH\",\"local\":\"$local_head\",\"remote\":\"${remote_head:-unreachable}\""
  fi
}

do_weekly() {
  local total ok fail
  total=$(grep -c '"kind":"push"' "$LOG" 2>/dev/null || echo 0)
  ok=$(grep -c '"kind":"push","result":"ok"' "$LOG" 2>/dev/null || echo 0)
  fail=$((total - ok))
  {
    echo "# گزارش هفتگی آینهٔ برون‌پلتفرمی — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo ""
    echo "- کل پوش‌های ثبت‌شده: $total (موفق: $ok / ناموفق: $fail)"
    echo "- HEAD محلی: $(git rev-parse refs/heads/main 2>/dev/null || echo unknown)"
    echo "- آخرین ۵ رویداد:"
    tail -5 "$LOG" 2>/dev/null | sed 's/^/  - /'
  } > "$WEEKLY"
  log_event weekly "\"written\":\"$WEEKLY\""
}

# ============================ چرخهٔ اصلی ============================
log_event daemon-start "\"pid\":$$,\"intervalSec\":$INTERVAL_SECONDS"

CYCLE=0
if [[ -f "$CYCLE_FILE" ]]; then CYCLE=$(cat "$CYCLE_FILE" 2>/dev/null || echo 0); fi

while true; do
  CYCLE=$((CYCLE + 1))
  echo "$CYCLE" > "$CYCLE_FILE"

  ensure_remote && do_push || log_event error "\"where\":\"push\",\"cycle\":$CYCLE"

  if (( CYCLE % VERIFY_EVERY == 0 )); then
    do_verify
  fi
  if (( CYCLE % WEEKLY_EVERY == 0 )); then
    do_weekly
  fi

  sleep "$INTERVAL_SECONDS"
done
