#!/bin/bash
# PN-020 · H2 — الگوی پارک استاندارد بیلد (park-deliver.sh)
# ---------------------------------------------------------------------------
# مصوبهٔ جلسهٔ شورای ۰۲۴ بند ۵: «الگوی پارک به صورت استاندارد در همهٔ بیلدها»
# درس BUILD-DISCIPLINE (درس چهارم — PN-017): بیلد standalone با کپی tracing،
# deliver-store را موقتاً داخل .next/standalone کپی می‌کند (ENOSPC ×۴).
#
# این اسکریپت دو حالت دارد:
#   park    — پیش از بیلد: پارک deliver-store بیرون از ریشهٔ tracing + پاک‌سازی
#             standalone کهنه (بند ۴ مصوبه: «حذف خودکار .next/standalone قدیمی
#             قبل از بیلد») + گزارش فضای آزاد
#   restore — پس از بیلد: بازگشت آنی deliver-store + آزمون یک لینک تحویل
#             (قانون فایل v3: لینک باید ۲۰۰ بماند)
set -u
cd /home/z/my-project

PARK_PATH="/home/z/deliver-store-park"
STORE="deliver-store"

case "${1:-}" in
  park)
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
    if [ -d "$PARK_PATH" ] && [ ! -d "$STORE" ]; then
      mv "$PARK_PATH" "$STORE" && echo "RESTORE: $PARK_PATH → $STORE ✓"
    else
      echo "RESTORE: مخزن سر جای خودش است — هیچ اقدامی"
    fi
    # آزمون یک لینک تحویل (بهترین-تلاش — فقط گزارش)
    SAMPLE=$(ls "$STORE"/*-ALL.zip 2>/dev/null | head -1 | xargs -r basename 2>/dev/null || true)
    if [ -n "${SAMPLE:-}" ]; then
      echo "نمونهٔ سرو: /deliver/$SAMPLE (آزمون دستی پس از بوت سرور: curl -I .../deliver/$SAMPLE)"
    fi
    echo "فضای آزاد: $(df -h / | tail -1 | awk '{print $4}') ($(df -h / | tail -1 | awk '{print $5}' | tr -d '%')٪ پر)"
    ;;
  *)
    echo "کاربرد: bash scripts/park-deliver.sh [park|restore]"
    exit 2
    ;;
esac
