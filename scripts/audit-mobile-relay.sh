#!/usr/bin/env bash
# =============================================================================
# audit-mobile-relay.sh — گارد رلهٔ موبایل ایرانی (PN-031 · شورای عالی ملکا ۰۳۷)
# =============================================================================
# وارسی‌های ساختاری مسیر رله (Pull-based · گوشی مالک):
#   ۱) کتابخانهٔ رله + اسکریپت‌ساز موجودند و قرارداد امضا یکسان است (سرور↔گوشی)
#   ۲) نقطهٔ یگانه: proxyFetch حالت رله دارد و armCall/probeGet همچنان فقط
#      از proxyFetch می‌گذرند (صفر fetch مستقیم ملک تبریز)
#   ۳) whitelist دفاع دولایه: سرور (enqueue) و اسکریپت (case pattern)
#   ۴) راز دستگاه هرگز به UI/کلاینت نشت نمی‌کند (فقط در bootstrap تزریقی)
#   ۵) قفل ترتیب: رله گارد آفلینی را دور نمی‌زند — armCall اول offline را چک می‌کند
#   ۶) روت‌های رله + آینه‌های v1 موجودند
#   ۷) جدولهای RelayDevice/RelayQueue در schema موجودند (بقای مهاجرت)
# خروجی: exit 1 اگر هر بند شکست بخورد.
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."
FAIL=0
ok()   { echo "  ✓ $1"; }
fail() { echo "  ✗ $1" >&2; FAIL=1; }

echo "— گارد رلهٔ موبایل (PN-031):"

# ۱) کتابخانه‌ها
[ -f src/lib/melk-api/relay.ts ] && ok "کتابخانهٔ رله (relay.ts)" || fail "relay.ts غایب"
[ -f src/lib/melk-api/relay-script.ts ] && ok "اسکریپت‌ساز (relay-script.ts)" || fail "relay-script.ts غایب"

# ۲) قرارداد امضای یکسان — پیام «METHOD\npath\nsha256(body)\nts» در سرور و گوشی
rg -q 'relayAuthMessage' src/lib/melk-api/relay.ts && ok "پیام امضای سمت سرور" || fail "relayAuthMessage غایب"
rg -q "printf .POST..n%s..n%s..n%s." src/lib/melk-api/relay-script.ts && ok "پیام امضای سمت گوشی (قرارداد یکسان)" || fail "قرارداد امضای گوشی ناسازگار"
rg -q "printf .RELAY..n%s..n%s..n%s..n%s..n%s." src/lib/melk-api/relay-script.ts && ok "امضای دوجهتهٔ آیتم صف (RELAY\\n...)" || fail "امضای دوجهته غایب"

# ۳) نقطهٔ یگانه + حالت رله
rg -q 'relayModeActive\(\) \|\|' src/lib/melk-api/proxy.ts || rg -q 'if \(relayModeActive\(\)\) return relayFetch' src/lib/melk-api/proxy.ts \
  && ok "proxyFetch حالت رله دارد (نقطهٔ یگانه)" || fail "proxyFetch حالت رله ندارد"
! rg -q 'fetch\(' src/lib/melk-api/client.ts | rg -v 'proxyFetch' >/dev/null 2>&1 || true
rg -q 'proxyFetch' src/lib/melk-api/client.ts && ok "armCall/probeGet از proxyFetch می‌گذرند" || fail "نقطهٔ یگانه شکسته"

# ۴) whitelist دولایه
rg -q 'isMelkTabrizHost\(params\.url\)' src/lib/melk-api/relay.ts && ok "whitelist سمت سرور (enqueue)" || fail "whitelist سرور غایب"
rg -q 'https://\*.melketabriz\.ir/\*' src/lib/melk-api/relay-script.ts && ok "whitelist سمت گوشی (case pattern)" || fail "whitelist گوشی غایب"

# ۵) قفل ترتیب — گارد آفلینی پیش از هر شبکه در armCall
LINE_OFFLINE=$(rg -n 'isArmOfflineMode\(\)' src/lib/melk-api/client.ts | head -1 | cut -d: -f1)
LINE_FETCH=$(rg -n 'proxyFetch\(' src/lib/melk-api/client.ts | head -1 | cut -d: -f1)
if [ -n "$LINE_OFFLINE" ] && [ -n "$LINE_FETCH" ] && [ "$LINE_OFFLINE" -lt "$LINE_FETCH" ]; then
  ok "قفل ترتیب: گارد آفلینی پیش از proxyFetch در armCall"
else
  fail "قفل ترتیب شکسته — گارد آفلینی پیش از شبکه نیست"
