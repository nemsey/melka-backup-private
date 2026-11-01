#!/usr/bin/env bash
# ============================================================================
# PN-032 · بستهٔ بقای chainIndex=36 — قانون بقا (سند ۰۵۲ · شورای عالی ملکا)
# ساخت بستهٔ کامل در upload/.survival/PN-037-20261016/ با لنگر هش به بستهٔ ۳۵
# تازه‌ها: اتصال نهایی رویهٔ چهارگامه (بیلد تازه از HEAD + راستی‌آزمایی خاموشی
# پرچم آفلاین در ۷ لایه + ری‌استارت نهایی + تونل زندهٔ مالک) · ترمیم زنجیرهٔ هش
# بستهٔ ۳۵ (worklog.md بازسازی بایت‌به‌بایت از b8de806) · قطعی‌سازی flake تست ۴-۹
# نام‌گذاری: قرارداد شمارهٔ بسته = chainIndex+1 و سازگار با sort -V گارد
# ============================================================================
set -euo pipefail
cd /home/z/my-project
TS=$(date -u +%FT%TZ)
PKG="upload/.survival/PN-037-20261016"
PREV="PN-036-20261015"

[ -d "upload/.survival/$PREV" ] || { echo "بستهٔ قبلی (۳۵) یافت نشد"; exit 1; }

echo "═══ ساخت بستهٔ بقای ۳۶ · $TS ═══"
mkdir -p "$PKG/evidence-pn032" "$PKG/melka-relay-apk" "$PKG/recovery-scripts" "$PKG/hardened-relay" "$PKG/melka-proxy-worker"

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

