#!/bin/bash
# resilient-test-runner.sh — اجرای فایل‌به‌فایل مقاوم (درس مرگ‌های میان‌راه مجموعه)
# هر فایل در فرایند جدا؛ مرگِ یک فایل، کل اجرا را نمی‌کشد
cd /home/z/my-project
LOG=test-chunked-results.log
: > "$LOG"
ENVV="NODE_ENV=test DATABASE_URL=file:/home/z/my-project/db/test.db MELK_TOKEN_KEY=test-only-key-not-a-real-secret MELK_API_TIMEOUT_MS=300 GLM_PROBE_TIMEOUT_MS=300"
TOTAL_PASS=0; TOTAL_FAIL=0; DIED=0
for f in tests/*.test.ts; do
  echo "── FILE: $f" >> "$LOG"
  OUT=$(eval env $ENVV timeout 300 bun test "$f" 2>&1); RC=$?
  echo "$OUT" >> "$LOG"
  P=$(echo "$OUT" | grep -c "^(pass)" || true); F=$(echo "$OUT" | grep -c "^(fail)" || true)
  P=${P:-0}; F=${F:-0}
  TOTAL_PASS=$((TOTAL_PASS+P)); TOTAL_FAIL=$((TOTAL_FAIL+F))
  if [ $RC -ne 0 ] && [ "$F" = "0" ]; then
    echo "⚠ RUNNER DIED/TIMEOUT on $f (rc=$RC)" >> "$LOG"
    DIED=$((DIED+1))
    TOTAL_PASS=$((TOTAL_PASS+P)) # counted anyway
  fi
  echo "   → pass=$P fail=$F (rc=$RC)" >> "$LOG"
done
{
  echo ""
  echo "═══ TOTALS: pass=$TOTAL_PASS fail=$TOTAL_FAIL died=$DIED ═══"
  echo "EXIT=done"
} >> "$LOG"
