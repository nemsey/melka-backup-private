#!/usr/bin/env bash
# ============================================================
# mirror-cycle.sh — «یک چرخهٔ» آینهٔ برون‌پلتفرمی ملکا (PN-010 / BLOCK 4)
# ------------------------------------------------------------
# استخراج‌شده از mirror-daemon.sh (P6544/قانون تثبیت ۰۳۱ بند ل):
#   • build_snapshot  — کامیت اسنپ‌شات درخت HEAD منهای فایل‌های >99MB
#   • ensure_remote   — بازتنظیم امن ریموت از credentials.env
#   • do_push         — پوش per-ref (main + survival/code + تگ‌ها)
#   • وارسی هش هر چهارمین سیکل · گزارش هفتگی هر بیست‌وهشتمین
# کاربران: کار mirror-cycle در صف Worker (هر ۶ ساعت) · mirror-daemon.sh
# (حلقهٔ قدیمی — حالا پوشش‌دهندهٔ همین اسکریپت) · فراخوانی دستی.
# وضعیت: خروج ۰ = چرخهٔ موفق · غیرصفر = خطا (Worker در اجرای بعدی دوباره می‌کوشد)
# ============================================================
set -u
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

MIRROR_DIR="upload/.mirror"
CRED_FILE="$MIRROR_DIR/credentials.env"
LOG="$MIRROR_DIR/push-log.jsonl"
CYCLE_FILE="$MIRROR_DIR/cycle-count"
WEEKLY="$MIRROR_DIR/weekly-report.md"

VERIFY_EVERY=4            # هر چهارمین سیکل = وارسی هش (۲۴ ساعت با سیکل ۶ ساعته)
WEEKLY_EVERY=28           # هر بیست‌وهشتمین سیکل = گزارش هفتگی

# --- P6547: شاخهٔ اسنپ‌شات بقا و سقف GitHub ---
SNAPSHOT_BRANCH="survival/code"
SIZE_LIMIT_BYTES=$((99 * 1024 * 1024))

mkdir -p "$MIRROR_DIR" 2>/dev/null || true

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

# ============================ یک چرخه ============================
CYCLE=0
if [[ -f "$CYCLE_FILE" ]]; then CYCLE=$(cat "$CYCLE_FILE" 2>/dev/null || echo 0); fi
CYCLE=$((CYCLE + 1))
echo "$CYCLE" > "$CYCLE_FILE"

log_event cycle-start "\"pid\":$$,\"cycle\":$CYCLE,\"caller\":\"${MIRROR_CALLER:-manual}\""

FAIL=0
build_snapshot || FAIL=1
if ensure_remote; then
  do_push || log_event error "\"where\":\"push\",\"cycle\":$CYCLE"
else
  log_event error "\"where\":\"ensure_remote\",\"cycle\":$CYCLE"
  FAIL=1
fi

if (( CYCLE % VERIFY_EVERY == 0 )); then
  do_verify
fi
if (( CYCLE % WEEKLY_EVERY == 0 )); then
  do_weekly
fi

log_event cycle-end "\"cycle\":$CYCLE,\"fail\":$FAIL"
exit "$FAIL"