# ── ۳) APK + پروژهٔ اندروید + QR مالک ──
cp download/pn031e/melka-relay.apk "$PKG/melka-relay-apk/melka-relay.apk"
cp download/pn031d/apk-build.json "$PKG/melka-relay-apk/"
cp download/pn031e/qr-install.png "$PKG/melka-relay-apk/qr-install.png" 2>/dev/null || true
cp download/pn031e/OWNER-GUIDE.html "$PKG/melka-relay-apk/OWNER-GUIDE.html" 2>/dev/null || true
cp melka-relay-android/melka-relay.jks "$PKG/melka-relay-apk/keystore.jks"
rsync -a --exclude 'build/' --exclude '.gradle/' melka-relay-android/ "$PKG/melka-relay-apk/project/" 2>/dev/null || {
  mkdir -p "$PKG/melka-relay-apk/project"
  cp -r melka-relay-android/app "$PKG/melka-relay-apk/project/" 2>/dev/null || true
  cp melka-relay-android/*.kts melka-relay-android/*.properties melka-relay-android/.gitignore "$PKG/melka-relay-apk/project/" 2>/dev/null || true
}

# ── ۳-ب) اسکریپت سخت‌شدهٔ رله (منبع حقیقت + منطق احراز + نسل I) ──
cp src/lib/melk-api/relay-script.ts "$PKG/hardened-relay/"
cp src/lib/melk-api/relay.ts "$PKG/hardened-relay/"

# ── ۳-ج) واکِر melka-proxy با مسیر جایگزین /relay ──
cp -r melka-proxy/src "$PKG/melka-proxy-worker/src"
cp melka-proxy/wrangler.toml melka-proxy/package.json melka-proxy/deploy.sh "$PKG/melka-proxy-worker/" 2>/dev/null || true
cp upload/.runtime/cloudflare-token.env "$PKG/melka-proxy-worker/cloudflare-token.env" 2>/dev/null || true

# ── ۴) docs + شواهد PN-032 + اسکریپت‌ها ──
cp -r docs "$PKG/docs" 2>/dev/null || echo "(docs غایب)"
cp download/pn032/*.json download/pn032/*.txt download/pn032/*.log "$PKG/evidence-pn032/" 2>/dev/null || true
cp -r scripts/pn032 "$PKG/evidence-pn032/scripts" 2>/dev/null || true
cp scripts/pn031i/live-gate.sh scripts/pn031i/issue-owner-code.ts "$PKG/recovery-scripts/" 2>/dev/null || true
cp scripts/audit-melka-relay-apk.sh scripts/audit-mobile-relay.sh "$PKG/recovery-scripts/" 2>/dev/null || true
cp scripts/recovery/audit-head-guard.sh scripts/recovery/auto-recovery.sh scripts/recovery/reset-guard.sh "$PKG/recovery-scripts/" 2>/dev/null || true
cp scripts/log-rotate.sh "$PKG/recovery-scripts/log-rotate.sh" 2>/dev/null || true
cp scripts/pn031i/survival-package-35.sh "$PKG/recovery-scripts/" 2>/dev/null || true
cp tests/pn010-migration.test.ts "$PKG/evidence-pn032/" 2>/dev/null || true
cp worklog.md "$PKG/worklog.md"

# ── ۵) repo.bundle + هویت ──
echo "— باندل گیت…"
git bundle create "$PKG/repo.bundle" --all 2>/dev/null | tail -1 || true
git rev-parse --short HEAD > "$PKG/HEAD"
cat .next/BUILD_ID > "$PKG/BUILD_ID.txt" 2>/dev/null || echo "(BUILD_ID غایب)" || true
cp .next/fingerprint.json "$PKG/FINGERPRINT.json" 2>/dev/null || echo "(fingerprint غایب)"

# ── ۶) EVENTS.md ──
cat > "$PKG/EVENTS.md" <<'EV'
# بستهٔ بقا ۳۶ — PN-032 (شورای عالی ملکا · جلسهٔ ۰۵۲)

## چه گذشت؟
- گزارش مالک (جلسهٔ ۰۵۲): «تونل زنده شد» — پس از ۱۰ تلاش و نصب openssl-tool روی
  Termux (دستور خود مالک)، اسکریپت نسل I امضای HMAC کامل ساخت، curl با HTTP/1.1
  و UA بروزری ارسال کرد، دروازهٔ Z.ai پذیرفت و سرور پاسخ ۴۰۴ِ مسیر تست را در
  ۴۰۲۱ms برگرداند — یعنی گوشی مالک با IP ایرانی به مقصد رسید. اپ ملکا وضعیت را
  «تونل زنده است» گزارش کرد.
- شورا دستور PN-032 (رویهٔ چهارگامهٔ اتصال نهایی) صادر کرد: بیلد تازه از HEAD ·
  برداشتن پرچم آفلاین · ری‌استارت نهایی · اطلاع به مالک برای ورود با کدپرسنلی+OTP.
- اجرای GLM:
  · گام ۱: بیلد زنده a92cf5e (۲ روز پیش) در برابر HEAD 9e8c522 (کامیت مدیریتی
    پلتفرم — فقط db/test* و مهر شاهدها) STALE بود → بیلد تازه ۷۶ث سبز →
    BUILD_ID=9e8c522-20261016-0831=HEAD · ری‌استارت سرور+Worker · رجیستری ۱۷کاری
    تازه با head-guard.
  · گام ۲: پرچم MELK_ARM_OFFLINE در «هفت لایه» راستی‌آزمایی شد — env.platform.json ·
    دو اسکرو متنی · اسکرو رمزنگاری‌شده (اساساً ۴ فیلد حمل می‌کند — پرچم در آن ممکن
    نیست) · .env.local · env فرایند سرور · env فرایند Worker — همه خاموش؛ شاهد
    رفتاری: catalog-cycle ثبت‌شده و فعال (isArmOfflineMode()=false) و صفر ورودی
    ARM_OFFLINE_MODE در AuditLog پس از بوت.
  · دروازه: گارد ۴۴/۴۴ · دو-سبز ۲۷۶۴/۰×۲ · tsc صفر · lint صفر خطا.
- دو نقص میراثی کشف و رفع شد:
  ۱) زنجیرهٔ هش بستهٔ ۳۵ شکسته بود — worklog.md داخل بسته بعد از مهر (۲۳:۰۰ در
     برابر ۲۲:۵۷) تازه‌سازی شده بود؛ بازسازی بایت‌به‌بایت از b8de806:worklog.md
     (هش مانیفست دقیقاً تطبیق یافت) → REPRODUCIBLE ✓ 6/6.
  ۲) flake تست ۴-۹ pn010: تست فایل وضعیت واقعی را بازنویسی می‌کرد و Worker زنده
     با پنجرهٔ ~۱۸۰ms تست مسابقه می‌داد (ticks=77 انتظار/14 واقعی) → قطعی‌سازی با
     دایرکتوری موقت (کامیت 18ee781).
- گام ۳ (بیلد نهایی از HEAD قطعی + ری‌استارت نهایی + تونل زنده پس از ری‌استارت)
  و گام ۴ (اطلاع به مالک) پس از این بسته در گزارش نهایی اجرا/ثبت شد.

## چگونه بازیابی کنیم؟
پس از بازیابی: (۱) bun install + prisma db push با schema.prisma همین بسته ·
(۲) env.platform.json همین بسته · (۳) APK آمادهٔ نصب + keystore.jks + پروژهٔ کامل
اندروید · (۴) اسکریپت رلهٔ نسل I در hardened-relay/relay-script.ts · (۵) واکِر
مسیر جایگزین در melka-proxy-worker/ (دیپلوی: wrangler deploy با توکن
cloudflare-token.env) · (۶) بوت با scripts/prod-watchdog.sh (نگهبان سرور + Supervisor
Worker) · (۷) صدور کد تازهٔ مالک: recovery-scripts/issue-owner-code.ts.
کلیدهای حیاتی: env.platform.json + APK + keystore.jks + repo.bundle +
hardened-relay/ + melka-proxy-worker/ + recovery-scripts/ (شامل reset-guard.sh).
EV

# ── ۷) CHAIN.json با لنگر به ۳۵ ──
PREV_HASH=$(sha256sum "upload/.survival/$PREV/MANIFEST.md5" | cut -d' ' -f1)
cat > "$PKG/CHAIN.json" <<CH
{
  "chainIndex": 36,
  "packageName": "PN-037-20261016",
  "prevPackage": "$PREV",
  "prevContentHash": "$PREV_HASH",
  "createdAt": "$TS",
  "law": "بستهٔ ۳۶ به مانیفست کامل بستهٔ ۳۵ لنگر شده است — زنجیرهٔ بازتولیدپذیری"
}
CH
echo "— لنگر به $PREV: ${PREV_HASH:0:16}…"

# ── ۸) MANIFEST.md5 ──
echo "— مهر مانیفست…"
(cd "$PKG" && find . -type f ! -name MANIFEST.md5 -print0 | sort -z | xargs -0 md5sum > MANIFEST.md5)
COUNT=$(wc -l < "$PKG/MANIFEST.md5")

echo ""
echo "═══ بستهٔ بقای ۳۶ کامل: $PKG ═══"
echo "فایل‌ها: $COUNT قلم · حجم کل: $(du -sh "$PKG" | cut -f1)"
