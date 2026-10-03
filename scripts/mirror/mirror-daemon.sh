#!/usr/bin/env bash
# ============================================================
# دیمن آینهٔ برون‌پلتفرمی ملکا — قانون تثبیت ۰۳۱ / بند ل (P6544)
# ------------------------------------------------------------
#   • هر ۶ ساعت: پوش خودکار همهٔ شاخه‌ها/تگ‌ها به مخزن خصوصی GitHub
#   • هر ۲۴ ساعت (هر چهارمین سیکل): وارسی هش — تطابق HEAD محلی با ریموت
#   • هر هفته (هر بیست‌وهشتمین سیکل): گزارش خلاصه برای مالک
#   • هر سیکل: بازتنظیم امن ریموت از credentials.env (تاب‌پذیری پس از ریست)
# ------------------------------------------------------------
# P6547 (ادامه — ۱۴۰۵/۰۷/۱۲): سقف سخت GitHub = ۱۰۰MB/فایل؛ db/custom.db
# در بک‌فیل‌های دادهٔ زندهٔ P6547 از ۷۴٫۷ به ۱۵۲٫۸MB رسید → پوش شاخهٔ main
# برای همیشه با GH001 رد می‌شود (تاریخچه قابل بازنویسی نیست — قانون ی).
# سازوکار تازه: شاخهٔ یتیم survival/code = درخت کاملِ هر سیکل بدون
# فایل‌های بالای سقف (فقط db/custom.db)؛ پوش per-ref؛ main همچنان
# تلاش می‌شود (اگر روزی مالک LFS/بازسازی مجاز کرد، خودکار زنده می‌شود).
# DB کامل در بسته‌های بقای upload/.survival (ذخیره‌ساز پایدار) ماندگار است.
# ============================================================
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

# --- P6547: شاخهٔ اسنپ‌شات بقا و سقف GitHub ---
SNAPSHOT_BRANCH="survival/code"   # شاخهٔ یتیم — درخت کامل بدون فایل‌های بالای سقف
SIZE_LIMIT_BYTES=$((99 * 1024 * 1024))  # سقف سخت GitHub ۱۰۰MB — حاشیهٔ امنتی ۱MB

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
  local t0 t1 dur head_before result main_result snap_result
  head_before="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
  t0=$(date +%s)
  # P6547: پوش per-ref — رد شدن main (GH001) نباید survival/code را بکشد
  if git push mirror refs/heads/main:refs/heads/main --force >/dev/null 2>&1; then
    main_result=ok
  else
    main_result=fail
  fi
  if git rev-parse --verify --quiet "refs/heads/$SNAPSHOT_BRANCH" >/dev/null 2>&1; then
    if git push mirror "refs/heads/$SNAPSHOT_BRANCH:refs/heads/$SNAPSHOT_BRANCH" --force >/dev/null 2>&1; then
      snap_result=ok
    else
      snap_result=fail
    fi
  else
    snap_result=absent
  fi
  git push mirror --tags --force >/dev/null 2>&1 || true
  t1=$(date +%s); dur=$((t1 - t0))
  if [[ "$main_result" == "ok" && ("$snap_result" == "ok" || "$snap_result" == "absent") ]]; then
    result=ok
  else
    result=fail
  fi
  log_event push "\"result\":\"$result\",\"main\":\"$main_result\",\"survivalCode\":\"$snap_result\",\"head\":\"$head_before\",\"durationSec\":$dur"
  [[ "$snap_result" == "ok" || ( "$main_result" == "ok" && "$snap_result" == "absent" ) ]]
}

