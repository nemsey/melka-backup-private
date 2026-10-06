#!/bin/bash
# =============================================================================
# fetch-arm-spa-b4.sh — B.4-استاتیک (ملکا-شورا-۰۰۷):
# دانلود باندل SPA سامانه ARM برای تحلیل استاتیک مسیرها — «بدون تماس API»
# -----------------------------------------------------------------------------
# اصل حاکم: فقط GET فایل‌های ایستای عمومی (HTML/JS) از میزبان SPA
# (arm.melketabriz.ir) — صفر درخواست به میزبان API (arus-api.melketabriz.ir)،
# صفر POST، صفر توکن. همان الگوی مجاز فازهای Recon قبلی (fetch_chunks.sh).
#
# گام‌ها:
#   ۱) GET / → index.html (کشف نام چانک ورودی با هش تازه)
#   ۲) استخراج نام چانک‌ها از index + ورودی (نقشهٔ import دینامیک Vite)
#   ۳) دانلود چانک‌های هدف: realtor-interactions-page + users-list + properties/requests
# =============================================================================
set -uo pipefail
BASE="https://arm.melketabriz.ir"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"
OUT="/tmp/arm-spa-b4"
mkdir -p "$OUT"

fetch() { # fetch <path> <out>
  local i
  for i in 1 2 3; do
    if curl -sS --max-time 40 --connect-timeout 15 -A "$UA" "$BASE$1" -o "$2" 2>/dev/null; then
      echo "OK  $1 ($(wc -c < "$2") bytes)"
      return 0
    fi
    echo "retry $i: $1"
    sleep 2
  done
  echo "FAIL $1"
  return 1
}

echo "=== [1] index.html ==="
fetch "/" "$OUT/index.html" || exit 1

echo ""
echo "=== [2] چانک‌های ارجاع‌شده در index ==="
grep -oE 'assets/[A-Za-z0-9_.-]+\.js' "$OUT/index.html" | sort -u | tee "$OUT/index-chunks.txt"

echo ""
echo "=== [3] دانلود چانک ورودی (برای نقشهٔ import دینامیک) ==="
ENTRY=$(grep -oE 'assets/[A-Za-z0-9_.-]+\.js' "$OUT/index.html" | head -1)
if [ -n "$ENTRY" ]; then
  fetch "/$ENTRY" "$OUT/entry.js" || true
fi

echo ""
echo "=== [4] جستجوی چانک صفحات هدف در نقشهٔ import ==="
# Vite نام چانک‌های lazy را در رشته‌های import دینامیک ورودی جاسازی می‌کند
for pat in "realtor-interactions" "users-list" "properties" "requests" "TradedStatistics" "dashboard-page"; do
  echo "--- pattern: $pat ---"
  grep -oE "\"[A-Za-z0-9_.-]*${pat}[A-Za-z0-9_.-]*\.js\"" "$OUT/entry.js" 2>/dev/null | sort -u | head -5
  grep -oE "[A-Za-z0-9_.-]*${pat}[A-Za-z0-9_.-]*\.js" "$OUT/entry.js" 2>/dev/null | sort -u | head -8
done

echo ""
echo "=== DONE ==="
ls -la "$OUT" | head -10
