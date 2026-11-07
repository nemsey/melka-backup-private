#!/usr/bin/env bash
# PN-031-F — اجرای گاردهای ممیزی (دروازهٔ سند ۰۴۵: ۴۴/۴۴)
# ۴۲ اسکریپت scripts/audit-*.sh + ۱ head-guard (check) + ۱ تکرارپذیری = ۴۴
# دو گارد آخر باید پس از بیلد نهایی (BUILD_ID=HEAD) اجرا شوند — این اسکریپت
# فقط ۴۲ گارد اول را می‌دود؛ دو گادر پایانی با post-rebuild-verify.sh.
set -uo pipefail
cd /home/z/my-project
OUT=download/pn031e/guards-raw.txt
: > "$OUT"

run_guard() {
  local script="$1"; shift
  local args="$*"
  local log="/tmp/pn031f-guard.log"
  if timeout 90 bash "$script" $args > "$log" 2>&1; then
    echo "PASS|${script}|${args}" >> "$OUT"
  else
    local rc=$?
    if [ $rc -eq 124 ]; then echo "TIMEOUT|${script}|${args}" >> "$OUT"
    else echo "FAIL|${script}|${args}" >> "$OUT"; fi
  fi
}

# ۴۲ گارد اصلی (سه‌تای سخت‌گیر با --strict)
for script in scripts/audit-*.sh; do
  case "$script" in
    *repository-boundary*|*intelligence-boundary*|*feature-visibility*) run_guard "$script" --strict ;;
    *) run_guard "$script" ;;
  esac
done

PASS_C=$(grep -c "^PASS|" "$OUT" || true)
FAIL_C=$(grep -c "^FAIL|" "$OUT" || true)
TIMEOUT_C=$(grep -c "^TIMEOUT|" "$OUT" || true)
TOTAL=$((PASS_C + FAIL_C + TIMEOUT_C))
echo "=== نتیجهٔ ۴۲ گارد اول: PASS=$PASS_C FAIL=$FAIL_C TIMEOUT=$TIMEOUT_C (مجموع $TOTAL) ==="
echo "(گارد ۴۳=head-guard check و گارد ۴۴=تکرارپذیری — پس از بیلد نهایی)"
