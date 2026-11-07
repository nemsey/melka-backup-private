#!/usr/bin/env bash
# PN-031-G — اجرای واقعیِ signed_curl از اسکریپتِ تولیدشده در برابر سرور آزمایشی محلی.
# درس جلسهٔ ۰۴۷: «شبیه‌سازی ≠ اجرای واقعی» — اینجا خودِ تابع bash از خودِ اسکریپتِ
# تولیدشده (همان bootstrap گوشی مالک) استخراج و اجرا می‌شود.
#
# $1 = فایل اسکریپت تولیدشده (SERVER_URL به سرور آزمایشی اشاره می‌کند)
# $2 = حالت: ok (امضای واقعی) | sabotage (hmac_hex خراب → باید پیش‌پرواز بگیرد)
# خروجی استاندارد: CURL_EXIT=... و پیام‌های لاگ
set -uo pipefail
SCRIPT_FILE="$1"
MODE="${2:-ok}"

PART=$(mktemp)
# فقط بخش تعریف‌ها تا آغاز بخش اجرایی (خط SERVED=0) منبع می‌شود — بدون حلقهٔ بی‌نهایت
sed -n '1,/^SERVED=0/p' "$SCRIPT_FILE" | head -n -1 > "$PART"

# shellcheck disable=SC1090
source "$PART"

if [ "$MODE" = "sabotage" ]; then
  # خرابکاری عمدی: hmac_hex خروجی خالی می‌دهد — پیش‌پرواز PN-031-G باید
  # ارسال را متوقف کند (وگرنه curl هدرهای خالی را بی‌صدا حذف می‌کرد)
  hmac_hex() { :; }
fi

BODY='{"wait":0}'
RESP=""; CURL_EXIT=0
RESP=$(signed_curl "/api/mobile-relay/poll" "$BODY" \
  -X POST -H "Content-Type: application/json" --data-binary "$BODY" 2>&1) || CURL_EXIT=$?

echo "CURL_EXIT=$CURL_EXIT"
if [ -n "$RESP" ]; then
  printf 'RESP_HEAD=%s\n' "$(printf '%s' "$RESP" | head -c 200)"
fi
rm -f "$PART"
