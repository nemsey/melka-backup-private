#!/usr/bin/env bash
# =============================================================================
# audit-melka-relay-apk.sh — گارد اپ اندروید رلهٔ ملکا (PN-031-D · شورا-ن۰۴۳)
# =============================================================================
# وارسی‌های ساختاری تحویل APK + شاخهٔ JSON بوت‌استرپ:
#   ۱) APK واقعی در مسیر عمومی + sha256 منطبق با شاهد apk-build.json (صفر سنتز)
#   ۲) پروژهٔ اندروید کامل (Kotlin): اجزای بقا — Foreground(dataSync) · Boot ·
#      SelfHeal · WakeLock · QR · EncryptedPrefs · UI فارسی RTL
#   ۳) قرارداد یکسان با سرور: HMAC (METHOD\npath\nsha256\n\ts) + امضای دوجهتهٔ
#      RELAY\n… + whitelist https زیردامنه‌های melketabriz.ir (عین اسکریپت Termux)
#   ۴) شاخهٔ bootstrap format=json: همان consumeEnrollCode · پس از ردّها ·
#      خروجی اسکریپت Termux دست‌نخورده
#   ۵) UI افزودنی (نه جایگزین): کارت APK + مسیر Termux پابرجا
#   ۶) بقای تحویل: build دیگر public/deliver را حذف نمی‌کند · keystore+اسکریپت
#      بیلد ماندگارند · محدودیت‌های صادقانه در شاهد ثبت‌اند
# خروجی: exit 1 اگر هر بند شکست بخورد.
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."
FAIL=0
ok()   { echo "  ✓ $1"; }
fail() { echo "  ✗ $1" >&2; FAIL=1; }

APK="public/deliver/pn031d/melka-relay.apk"
WITNESS="download/pn031d/apk-build.json"
KT="melka-relay-android/app/src/main/java/com/melka/relay"
AM="melka-relay-android/app/src/main/AndroidManifest.xml"

echo "— گارد اپ اندروید رلهٔ ملکا (PN-031-D):"

# ۱) APK واقعی + انطباق شاهد
if [ -f "$APK" ]; then
  SIZE=$(stat -c %s "$APK")
  if [ "$SIZE" -gt 1000000 ] && [ "$SIZE" -lt 20000000 ]; then
    ok "APK موجود در مسیر عمومی (~$((SIZE / 1024 / 1024))MB)"
  else
    fail "حجم APK خارج از بازهٔ معقول: $SIZE"
  fi
  if [ -f "$WITNESS" ]; then
    ACTUAL=$(sha256sum "$APK" | awk '{print $1}')
    CLAIMED=$(grep -o '"sha256": "[a-f0-9]*"' "$WITNESS" | head -1 | grep -o '[a-f0-9]\{64\}')
    [ "$ACTUAL" = "$CLAIMED" ] && ok "sha256 شاهد = فایل واقعی (صفر سنتز)" || fail "sha256 شاهد با فایل نمی‌خواند"
    grep -q 'honestLimitations' "$WITNESS" && ok "محدودیت‌های صادقانه در شاهد ثبت است" || fail "شاهد بدون محدودیت‌های صادقانه"
  else
    fail "شاهد apk-build.json غایب"
  fi
else
  fail "APK عمومی غایب — لینک دانلود می‌شکند"
fi

# ۲) ساختار پروژهٔ اندروید
for f in HmacSigner PollClient RelayService BootReceiver SelfHealWorker QrScannerActivity RelayPrefs MainActivity; do
  [ -f "$KT/$f.kt" ] && ok "کلاس $f" || fail "$f.kt غایب"
done
[ -f "$AM" ] && ok "AndroidManifest" || fail "مانیفست غایب"

# ۳) قرارداد امنیتی یکسان با سرور
rg -q 'HmacSHA256' "$KT/HmacSigner.kt" && ok "الگوریتم HMAC-SHA256" || fail "الگوریتم امضا نادرست"
rg -q 'RELAY\\n' "$KT/HmacSigner.kt" && ok "امضای دوجهتهٔ RELAY\\n… (قرارداد سرور)" || fail "امضای دوجهتهٔ آیتم غایب"
rg -q 'requestSignature' "$KT/HmacSigner.kt" && ok "پیام امضای درخواست (METHOD\\npath\\nsha256\\nts)" || fail "پیام امضا نادرست"
rg -q 'constantTimeEquals' "$KT/HmacSigner.kt" && ok "مقایسهٔ زمان-ثابت" || fail "مقایسهٔ زمان-ثابت غایب"
rg -q 'endsWith\("\.melketabriz\.ir"\)' "$KT/PollClient.kt" && ok "whitelist میزبان سمت گوشی" || fail "whitelist گوشی غایب"
rg -q 'u\.protocol != "https"' "$KT/PollClient.kt" && ok "فقط https (بدون HTTP شفاف)" || fail "اجازهٔ http شفاف"
rg -q 'itemSignature' "$KT/RelayService.kt" && rg -q 'constantTimeEquals' "$KT/RelayService.kt" \
  && ok "وارسی امضای سرور پیش از اجرای هر آیتم" || fail "اجرای بدون وارسی امضای سرور"
