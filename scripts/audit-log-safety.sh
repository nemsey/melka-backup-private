#!/usr/bin/env bash
# =============================================================================
# audit-log-safety.sh — گارد امنیت لاگ (PHASE 2 / P2-05)
# =============================================================================
# وظایف:
#  ۱) صفر console.* در src/ (خارج از ماژول Logger — تنها نقطه خروجی مجاز)
#  ۲) ماژول Logger باید پاک‌ساز تدافعی داشته باشد (sanitizeDetail)
#  ۳) داخل «خودِ فراخوانی لاگ» (تا پایان }});) داده حساس پاس نشود:
#     کلید token/otp/secret/password در جایگاه کلید، یا مقدار خام
#  ۴) شماره موبایل خام (09xxxxxxxxx) داخل فراخوانی لاگ
#
# روش ۳/۴: از خط فراخوانی تا نخستین خاتمه‌گر }}); اسکن می‌شود —
# کدِ بعد از فراخوانی (مثل پارامتر armToken توابع دیگر)به اشتباه گزارش نمی‌شود.
#
# خروجی: exit 1 اگر نقض باشد — در regression-guard.sh (E.7) اجرا می‌شود.
# =============================================================================
set -uo pipefail
cd "$(dirname "$0")/.."

FAIL=0

# ---------- ۱) console.* خارج از Logger ----------
CONSOLE_HITS=$(grep -rnE "console\.(log|error|warn|info|debug)" src/ --include='*.ts' --include='*.tsx' 2>/dev/null | grep -v "^src/lib/logger/" || true)
CONSOLE_COUNT=$(echo -n "$CONSOLE_HITS" | grep -c . || true)

# ---------- ۲) وجود پاک‌ساز ----------
SANITIZER_OK=$(grep -c "function sanitizeDetail" src/lib/logger/index.ts 2>/dev/null || true)

# ---------- ۳/۴) اسکن محدوده فراخوانی لاگ ----------
# برای هر فراخوانی، از خط شروع تا خاتمه‌گر (حداکثر ۱۲ خط) متن فراخوانی جدا می‌شود.
VIOLATIONS=""
SCAN_TEMP=$(mktemp)
grep -rnE "(logEvent|logAuth|logSync|logAgentCall|logRoute|withRouteLog)\(" src/ --include='*.ts' --include='*.tsx' 2>/dev/null | grep -v "^src/lib/logger/" | cut -d: -f1-2 | while IFS= read -r loc; do
  file="${loc%%:*}"
  line="${loc##*:}"
  # استخراج محدوده فراخوانی: تا نخستین خط حاوی }});  یا );  در انتهای آرگومان‌ها
  end=$((line + 11))
  ctx=$(sed -n "${line},${end}p" "$file" 2>/dev/null | sed '/^[[:space:]]*});/q;/^[[:space:]]*);/q')
  # ۳) کلید حساس در جایگاه کلید (حساس به بزرگی — کلیدهای مرکب مجازند)
  if echo "$ctx" | grep -qE "[^A-Za-z](accessToken|refreshToken|armToken|otpCode|otp|password|passwd|secret|tokenEnc|authorization)[[:space:]]*:"; then
    echo "SENSITIVE_KEY|$loc" >> "$SCAN_TEMP"
  fi
  # ۴) شماره موبایل خام داخل فراخوانی
  if echo "$ctx" | grep -qE "09[0-9]{9}"; then
    echo "RAW_MOBILE|$loc" >> "$SCAN_TEMP"
  fi
done || true

if [ -f "$SCAN_TEMP" ]; then
  VIOLATIONS=$(cat "$SCAN_TEMP")
  VIO_COUNT=$(wc -l < "$SCAN_TEMP" | tr -d ' ')
  rm -f "$SCAN_TEMP"
else
  VIO_COUNT=0
fi

echo "================ LOG SAFETY AUDIT (P2-05) ================"
printf "%-52s %s\n" "console.* outside src/lib/logger/:" "$CONSOLE_COUNT"
printf "%-52s %s\n" "defensive sanitizer in logger:" "$SANITIZER_OK  (need >= 1)"
printf "%-52s %s\n" "sensitive keys / raw mobiles in log calls:" "$VIO_COUNT"
echo "==========================================================="

if [ "$CONSOLE_COUNT" -gt 0 ]; then
  echo "FAIL: خروجی پراکنده کنسول — تنها نقطه مجاز src/lib/logger است:"
  echo "$CONSOLE_HITS"
  FAIL=1
fi
if [ "$SANITIZER_OK" -lt 1 ]; then
  echo "FAIL: ماژول Logger پاک‌ساز تدافعی (sanitizeDetail) ندارد."
  FAIL=1
fi
if [ "$VIO_COUNT" -gt 0 ]; then
  echo "FAIL: این فراخوانی‌های لاگ داده حساس دارند:"
  echo "$VIOLATIONS"
  FAIL=1
fi

if [ "$FAIL" -eq 0 ]; then
  echo "PASS: امنیت لاگ رعایت شد."
fi
exit $FAIL
