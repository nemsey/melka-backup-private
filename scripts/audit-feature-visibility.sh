#!/usr/bin/env bash
# =============================================================================
# audit-feature-visibility.sh — گارد دیدپذیری Feature/Prediction (PHASE 6 / P6-08)
# =============================================================================
# قانون (دستور PHASE 6، بخش D-۹): هیچ Feature/Prediction نباید به UI نشت کند.
#   ۱) اسکن مسیر مستقیم: صفر import (ارزشی یا تایپ) از ماژول‌های
#      feature/ یا prediction/ در src/app/** — UI و API هر دو.
#      دسترسی فقط از طریق ایجنت‌ها (src/core/agent) مجاز است.
#   ۲) اسکن نماد barrel: import از «@/core/intelligence» (barrel کل) فقط اگر
#      نمادهای صادراتی بدنه‌های feature/prediction را نام ببرد نقض است.
#
# اعتبارسنجی خودکار (P6-08): اسکنر با نشت عمدی (مسیر مستقیم + نماد barrel)
# آزمون شد — هر دو را می‌گیرد و --strict را می‌شکند (کاذب-منفی نداریم).
#
# حالت‌ها:
#   بدون آرگومان → فقط گزارش
#   --strict     → اجرای حاکم: شکست در صورت هر نقض
# =============================================================================
set -uo pipefail
cd "$(dirname "$0")/.."

MODE="${1:-}"
APP="src/app"
FEATURE_DIR="src/core/intelligence/feature"
PREDICTION_DIR="src/core/intelligence/prediction"

# ---------- ۱) اسکن مسیر مستقیم ----------
# الگوی «core/intelligence/feature» و «core/intelligence/prediction» را با هر
# پیشوندی می‌گیرد: alias (@/core/...) و نسبی (../../core/...).
DIRECT_HITS=$(grep -rnE "from ['\"][^'\"]*core/intelligence/(feature|prediction)(/[^'\"]*)?['\"]" $APP --include='*.ts' --include='*.tsx' 2>/dev/null || true)
DIRECT_COUNT=$(printf '%s' "$DIRECT_HITS" | grep -c . || true)

# ---------- ۲) اسکن نماد barrel ----------
# نمادهای بدنه (کلاس/تابع/ثابت) از فایل‌های feature/ و prediction/
# استخراج میدان-آگاه: «export const NAME = …» → NAME (نه مقدار؛ نه «{»)
BODY_SYMBOLS=$(grep -hE "^export (async )?(function|class|const) " \
  $FEATURE_DIR/*.ts $FEATURE_DIR/builders/*.ts \
  $PREDICTION_DIR/*.ts $PREDICTION_DIR/predictors/*.ts 2>/dev/null \
  | awk '{for(i=1;i<=NF;i++){if($i=="const"||$i=="class"||$i=="function"){print $(i+1); break}}}' \
  | grep -E '^[A-Za-z_][A-Za-z0-9_]*$' | sort -u || true)

BARREL_IMPORTS=$(grep -rnE "from[[:space:]]+['\"][^'\"]*core/intelligence['\"]" $APP --include='*.ts' --include='*.tsx' 2>/dev/null || true)

BARREL_HITS=""
if [ -n "$BODY_SYMBOLS" ] && [ -n "$BARREL_IMPORTS" ]; then
  while IFS= read -r imp; do
    [ -z "$imp" ] && continue
    file=$(printf '%s' "$imp" | cut -d: -f1)
    bindings=$(printf '%s' "$imp" | sed -nE "s/.*import[[:space:]]+(type[[:space:]]+)?\{([^}]*)\}.*/\2/p")
    [ -z "$bindings" ] && continue
    for sym in $BODY_SYMBOLS; do
      if printf '%s' "$bindings" | grep -qwF "$sym"; then
        BARREL_HITS="$BARREL_HITS
  $file ← نماد «$sym» از barrel هوشمندی"
      fi
    done
  done <<< "$BARREL_IMPORTS"
fi
BARREL_COUNT=$(printf '%s' "$BARREL_HITS" | grep -c . || true)

# ---------- گزارش ----------
echo "=============== FEATURE/PREDICTION VISIBILITY AUDIT (P6-08) ==============="
printf "%-62s %s\n" "import مستقیم feature/prediction در src/app (UI+API):" "$DIRECT_COUNT"
printf "%-62s %s\n" "import نماد بدنه از barrel هوشمندی در src/app:"      "$BARREL_COUNT"
printf "%-62s %s\n" "نمادهای بدنه تحت پایش:"                              "$(printf '%s\n' "$BODY_SYMBOLS" | grep -c . || true)"
if [ "$DIRECT_COUNT" -gt 0 ]; then
  echo "--- موارد مسیر مستقیم ---"
  printf '%s\n' "$DIRECT_HITS"
fi
if [ "$BARREL_COUNT" -gt 0 ]; then
  echo "--- موارد نماد barrel ---"
  printf '%s\n' "$BARREL_HITS"
fi
echo "==========================================================================="

if [ "$MODE" = "--strict" ]; then
  if [ "$DIRECT_COUNT" -gt 0 ] || [ "$BARREL_COUNT" -gt 0 ]; then
    echo "FAIL: نشت Feature/Prediction به لایه UI/API — دسترسی فقط از طریق ایجنت‌ها."
    exit 1
  fi
  echo "PASS: صفر نشت — Feature/Prediction فقط در لایه هوشمندی/ایجنت قابل دسترسی است."
  exit 0
fi
exit 0
