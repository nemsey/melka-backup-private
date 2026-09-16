#!/usr/bin/env bash
# =============================================================================
# regression-guard.sh — گارد رگرسیون (PHASE 2+ / بخش E.7 دستور اجرایی)
# =============================================================================
# قبل از هر کامیت اجرا می‌شود و باید سبز باشد:
#   ۱) کل تست‌ها (۵۴۵+ و رو به رشد) — روی پایگاه تست ایزوله
#   ۲) audit-repository-boundary.sh (مرز لایه Repository)
#   ۳) audit-log-safety.sh (اگر وجود دارد — از P2-05 به بعد)
#   ۴) audit-intelligence-boundary.sh --strict (اگر وجود دارد — از P3-06 به بعد)
#   ۵) audit-feature-visibility.sh --strict (از P6-08 — صفر نشت Feature/Prediction به UI/API)
# خروجی: exit 1 اگر هر کدام fail شود.
#
# استفاده: bash scripts/regression-guard.sh [audit-mode]
#   audit-mode: "" (پیش‌فرض، فقط-گزارش) | --strict-agents (از P2-02) | --strict (از P2-03)
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."
AUDIT_MODE="${1:-}"

echo "=== [1/5] تست‌ها (پایگاه تست ایزوله) ==="
if ! DATABASE_URL="file:/home/z/my-project/db/test.db" MELK_TOKEN_KEY="test-only-key-not-a-real-secret" \
     bun test tests/ 2>&1 | tail -5; then
  echo "GUARD FAIL: تست‌ها قرمز هستند."
  exit 1
fi

echo ""
echo "=== [2/5] مرز Repository (mode: ${AUDIT_MODE:-report-only}) ==="
if ! bash scripts/audit-repository-boundary.sh "$AUDIT_MODE"; then
  echo "GUARD FAIL: نقض مرز Repository."
  exit 1
fi

echo ""
echo "=== [3/5] امنیت لاگ ==="
if [ -f scripts/audit-log-safety.sh ]; then
  if ! bash scripts/audit-log-safety.sh; then
    echo "GUARD FAIL: داده حساس در لاگ."
    exit 1
  fi
else
  echo "SKIP: audit-log-safety.sh هنوز ساخته نشده (از P2-05 فعال می‌شود)."
fi

echo ""
echo "=== [4/5] مرز لایه هوشمندی (PHASE 3) ==="
if [ -f scripts/audit-intelligence-boundary.sh ]; then
  if ! bash scripts/audit-intelligence-boundary.sh --strict; then
    echo "GUARD FAIL: نقض مرز لایه هوشمندی."
    exit 1
  fi
else
  echo "SKIP: audit-intelligence-boundary.sh هنوز ساخته نشده (از P3-06 فعال می‌شود)."
fi

echo ""
echo "=== [5/5] مرز دیدپذیری Feature/Prediction (PHASE 6 / P6-08) ==="
if [ -f scripts/audit-feature-visibility.sh ]; then
  if ! bash scripts/audit-feature-visibility.sh --strict; then
    echo "GUARD FAIL: نشت Feature/Prediction به UI/API."
    exit 1
  fi
else
  echo "SKIP: audit-feature-visibility.sh هنوز ساخته نشده (از P6-08 فعال می‌شود)."
fi

echo ""
echo "GUARD PASS: همه بررسی‌ها سبز هستند."
