#!/usr/bin/env bash
# ============================================================
# live-db-path.sh — حل‌کنندهٔ مسیر دیتابیس زندهٔ رسمی (PN-041 · شورا-ن۰۶۷)
# ------------------------------------------------------------
# منطقِ همان prod-watchdog: قلعهٔ داده (upload/.data — منطقهٔ پایدار)
# اولویت دارد؛ fallback مسیر قدیمی db/ (منطقهٔ ریست).
# همهٔ گاردهای بازیابی از این حل‌کننده استفاده می‌کنند تا «زنده»
# همیشه همان فایلی باشد که سرور واقعاً سرو می‌کند.
# کاربرد: LIVE="$(bash scripts/recovery/live-db-path.sh)"
# ============================================================
REPO="${REPO_DIR:-/home/z/my-project}"
FORT="$REPO/upload/.data/custom.db"
LEG="$REPO/db/custom.db"

if [ -s "$FORT" ] && [ "$(head -c 15 "$FORT" 2>/dev/null)" = "SQLite format 3" ]; then
  echo "$FORT"
elif [ -s "$LEG" ] && [ "$(head -c 15 "$LEG" 2>/dev/null)" = "SQLite format 3" ]; then
  echo "$LEG"
elif [ -s "$LEG" ]; then
  echo "$LEG"   # موجود اما سرآیند نامعتبر — همچنان «زنده» برای داوری گارد مقدس
elif [ -s "$FORT" ]; then
  echo "$FORT"  # موجود اما سرآیند نامعتبر — داوری سلامت با گارد قلعه
else
  echo "$FORT"  # هیچ — قلعه مقصدِ بازیابی رسمی است
fi