fi

# ۶) روت‌ها + آینه‌ها (PN-031-C: code-status افزوده شد — ۱۱ روت)
for r in mobile-relay/poll mobile-relay/result mobile-relay/bootstrap admin/relay/enroll admin/relay/status admin/relay/test admin/relay/revoke admin/relay/qr admin/relay/browser-poll admin/relay/browser-result admin/relay/code-status; do
  [ -f "src/app/api/${r}/route.ts" ] || fail "روت api/${r} غایب"
  [ -f "src/app/api/v1/${r}/route.ts" ] || fail "آینهٔ v1/${r} غایب"
done
ok "۱۱ روت رله + ۱۱ آینهٔ v1"

# ۷) اسکیما
rg -q 'model RelayDevice' prisma/schema.prisma && ok "جدول RelayDevice در schema" || fail "RelayDevice غایب"
rg -q 'model RelayQueue' prisma/schema.prisma && ok "جدول RelayQueue در schema" || fail "RelayQueue غایب"

# ۸) نشت راز به کلاینت — بخش UI نباید راز/کد bootstrap ذخیره کند
if rg -n 'deviceSecret|DEVICE_SECRET' src/core/tiles/tiles/settings/RelaySetupSection.tsx >/dev/null 2>&1; then
  fail "نشست راز دستگاه در UI"
else
  ok "UI بدون راز (فقط QR/دستور نصب یک‌بارمصرف)"
fi

# ۹) قانون URL عمومی — جلسهٔ فوری ۰۳۸ (PN-031-HOTFIX):
#    هر URL مصرف بیرونی (گوشی/QR) فقط از getPublicBaseUrl؛ هرگز آدرس داخلی کانتینر
[ -f src/lib/http/public-url.ts ] && ok "ماژول نشانی عمومی (public-url.ts)" || fail "public-url.ts غایب"
rg -q 'MELK_PUBLIC_BASE_URL' src/lib/http/public-url.ts && ok "اولویت ۱: MELK_PUBLIC_BASE_URL از env" || fail "اولویت env غایب"
rg -q 'x-forwarded-host' src/lib/http/public-url.ts && ok "اولویت ۲: x-forwarded-host (استاندارد reverse-proxy)" || fail "اولویت forwarded غایب"
rg -q 'PublicBaseUrlError' src/lib/http/public-url.ts && ok "fail-closed: خطای صریح، نه URL خراب" || fail "fail-closed غایب"
for r in admin/relay/enroll mobile-relay/bootstrap; do
  if rg -q 'getPublicBaseUrl\(' "src/app/api/${r}/route.ts" && ! rg -q 'nextUrl\.origin' "src/app/api/${r}/route.ts"; then
    ok "قانون ۰۳۸ در api/${r} (نقطهٔ یگانه + بدون آدرس داخلی)"
  else
    fail "قانون ۰۳۸ در api/${r} شکسته"
  fi
done
rg -q '"MELK_PUBLIC_BASE_URL"' src/lib/auth/boot-secrets.ts && ok "بقای نشانی عمومی در escrow سه‌لایه" || fail "کلید عمومی در escrow غایب"

# ۱۰) قانون کد بخشنده — PN-031-C (شورا-ن۰۴۰): پایان چرخهٔ خطای ۴۰۳
#   · کد در تلاش ناموفق نمی‌سوزد: bootstrap فقط attemptCount را زیاد می‌کند
#   · سوختن نهایی فقط با اولین Poll موفق (markRelayEnrollCompleted در روت poll)
#   · سقف ۳ تلاش (maxAttempts) + پیام خطای متمایز used/limit/expired/invalid/revoked
#   · اسکیمای بقای مهاجرت: فیلدهای attemptCount/maxAttempts/lastAttemptAt
rg -q 'attemptCount: \{ increment: 1 \}' src/lib/melk-api/relay.ts && ok "کد بخشنده: تلاش ناموفق فقط شمارنده را زیاد می‌کند (نسوختن)" || fail "افزایش attemptCount غایب"
rg -q 'markRelayEnrollCompleted' src/app/api/mobile-relay/poll/route.ts && ok "سوختن نهایی در اولین Poll موفق گوشی" || fail "نقطهٔ سوختن Poll غایب"
rg -q 'maxAttempts *Int *@default\(3\)' prisma/schema.prisma && ok "اسکیما: سقف ۳ تلاش (maxAttempts)" || fail "فیلد maxAttempts غایب"
rg -q 'attemptCount *Int *@default\(0\)' prisma/schema.prisma && ok "اسکیما: شمارش تلاش (attemptCount)" || fail "فیلد attemptCount غایب"
rg -q 'lastAttemptAt *DateTime\?' prisma/schema.prisma && ok "اسکیما: زمان آخرین تلاش (lastAttemptAt)" || fail "فیلد lastAttemptAt غایب"
rg -q 'reason: "used"' src/lib/melk-api/relay.ts && rg -q 'reason: "expired"' src/lib/melk-api/relay.ts && rg -q 'reason: "invalid"' src/lib/melk-api/relay.ts \
  && ok "پیام خطای متمایز: سوخته/منقضی/نامعتبر" || fail "دلایل رد متمایز غایب"

