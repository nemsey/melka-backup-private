#!/usr/bin/env bash
# P1-04 — گارد خطاهای تایپ (baseline snapshot + بلاک خطاهای جدید)
# ------------------------------------------------------
# استفاده:
#   scripts/typecheck-baseline.sh --update   → ثبت snapshot فعلی
#   scripts/typecheck-baseline.sh            → مقایسه با snapshot (خطای جدید = شکست)
set -euo pipefail
cd /home/z/my-project

SNAPSHOT="scripts/tsc-baseline.txt"
CURRENT=$(mktemp)
bunx tsc --noEmit 2>/dev/null | sort > "$CURRENT" || true

if [ "${1:-}" = "--update" ]; then
  cp "$CURRENT" "$SNAPSHOT"
  echo "snapshot به‌روز شد: $(wc -l < "$SNAPSHOT") خطا"
  rm -f "$CURRENT"
  exit 0
fi

if [ ! -f "$SNAPSHOT" ]; then
  echo "snapshot وجود ندارد — ابتدا: scripts/typecheck-baseline.sh --update"
  rm -f "$CURRENT"
  exit 1
fi

# خطاهای جدید = خطوطی که در snapshot نیستند
NEW=$(comm -23 "$CURRENT" "$SNAPSHOT")
FIXED=$(comm -13 "$CURRENT" "$SNAPSHOT")

if [ -n "$NEW" ]; then
  echo "✗ خطاهای تایپ جدید (بلاک شده):"
  echo "$NEW"
  rm -f "$CURRENT"
  exit 1
fi

echo "✓ صفر خطای جدید (baseline: $(wc -l < "$SNAPSHOT") خطا، رفع‌شده از قبلی: $(echo -n "$FIXED" | grep -c . || true))"
rm -f "$CURRENT"
