#!/usr/bin/env bash
# ============================================================================
# PN-031-D · بستهٔ بقای chainIndex=32 — قانون بقا (سند ۰۴۳ · PN-031-D)
# ساخت بستهٔ کامل در upload/.survival/PN-033-20261013/ با لنگر هش به بستهٔ ۳۱
# تازه‌ها: APK امضاشده + پروژهٔ کامل اندروید + شاخهٔ JSON بوت‌استرپ + شواهد فاز ۱
# نام‌گذاری: قرارداد شمارهٔ بسته = chainIndex+1 و سازگار با sort -V گارد
# ============================================================================
set -euo pipefail
cd /home/z/my-project
TS=$(date -u +%FT%TZ)
PKG="upload/.survival/PN-033-20261013"
PREV="PN-032-20261013"

[ -d "upload/.survival/$PREV" ] || { echo "بستهٔ قبلی (۳۱) یافت نشد"; exit 1; }

echo "═══ ساخت بستهٔ بقای ۳۲ · $TS ═══"
mkdir -p "$PKG/evidence-pn031d" "$PKG/melka-relay-apk" "$PKG/recovery-scripts"

# ── ۱) فایل‌های پایه ──
cp AGENTS.md "$PKG/" 2>/dev/null || echo "(AGENTS.md غایب — رد شد)"
cp bun.lock package.json env.platform.json prisma/schema.prisma "$PKG/"
mkdir -p "$PKG/prisma"
cp prisma/schema.prisma "$PKG/prisma/"
printf 'DATABASE_URL=file:/home/z/my-project/db/custom.db\n' > "$PKG/env.txt"

# ── ۲) پایگاه داده (بکاپ گرم VACUUM INTO) ──
echo "— بکاپ گرم پایگاه داده…"
python3 - "$PKG" <<'PYEOF'
import sqlite3, hashlib, os, sys
pkg = sys.argv[1]
db = sqlite3.connect('db/custom.db')
db.execute("VACUUM INTO ?", (f"{pkg}/custom.db",))
db.close()
h = hashlib.md5(open(f"{pkg}/custom.db", "rb").read()).hexdigest()
open(f"{pkg}/custom.db.md5", "w").write(f"{h}  custom.db\n")
n = sqlite3.connect(f"{pkg}/custom.db").execute("PRAGMA integrity_check").fetchone()[0]
sz = os.path.getsize(f"{pkg}/custom.db")
print(f"  custom.db · md5={h[:12]}… · integrity={n} · {sz/1024/1024:.1f}MB")
PYEOF