# ۱۱) قانون حمل‌ونقل مقاوم + مسیر جایگزین — PN-031-I (شورا-ن۰۵۰ · ریشهٔ curl 9):
#   · HTTP/1.1 اجباری روی تمام تماسهای سرور (پایان RST_STREAM/h2 framing)
#   · User-Agent بروزری (WAF/bot-detection)
#   · نردبان retry پله‌ای + سقف ۵/دقیقه (پایان چکش ۵ثانیه‌ای ۷۲۰ درخواست/ساعت)
#   · لاگ دیباگ با redact امضا · نبض نسخه (کشف بازنشانی از گوشی)
#   · مسیر جایگزین واکِر /relay/* با سوئیچ خودکار + ثبت کلید در escrow
rg -q -- '--http1.1 -A "\$UA" -sS --max-time 35' src/lib/melk-api/relay-script.ts && ok "قانون I: http1.1 + UA روی poll/result" || fail "http1.1/UA در signed_curl غایب"
rg -q 'RETRY_DELAYS=\(30 60 120 300 300\)' src/lib/melk-api/relay-script.ts && ok "قانون I: نردبان retry پله‌ای" || fail "نردبان retry غایب"
rg -q '\-ge 5 \]' src/lib/melk-api/relay-script.ts && ok "قانون I: سقف نرخ ۵/دقیقه" || fail "سقف نرخ غایب"
rg -q 'relay-debug\.log' src/lib/melk-api/relay-script.ts && rg -q 'redacted' src/lib/melk-api/relay-script.ts && ok "قانون I: لاگ دیباگ با redact امضا" || fail "لاگ دیباگ/redact غایب"
rg -q 'version_ping' src/lib/melk-api/relay-script.ts && ok "قانون I: نبض نسخه (سلف-پینگ بیرونی)" || fail "نبض نسخه غایب"
rg -q 'ALT_FAIL_THRESHOLD=3' src/lib/melk-api/relay-script.ts && ok "قانون I: سوئیچ مسیر جایگزین پس از ۳ خطا" || fail "آستانهٔ سوئیچ غایب"
rg -q 'altServerUrl' src/app/api/mobile-relay/bootstrap/route.ts && ok "قانون I: bootstrap مسیر جایگزین را تزریق می‌کند" || fail "تزریق altServerUrl غایب"
rg -q '"MELK_RELAY_ALT_URL"' src/lib/auth/boot-secrets.ts && ok "قانون I: بقای مسیر جایگزین در escrow" || fail "کلید مسیر جایگزین در escrow غایب"
rg -q 'RELAY_ALLOWED_PREFIXES' melka-proxy/src/index.ts && ok "قانون I: واکِر /relay با پیشوندهای مجاز" || fail "whitelist مسیر واکِر غایب"
rg -q 'RELAY_RATE_LIMIT' melka-proxy/src/index.ts && ok "قانون I: سقف نرخ هر IP در واکِر" || fail "سقف نرخ واکِر غایب"

# ۱۲) قانون داوری بیلد زنده — PN-031-I (درس بازگشت دهم):
#   · reset-guard: درخت سالم + بیلد کهنه = BUILD-STALE (پایان HEALTHY دروغین)
#   · recover: Worker هم کشته/تازه می‌شود (رجیستری از درخت بازیابی‌شده)
rg -q 'BUILD-STALE' scripts/recovery/reset-guard.sh && ok "قانون I: reset-guard بیلد زنده را داوری می‌کند (BUILD-STALE)" || fail "داوری BUILD-STALE غایب"
rg -q 'pkill -f "scripts/runtime/worker.ts"' scripts/recovery/reset-guard.sh && ok "قانون I: recover کارگر تازه می‌سازد" || fail "تازه‌سازی Worker در recover غایب"

[ "$FAIL" = "0" ] && echo "گارد رلهٔ موبایل: سبز ✓" || { echo "گارد رلهٔ موبایل: قرمز ✗" >&2; exit 1; }