rg -q 'PARTIAL_WAKE_LOCK' "$KT/RelayService.kt" && ok "WakeLock جزئی" || fail "WakeLock غایب"
rg -q 'EncryptedSharedPreferences' "$KT/RelayPrefs.kt" && ok "ذخیرهٔ رمزنگاری‌شدهٔ راز دستگاه" || fail "راز دستگاه بدون رمزنگاری"

# ۴) اجزای بقا در مانیفست
rg -q 'foregroundServiceType="dataSync"' "$AM" && ok "Foreground Service نوع dataSync" || fail "نوع FGS نادرست"
rg -q 'RECEIVE_BOOT_COMPLETED' "$AM" && ok "مجوز شروع خودکار پس از بوت" || fail "BOOT_COMPLETED غایب"
rg -q 'QUICKBOOT_POWERON' "$AM" && ok "بوت سریع MIUI" || fail "QUICKBOOT غایب"
rg -q 'POST_NOTIFICATIONS' "$AM" && ok "مجوز اعلان" || fail "POST_NOTIFICATIONS غایب"
rg -q 'CAMERA' "$AM" && ok "مجوز دوربین (QR)" || fail "CAMERA غایب"

# ۵) رابط فارسی RTL
rg -q 'رلهٔ ملکا' melka-relay-android/app/src/main/res/values/strings.xml && ok "رشته‌های فارسی" || fail "رشته‌های فارسی غایب"
rg -q 'android:layoutDirection="rtl"' melka-relay-android/app/src/main/res/layout/activity_main.xml && ok "چیدمان RTL" || fail "RTL غایب"
rg -q 'راهنمای بقا در MIUI' melka-relay-android/app/src/main/res/values/strings.xml && ok "راهنمای MIUI درون‌اپ" || fail "راهنمای MIUI غایب"

# ۶) شاخهٔ JSON بوت‌استرپ — همان کد بخشنده، Termux دست‌نخورده
BS="src/app/api/mobile-relay/bootstrap/route.ts"
rg -q 'searchParams\.get\("format"\)' "$BS" && ok "شاخهٔ format=json تعریف شده" || fail "شاخهٔ JSON غایب"
rg -q 'await consumeEnrollCode\(code, ip\)' "$BS" && ok "همان consumeEnrollCode (بدون منطق موازی)" || fail "منطق احراز موازی — خطر"
rg -q 'buildRelayScript' "$BS" && rg -q 'text/x-shellscript' "$BS" && ok "خروجی اسکریپت Termux دست‌نخورده" || fail "مسیر Termux آسیب دیده"
# JSON حتماً پس از ردّهای کد (تلاش ناموفق در JSON هم شمرده می‌شود)
CONSUME=$(grep -n 'await consumeEnrollCode' "$BS" | head -1 | cut -d: -f1)
JSONOUT=$(grep -n 'if (wantJson)' "$BS" | head -1 | cut -d: -f1)
REJECT=$(grep -n 'if (!consumed.ok)' "$BS" | head -1 | cut -d: -f1)
if [ -n "$CONSUME" ] && [ -n "$JSONOUT" ] && [ -n "$REJECT" ] && [ "$REJECT" -lt "$JSONOUT" ]; then
  ok "ردّهای کد (403+reason) پیش از خروجی JSON"
else
  fail "ترتیب ردّ/JSON در bootstrap نادرست"
fi

# ۷) UI — PN-033 (شورا-ن۰۵۴ · ۱۴۰۵/۰۷/۲۶): کارت APK به فرمان مالک از تنظیمات حذف شد (Termux تنها راه)
UI="src/core/tiles/tiles/settings/RelaySetupSection.tsx"
rg -q '/deliver/pn031d/melka-relay\.apk' "$UI" && fail "کارت APK هنوز در UI است — خلاف سند ن۰۵۴" || ok "کارت APK از UI حذف شد (ن۰۵۴)"
rg -q 'تست تونل' "$UI" && rg -q 'راهنمای ۳ خطی' "$UI" && ok "مسیر Termux + تست تونل + راهنمای ۳ خطی پابرجا (ن۰۵۴)" || fail "مسیر Termux حذف شده — خلاف سند ن۰۵۴"

# ۸) بقای تحویل
rg -q 'standalone/public/deliver' package.json && fail "build همچنان public/deliver را حذف می‌کند" || ok "بیلد APK را حذف نمی‌کند (لینک می‌ماند)"
[ -f melka-relay-android/melka-relay.jks ] && ok "keystore امضا ماندگار" || fail "keystore غایب"
[ -f scripts/pn031d/android-build.sh ] && ok "اسکریپت بیلد ماندگار" || fail "اسکریپت بیلد غایب"
[ -f scripts/pn031d/android-setup.sh ] && ok "اسکریپت toolchain ماندگار" || fail "اسکریپت toolchain غایب"

[ "$FAIL" = "0" ] && echo "گارد اپ اندروید رلهٔ ملکا: سبز ✓" || { echo "گارد اپ اندروید رلهٔ ملکا: قرمز ✗" >&2; exit 1; }
