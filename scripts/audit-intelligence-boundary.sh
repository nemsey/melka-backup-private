#!/usr/bin/env bash
# =============================================================================
# audit-intelligence-boundary.sh — گارد مرز لایه هوشمندی (PHASE 3)
# =============================================================================
# وظایف:
#   ۱) اسکن مستقیم: هیچ فایلی در src/core/intelligence نباید به‌طور ارزشی
#      @prisma/client، @/lib/db، react یا fetch زنده داشته باشد.
#   ۲) قاعده پل سازگاری: تنها base-intelligent-agent.ts مجاز است ماژول لایه
#      ایجنت را ارزشی import کند (پل وراثت به BaseLearningAgent).
#   ۳) خلوص بازگشتی: از ۱۳ ریشه خالص (۱۱ قرارداد + engines/index +
#      engine-deps)، گراف import ارزشی هرگز به Prisma/lib-db نمی‌رسد
#      (scripts/audit-intelligence-graph.ts — الگوی P1-03).
#
# حالت‌ها:
#   بدون آرگومان → فقط گزارش
#   --strict     → اجرای حاکم: شکست در صورت هر نقض
# =============================================================================
set -uo pipefail
cd "$(dirname "$0")/.."

MODE="${1:-}"
INTEL="src/core/intelligence"

# ---------- ۱) اسکن مستقیم ----------
DIRECT_PRISMA=$(grep -rlE "from ['\"]@prisma/client['\"]" $INTEL --include='*.ts' 2>/dev/null | grep -c . || true)
DIRECT_DB=$(grep -rlE "from ['\"]@/lib/db['\"]" $INTEL --include='*.ts' 2>/dev/null | grep -c . || true)
DIRECT_FETCH=$(grep -rlE '\bfetch\s*\(' $INTEL --include='*.ts' 2>/dev/null | grep -c . || true)
DIRECT_REACT=$(grep -rlE "from ['\"]react['\"]" $INTEL --include='*.ts' 2>/dev/null | grep -c . || true)

# ---------- ۲) قاعده پل سازگاری ----------
BRIDGE="src/core/intelligence/base-intelligent-agent.ts"
BRIDGE_VIOLATORS=""
for f in $(find $INTEL -name '*.ts' ! -name 'base-intelligent-agent.ts'); do
  if grep -qE "from ['\"]@/core/agent/" "$f" && ! grep -qE "^\s*import type" <(grep -B0 "from ['\"]@/core/agent/" "$f"); then
    # فقط importهای ارزشی (نه import type) نقض‌اند
    if grep -E "^\s*import\s+(?!type)" "$f" 2>/dev/null | grep -q "@/core/agent/" || \
       grep -E "^\s*import\s+\{" "$f" | grep -v "type " | grep -q "@/core/agent/"; then
      BRIDGE_VIOLATORS="$BRIDGE_VIOLATORS $f"
    fi
  fi
done

# ---------- ۳) خلوص بازگشتی ----------
GRAPH_OK=1
GRAPH_OUTPUT=$(bun scripts/audit-intelligence-graph.ts 2>&1) || GRAPH_OK=0

echo "=============== INTELLIGENCE BOUNDARY AUDIT (P3-06) ==============="
printf "%-58s %s\n" "فایل‌های لایه هوشمندی با import ارزشی @prisma/client:" "$DIRECT_PRISMA"
printf "%-58s %s\n" "فایل‌های لایه هوشمندی با import ارزشی @/lib/db:"       "$DIRECT_DB"
printf "%-58s %s\n" "فایل‌های لایه هوشمندی با fetch زنده:"                  "$DIRECT_FETCH"
printf "%-58s %s\n" "فایل‌های لایه هوشمندی با import react:"                 "$DIRECT_REACT"
printf "%-58s %s\n" "نقض قاعده پل (import ارزشی لایه ایجنت خارج از bridge):" "$(echo -n $BRIDGE_VIOLATORS | grep -c . || true)"
echo "--- خلوص بازگشتی (۱۳ ریشه) ---"
echo "$GRAPH_OUTPUT"
echo "====================================================================="

FAIL=0
if [ "$MODE" = "--strict" ]; then
  if [ "$DIRECT_PRISMA" -gt 0 ] || [ "$DIRECT_DB" -gt 0 ] || [ "$DIRECT_FETCH" -gt 0 ] || [ "$DIRECT_REACT" -gt 0 ]; then
    echo "FAIL: نقض اسکن مستقیم لایه هوشمندی."
    FAIL=1
  fi
  if [ -n "$BRIDGE_VIOLATORS" ]; then
    echo "FAIL: نقض قاعده پل:$BRIDGE_VIOLATORS"
    FAIL=1
  fi
  if [ "$GRAPH_OK" -ne 1 ]; then
    echo "FAIL: نقض خلوص بازگشتی گراف import."
    FAIL=1
  fi
  if [ "$FAIL" -eq 0 ]; then
    echo "PASS: مرز لایه هوشمندی در حالت --strict رعایت شد."
  fi
  exit $FAIL
fi