# P6547: سازندهٔ کامیت اسنپ‌شات بقا — درخت HEAD منهای فایل‌های بالای سقف
# هیچ فایلی روی دیسک لمس نمی‌شود (ایندکس موقت)؛ تاریخچهٔ main دست‌نخورده.
build_snapshot() {
  local tmp_index tree parent commit src_sha oversized
  src_sha="$(git rev-parse --short HEAD)"
  tmp_index="$(mktemp)"
  if ! GIT_INDEX_FILE="$tmp_index" git read-tree HEAD >/dev/null 2>&1; then
    rm -f "$tmp_index"
    log_event error "\"where\":\"build_snapshot.read-tree\""
    return 1
  fi
  # فهرست فایل‌های بالای سقف از درخت HEAD (ls-tree -l: اندازه در ستون چهارم)
  oversized="$(git ls-tree -r -l HEAD | awk -F'\t' -v lim="$SIZE_LIMIT_BYTES" '{ split($1, a, " "); if ((a[1] == "100644" || a[1] == "100755" || a[1] == "120000") && a[4]+0 > lim) print $2 }')"
  while IFS= read -r big; do
    [[ -n "$big" ]] && GIT_INDEX_FILE="$tmp_index" git rm --cached -q --ignore-unmatch -- "$big" >/dev/null 2>&1
  done <<< "$oversized"
  tree="$(GIT_INDEX_FILE="$tmp_index" git write-tree)"
  rm -f "$tmp_index"
  parent="$(git rev-parse --verify --quiet "refs/heads/$SNAPSHOT_BRANCH" 2>/dev/null || true)"
  if [[ -n "$parent" && "$(git rev-parse "${parent}^{tree}" 2>/dev/null)" == "$tree" ]]; then
    return 0   # بدون تغییر — کامیت تهی نزن
  fi
  if [[ -n "$parent" ]]; then
    commit="$(git commit-tree "$tree" -p "$parent" -m "survival snapshot $src_sha $(date -u +%Y-%m-%dT%H:%M:%SZ) — full tree minus >99MB files (db in survival packages)")"
  else
    commit="$(git commit-tree "$tree" -m "survival snapshot $src_sha $(date -u +%Y-%m-%dT%H:%M:%SZ) — orphan root: full tree minus >99MB files (db in survival packages)")"
  fi
  git update-ref "refs/heads/$SNAPSHOT_BRANCH" "$commit"
  log_event snapshot "\"branch\":\"$SNAPSHOT_BRANCH\",\"source\":\"$src_sha\",\"commit\":\"$(git rev-parse --short "$commit")\",\"excluded\":$(printf '%s' "$oversized" | grep -c . || echo 0)"
}

do_verify() {
  # وارسی هش: HEAD محلی در برابر ریموت — main و survival/code هر دو
  local local_head remote_head local_snap remote_snap
  # shellcheck disable=SC1090
  source "$CRED_FILE" || return 1
  local_head="$(git rev-parse refs/heads/main 2>/dev/null || echo unknown)"
  remote_head="$(timeout 60 git ls-remote "$MIRROR_URL_AUTHED" refs/heads/main 2>/dev/null | awk '{print $1}')"
  if [[ -n "${remote_head:-}" && "$local_head" == "$remote_head" ]]; then
    log_event verify "\"result\":\"match\",\"ref\":\"main\",\"head\":\"$local_head\""
  else
    # P6547: main عمداً عقب است (GH001) — عامل بقا survival/code است
    log_event verify "\"result\":\"MISMATCH\",\"ref\":\"main\",\"local\":\"$local_head\",\"remote\":\"${remote_head:-unreachable}\",\"note\":\"expected until owner authorizes LFS rewrite — survival/code is the active mirror (P6547)\""
  fi
  local_snap="$(git rev-parse "refs/heads/$SNAPSHOT_BRANCH" 2>/dev/null || echo absent)"
  remote_snap="$(timeout 60 git ls-remote "$MIRROR_URL_AUTHED" "refs/heads/$SNAPSHOT_BRANCH" 2>/dev/null | awk '{print $1}')"
  if [[ -n "${remote_snap:-}" && "$local_snap" == "$remote_snap" ]]; then
    log_event verify "\"result\":\"match\",\"ref\":\"$SNAPSHOT_BRANCH\",\"head\":\"$local_snap\""
  else
    log_event verify "\"result\":\"MISMATCH\",\"ref\":\"$SNAPSHOT_BRANCH\",\"local\":\"$local_snap\",\"remote\":\"${remote_snap:-unreachable}\""
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

  build_snapshot
  ensure_remote && do_push || log_event error "\"where\":\"push\",\"cycle\":$CYCLE"

  if (( CYCLE % VERIFY_EVERY == 0 )); then
    do_verify
  fi
  if (( CYCLE % WEEKLY_EVERY == 0 )); then
    do_weekly
  fi

  sleep "$INTERVAL_SECONDS"
done
