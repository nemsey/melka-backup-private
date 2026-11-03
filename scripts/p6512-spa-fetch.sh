#!/bin/bash
# دانلود چانک ورودی SPA با حلقهٔ resume (اتصال کند ~3KB/s)
set -uo pipefail
BASE="https://arm.melketabriz.ir"
UA="Mozilla/5.0 (Windows NT 10.0; Win64 x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"
OUT="/tmp/arm-spa-b4"
ENTRY="assets/index-Cug6tOnM.js"
TARGET_SIZE=1064632  # اندازهٔ شناخته‌شده از جلسه قبل
mkdir -p "$OUT/assets"
for i in $(seq 1 40); do
  SZ=$(stat -c%s "$OUT/$ENTRY" 2>/dev/null || echo 0)
  if [ "$SZ" -ge "$TARGET_SIZE" ]; then echo "COMPLETE: $SZ bytes"; break; fi
  curl -sS --max-time 90 --connect-timeout 15 -A "$UA" -C - "$BASE/$ENTRY" -o "$OUT/$ENTRY" 2>/dev/null
  echo "try $i: $(stat -c%s "$OUT/$ENTRY" 2>/dev/null || echo 0) bytes"
  sleep 1
done
