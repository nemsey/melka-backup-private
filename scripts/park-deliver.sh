#!/bin/bash
# PN-020 · H2 — الگوی پارک استاندارد بیلد (park-deliver.sh)
# ---------------------------------------------------------------------------
# مصوبهٔ جلسهٔ شورای ۰۲۴ بند ۵: «الگوی پارک به صورت استاندارد در همهٔ بیلدها»
# درس BUILD-DISCIPLINE (درس چهارم — PN-017): بیلد standalone با کپی tracing،
# deliver-store را موقتاً داخل .next/standalone کپی می‌کند (ENOSPC ×۴).
#
# PN-024 · J1 (ملکا-شورا-ن۰۳۱) — پارک اتمی (درس دهم):
# هر park باید فایل PARK_ACTIVE بگذارد تا prod-watchdog حین پارک rebuild نکند
# (حلقهٔ مرگ ENOSPC: پارک ⇒ standalone حذف ⇒ نگهبان rebuild ⇒ tracing ۲٫۲GB ⇒ دیسک صفر).
# ترتیب: park = اول flag، بعد انتقال · restore = اول بازگشت، بعد حذف flag (fail-safe).
set -u
cd /home/z/my-project

PARK_PATH="/home/z/deliver-store-park"
STORE="deliver-store"
FLAGS_DIR="/home/z/my-project/upload/.runtime"
PARK_FLAG="$FLAGS_DIR/PARK_ACTIVE"
CI_FLAG="$FLAGS_DIR/CI_RUNNING"

mkdir -p "$FLAGS_DIR"

case "${1:-}" in
  park)
    # قانون ۹ — قفل اتمی: flag پیش از هر اقدام (نگهبان فایل را می‌بیند ⇒ صبر)
    touch "$PARK_FLAG"
    [ -f "$CI_FLAG" ] || touch "$CI_FLAG"
    echo "ATOMIC: PARK_ACTIVE + CI_RUNNING گذاشته شد (قانون ۹ — نگهبان rebuild نمی‌کند) ✓"
    if [ -d "$STORE" ] && [ ! -d "$PARK_PATH" ]; then
      mv "$STORE" "$PARK_PATH" && echo "PARK: $STORE → $PARK_PATH ✓"
    else
      echo "PARK: از قبل پارک است یا مخزن نیست — هیچ اقدامی"
    fi
    # بند ۴ مصوبه — standalone کهنه پیش از بیلد حذف می‌شود (tracing دوباره می‌سازد)
    if [ -d .next/standalone ]; then
      rm -rf .next/standalone && echo "CLEAN: .next/standalone کهنه حذف شد ✓"
    fi
    echo "فضای آزاد: $(df -h / | tail -1 | awk '{print $4}') ($(df -h / | tail -1 | awk '{print $5}' | tr -d '%')٪ پر)"
    ;;
  restore)
    # بازگشت اول — flag آخر (هر شکست وسط کار، flag را نگه می‌دارد = محافظه‌کار)
    if [ -d "$PARK_PATH" ] && [ ! -d "$STORE" ]; then
      mv "$PARK_PATH" "$STORE" && echo "RESTORE: $PARK_PATH → $STORE ✓"
    else
      echo "RESTORE: مخزن سر جای خودش است — هیچ اقدامی"
    fi
    rm -f "$PARK_FLAG"
    # CI_RUNNING فقط وقتی حذف می‌شود که CI واقعاً تمام شده باشد — چک ساده:
    # اگر پروسهٔ ci.sh زنده است، flag می‌ماند؛ وگرنه حذف
    if ! pgrep -f "scripts/ci.sh" > /dev/null 2>&1; then
      rm -f "$CI_FLAG"
      echo "UNFLAG: PARK_ACTIVE + CI_RUNNING حذف شد (نگهبان آزاد) ✓"
    else
      echo "HOLD: CI هنوز در حال اجراست — CI_ACTIVE می‌ماند ✓"
    fi
    # آزمون یک لینک تحویل (بهترین-تلاش — فقط گزارش)
    SAMPLE=$(ls "$STORE"/*-ALL.zip 2>/dev/null | head -1 | xargs -r basename 2>/dev/null || true)
    if [ -n "${SAMPLE:-}" ]; then
      echo "نمونهٔ سرو: /deliver/$SAMPLE (آزمون دستی پس از بوت سرور: curl -I .../deliver/$SAMPLE)"
    fi
    echo "فضای آزاد: $(df -h / | tail -1 | awk '{print $4}') ($(df -h / | tail -1 | awk '{print $5}' | tr -d '%')٪ پر)"
    ;;
  flags)
    # وضعیت قفل‌ها برای دریل/گواه
    if [ -f "$PARK_FLAG" ]; then echo "PARK_ACTIVE=1"; else echo "PARK_ACTIVE=0"; fi
    if [ -f "$CI_FLAG" ]; then echo "CI_RUNNING=1"; else echo "CI_RUNNING=0"; fi
    ;;
  *)
    echo "کاربرد: bash scripts/park-deliver.sh [park|restore|flags]"
    exit 2
    ;;
esac
