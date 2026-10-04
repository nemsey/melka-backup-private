#!/usr/bin/env bash
# ============================================================
# sim-test.sh — آزمون شبیه‌سازی بازگشت + بازیابی خودکار (Tier 4)
# پرونده: P6548-recovery · BLOCK 4 · ملکا-شورا-۱۴۰۵-۰۳۴
# بازسازی کامل حادثهٔ ۱۳ مهر در مخزن قرنطینه (بدون لمس مخزن زنده):
#   فاز ۱: شبیه‌سازی حادثه (reset به دوران P6530)
#   فاز ۲: تشخیص خودکار (DRY_RUN — انتظار: ROLLBACK)
#   فاز ۳: بازیابی خودکار واقعی (زنجیرهٔ git — انتظار: < ۵ دقیقه)
#   فاز ۴: راستی‌آزمایی پس از بازیابی (انتظار: HEALTHY-EQUAL)
# اجرای هفتگی توصیه‌شده (اقدام پیشگیرانهٔ شورا):
#   bash scripts/recovery-034/sim-test.sh
# ============================================================
set -uo pipefail
LIVE=/home/z/my-project
SIM="$LIVE/scripts/recovery-034/scratch/sim-repo"
CREDS="$LIVE/upload/.mirror/credentials.env"
PKG="$LIVE/upload/.survival/P6547cont-20261003"
T0=$(date +%s)

echo "═══ فاز ۰: ساخت مخزن قرنطینه (شبیه‌ساز) ═══"
rm -rf "$SIM"
git clone --quiet "$LIVE" "$SIM" 2>&1 | head -2 || true
git -C "$SIM" fetch --quiet origin refs/heads/survival/code:refs/heads/survival/code 2>/dev/null || true
git -C "$SIM" checkout -q main 2>/dev/null || true
echo "HEAD سالم شبیه‌ساز: $(git -C "$SIM" rev-parse --short HEAD) — تاریخ: $(git -C "$SIM" log -1 --format=%cd --date=iso)"

echo
echo "═══ فاز ۱: شبیه‌سازی حادثهٔ سوم — بازگشت به 76ed3d4 (دوران P6530) ═══"
git -C "$SIM" reset --hard 76ed3d4 >/dev/null
echo "HEAD پس از حادثهٔ مصنوعی: $(git -C "$SIM" rev-parse --short HEAD) — تاریخ: $(git -C "$SIM" log -1 --format=%cd --date=iso)"

echo
echo "═══ فاز ۲: تشخیص خودکار (DRY_RUN — بدون اقدام) ═══"
REPO_DIR="$SIM" CREDS_FILE="$CREDS" BASE_URL="http://127.0.0.1:9" DRY_RUN=1 \
  bash "$LIVE/scripts/recovery/auto-recovery.sh" check
RC_DETECT=$?
echo "کد خروج تشخیص: $RC_DETECT (انتظار: 2 = ROLLBACK تشخیص داده شد)"

echo
echo "═══ فاز ۳: بازیابی خودکار واقعی (زنجیرهٔ git در قرنطینه) ═══"
T1=$(date +%s)
REPO_DIR="$SIM" CREDS_FILE="$CREDS" BASE_URL="http://127.0.0.1:9" PKG_DIR="$PKG" \
  bash "$LIVE/scripts/recovery/auto-recovery.sh" recover
RC_RECOVER=$?
T2=$(date +%s)
echo "کد خروج بازیابی: $RC_RECOVER · مدت بازیابی: $((T2-T1)) ثانیه (هدف شورا: < ۳۰۰ ثانیه)"

echo
echo "═══ فاز ۴: راستی‌آزمایی پس از بازیابی ═══"
REPO_DIR="$SIM" CREDS_FILE="$CREDS" BASE_URL="http://127.0.0.1:9" \
  bash "$LIVE/scripts/recovery/auto-recovery.sh" check
RC_VERIFY=$?
echo "کد خروج راستی‌آزمایی: $RC_VERIFY (انتظار: 0 = HEALTHY)"

echo
echo "═══ خلاصهٔ آزمون ═══"
TOTAL=$((T2-T0))
echo "زمان کل شبیه‌سازی (ساخت+حادثه+تشخیص+بازیابی): $TOTAL ثانیه"
echo "تشخیص: $([ "$RC_DETECT" = "2" ] && echo PASS || echo FAIL) · بازیابی: $([ "$RC_RECOVER" = "0" ] && echo PASS || echo FAIL) · راستی‌آزمایی: $([ "$RC_VERIFY" = "0" ] && echo PASS || echo FAIL)"
echo "HEAD شبیه‌ساز در پایان: $(git -C "$SIM" rev-parse --short HEAD) (معادل محتوای 48efac4/d79704a از مسیر بستهٔ بقا+آینه)"
if [ "$RC_DETECT" = "2" ] && [ "$RC_RECOVER" = "0" ] && [ "$RC_VERIFY" = "0" ] && [ "$TOTAL" -lt 300 ]; then
  echo "نتیجهٔ نهایی: ✅ آزمون شبیه‌سازی PASS — بازیابی خودکار در کمتر از ۵ دقیقه"
  exit 0
else
  echo "نتیجهٔ نهایی: ❌ FAIL — بازبینی لازم"
  exit 1
fi