# ── ۳) APK + پروژهٔ اندروید (تازه‌های این بسته) ──
cp public/deliver/pn031d/melka-relay.apk "$PKG/melka-relay-apk/melka-relay.apk"
cp download/pn031d/apk-build.json "$PKG/melka-relay-apk/"
cp download/pn031d/qr-apk.png "$PKG/melka-relay-apk/qr-apk.png"
cp download/pn031d/OWNER-GUIDE.html "$PKG/melka-relay-apk/"
cp melka-relay-android/melka-relay.jks "$PKG/melka-relay-apk/keystore.jks"
rsync -a --exclude 'build/' --exclude '.gradle/' melka-relay-android/ "$PKG/melka-relay-apk/project/" 2>/dev/null || {
  mkdir -p "$PKG/melka-relay-apk/project"
  cp -r melka-relay-android/app "$PKG/melka-relay-apk/project/" 2>/dev/null || true
  cp melka-relay-android/*.kts melka-relay-android/*.properties melka-relay-android/.gitignore "$PKG/melka-relay-apk/project/" 2>/dev/null || true
}

# ── ۴) docs + شواهد + اسکریپت‌ها ──
cp -r docs "$PKG/docs" 2>/dev/null || echo "(docs غایب)"
cp download/pn031d/*.json download/pn031d/*.md download/pn031d/*.txt download/pn031d/SHA256SUMS "$PKG/evidence-pn031d/" 2>/dev/null || true
cp -r download/pn031d/screens "$PKG/evidence-pn031d/screens" 2>/dev/null || true
cp -r scripts/pn031d "$PKG/evidence-pn031d/scripts" 2>/dev/null || true
cp scripts/audit-melka-relay-apk.sh scripts/audit-mobile-relay.sh "$PKG/recovery-scripts/" 2>/dev/null || true
cp scripts/recovery/audit-head-guard.sh scripts/recovery/auto-recovery.sh scripts/recovery/reset-guard.sh "$PKG/recovery-scripts/" 2>/dev/null || true
cp worklog.md "$PKG/worklog.md"

# ── ۵) repo.bundle + هویت ──
echo "— باندل گیت…"
git bundle create "$PKG/repo.bundle" --all 2>/dev/null | tail -1 || true
git rev-parse --short HEAD > "$PKG/HEAD"
cat .next/BUILD_ID > "$PKG/BUILD_ID.txt" 2>/dev/null || echo "(BUILD_ID غایب)" || true
cp .next/fingerprint.json "$PKG/FINGERPRINT.json" 2>/dev/null || echo "(fingerprint غایب)"

# ── ۶) EVENTS.md ──
cat > "$PKG/EVENTS.md" <<'EV'
# بستهٔ بقا ۳۲ — PN-031-D (شورای عالی ملکا · جلسهٔ فوق‌العاده ۰۴۳)

## چه گذشت؟
- PN-032 (شورای ۰۴۴): دو راهکار موازی — فاز ب (کشف ۳۰+ مسیر پنهان با چرخش نامرئی)
  توسط GLM رد شد: (۱) اصولی: ابزار دور زدن دفاع شخص ثالث با فریب (جعل هدر/UA) ساخته
  نمی‌شود؛ (۲) فنی: بلاک در لایهٔ TCP جغرافیایی است — پورت/SNI/هدر اثر ندارد.
- PN-031-D (شورای ۰۴۳ · همین بسته): نسخهٔ پاک‌شدهٔ همان دستور — کشف مسیرهای رسمی
  (فقط GET · بدون جعل · بدون endpoint بدون احراز) + اپ اندروید + تنظیمات.
- فاز ۱ با کنترل مثبت اجرا شد: ۰/۱۶ پورت باز · همهٔ دامنه‌ها → تک-IP 46.100.93.175 ·
  رابط عمومی APU هم اکنون بسته شد (در P6546 باز بود — سد سخت‌تر شده) · نتیجه:
  هیچ مسیر جایگزینی از سرور خارج ایران وجود ندارد؛ مسیر واقعی = خروجی ایرانی یا مجوز.
- فاز ۲: اپ اندروید «رلهٔ ملکا» ۱٫۰٫۰ واقعاً ساخته شد — toolchain کامل (Azul JDK17 ·
  build-tools 34 · Gradle 8.9) در سندباکس نصب · پروژهٔ Kotlin کامل (Foreground dataSync ·
  BootReceiver · SelfHealWorker · WakeLock · ZXing QR · EncryptedSharedPreferences ·
  UI فارسی RTL) · بیلد موفق · امضای v2 با keystore محلی · APK ۵٫۳۳MB.
- شاخهٔ format=json روی bootstrap (همان consumeEnrollCode — کد بخشنده پابرجا) +
  تست زندهٔ ۴گانه از URL عمومی PASS (راز دستگاه با کد معتبر · 403 دقیق کد جعلی ·
  دانلود APK با sha256 منطبق · health).
- فاز ۳ افزودنی: کارت «اپ اندروید ملکا» در تنظیمات + QR دانلود (قانون ۱۴) — حذف
  بخش‌های قدیمی عمداً تا اولین تست تونل سبز از اپ به تعویق افتاد (جلوگیری از یتیم‌شدن
  تنها مسیر کارکرده — درس PN-031).
- اصلاح build: public/deliver دیگر از خروجی بیلد حذف نمی‌شود (لینک APK پایدار).
- دو-سبز ۲۶۹۳/۰ ×۲ (رکورد) · tsc صفر · lint صفر خطا · گاردها: تازه ۴۰/۴۰ + موبایل‌رله سبز.
- محدودیت صادقانه: APK روی گوشی واقعی تست نشده (بی‌دستگاه) — حلقهٔ آخر = نصب مالک.

## بازیابی
مثل بسته‌های قبلی — زنجیرهٔ هش: لنگر این بسته به بستهٔ ۳۱ (PN-032-20261013).
Pس از بازیابی: (۱) bun install + prisma db push با schema.prisma همین بسته ·
(۲) env.platform.json همین بسته · (۳) برای بازسازی APK: melka-relay-apk/project +
scripts/pn031d/android-setup.sh + android-build.sh (keystore در melka-relay-apk/) ·
(۴) APK آمادهٔ نصب در melka-relay-apk/melka-relay.apk (sha256 در apk-build.json).
کلیدهای حیاتی: env.platform.json + APK + keystore.jks + repo.bundle.
EV

# ── ۷) CHAIN.json با لنگر به ۳۱ ──
PREV_HASH=$(sha256sum "upload/.survival/$PREV/MANIFEST.md5" | cut -d' ' -f1)
cat > "$PKG/CHAIN.json" <<CH
{
  "chainIndex": 32,
  "packageName": "PN-033-20261013",
  "prevPackage": "$PREV",
  "prevContentHash": "$PREV_HASH",
  "createdAt": "$TS",
  "law": "بستهٔ ۳۲ به مانیفست کامل بستهٔ ۳۱ لنگر شده است — زنجیرهٔ بازتولیدپذیری"
}
CH
echo "— لنگر به $PREV: ${PREV_HASH:0:16}…"

# ── ۸) MANIFEST.md5 ──
echo "— مهر مانیفست…"
(cd "$PKG" && find . -type f ! -name MANIFEST.md5 -print0 | sort -z | xargs -0 md5sum > MANIFEST.md5)
COUNT=$(wc -l < "$PKG/MANIFEST.md5")

echo ""
echo "═══ بستهٔ بقای ۳۲ کامل: $PKG ═══"
echo "فایل‌ها: $COUNT قلم · حجم کل: $(du -sh "$PKG" | cut -f1)"
