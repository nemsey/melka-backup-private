#!/usr/bin/env bash
# ============================================================================
# PN-031-G · بستهٔ بقای chainIndex=34 — قانون بقا (سند ۰۴۷ · شورای عالی ملکا)
# ساخت بستهٔ کامل در upload/.survival/PN-035-20261014/ با لنگر هش به بستهٔ ۳۳
# تازه‌ها: رفع نهایی «missing auth headers» (پیش‌پرواز امضا + تشخیص نام هدر)
# + شواهد دروازهٔ زندهٔ PASS + خروجی خام curl (درس ۸ سند ۰۴۷) + تست ۱۷گانهٔ
# اجرای واقعی bash (نه شبیه‌سازی)
# نام‌گذاری: قرارداد شمارهٔ بسته = chainIndex+1 و سازگار با sort -V گارد
# ============================================================================
set -euo pipefail
cd /home/z/my-project
TS=$(date -u +%FT%TZ)
PKG="upload/.survival/PN-035-20261014"
PREV="PN-034-20261014"

[ -d "upload/.survival/$PREV" ] || { echo "بستهٔ قبلی (۳۳) یافت نشد"; exit 1; }

echo "═══ ساخت بستهٔ بقای ۳۴ · $TS ═══"
mkdir -p "$PKG/evidence-pn031g" "$PKG/melka-relay-apk" "$PKG/recovery-scripts" "$PKG/hardened-relay"

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

# ── ۳-ب) اسکریپت سخت‌شدهٔ رله (منبع حقیقت + منطق احراز + پیش‌پرواز PN-031-G) ──
cp src/lib/melk-api/relay-script.ts "$PKG/hardened-relay/"
cp src/lib/melk-api/relay.ts "$PKG/hardened-relay/"

# ── ۴) docs + شواهد PN-031-G + اسکریپت‌ها ──
cp -r docs "$PKG/docs" 2>/dev/null || echo "(docs غایب)"
cp download/pn031g/*.json download/pn031g/*.log "$PKG/evidence-pn031g/" 2>/dev/null || true
cp -r download/pn031g/raw-curl "$PKG/evidence-pn031g/raw-curl" 2>/dev/null || true
cp -r scripts/pn031g "$PKG/evidence-pn031g/scripts" 2>/dev/null || true
cp tests/pn031g-header-guard.test.ts "$PKG/evidence-pn031g/" 2>/dev/null || true
cp scripts/audit-melka-relay-apk.sh scripts/audit-mobile-relay.sh "$PKG/recovery-scripts/" 2>/dev/null || true
cp scripts/recovery/audit-head-guard.sh scripts/recovery/auto-recovery.sh scripts/recovery/reset-guard.sh "$PKG/recovery-scripts/" 2>/dev/null || true
cp scripts/pn031e/survival-package-33.sh "$PKG/recovery-scripts/" 2>/dev/null || true
cp worklog.md "$PKG/worklog.md"

# ── ۵) repo.bundle + هویت ──
echo "— باندل گیت…"
git bundle create "$PKG/repo.bundle" --all 2>/dev/null | tail -1 || true
git rev-parse --short HEAD > "$PKG/HEAD"
cat .next/BUILD_ID > "$PKG/BUILD_ID.txt" 2>/dev/null || echo "(BUILD_ID غایب)" || true
cp .next/fingerprint.json "$PKG/FINGERPRINT.json" 2>/dev/null || echo "(fingerprint غایب)"

# ── ۶) EVENTS.md ──
cat > "$PKG/EVENTS.md" <<'EV'
# بستهٔ بقا ۳۴ — PN-031-G (شورای عالی ملکا · جلسهٔ ۰۴۷)

## چه گذشت؟
- گزارش مالک (جلسهٔ ۰۴۷): گوشی با اسکریپت تحویلی جلسهٔ ازدست‌رفته Poll می‌فرستاد؛
  سرور هر بار «missing auth headers» می‌داد. ساعت همگام ✓ و URL درست ✓ —
  یعنی درخواست می‌رسید ولی هدرهای Timestamp/Signature نمی‌رسیدند.
- جرم‌شناسی سمت سرور: AuditLog نشان داد X-Melka-Relay-Device می‌رسید (نام دستگاه
  در ردپا) ولی دو هدر دیگر غایب — ریشه: curl هدرِ مقدارِ خالی را «بی‌صدا حذف»
  می‌کند؛ اسکریپت دست‌نویس جلسهٔ گم‌شده ts/sig خالی می‌ساخت.
  (نکتهٔ سند ۰۴۷: نام X-Melka-Target در پیش‌نویس سند اشتباه بود — قرارداد واقعی:
  X-Melka-Relay-Device · X-Melka-Timestamp · X-Melka-Signature)
- رفع سه‌لایه:
  (۱) اسکریپت رله: پیش‌پرواز امضا در signed_curl — ts/sig خالی هرگز ارسال نمی‌شود
      (return 9 + پیام فارسی) + وارسی پیکربندی آغازین + پیام موفقیت صادقانه
      («✓ اتصال تأیید شد» فقط پس از اولین پاسخ واقعی سرور) + نمایش نام هدرهای غایب.
  (۲) سرور: پاسخ رد فیلد missing (نام هدرهای نایافته) + ردپای AuditLog با نام‌ها —
      تشخیص یک‌نگاهی، قانون صفر لاگ محتوا پابرجا.
  (۳) تست ۱۷گانه: اجرای واقعی bash (نه شبیه‌سازی) — signed_curl از خودِ اسکریپت
      تولیدشده در برابر سرور آزمایشی: سه هدر پُر می‌رسند، امضای openssl دقیقاً
      برابر HMAC node:crypto، خرابکاری hmac → پیش‌پرواز می‌گیرد (صفر درخواست).
- دروازهٔ زنده از URL عمومی: PASS — بازتولید علامت مالک (403 + missing names
  + خروجی خام -v) · بازتولید نام اشتباه X-Melka-Target (403) · poll امضاشدهٔ
  صحیح → 204 · اسکریپت واقعی ۵+ چرخهٔ کامل صف خالی با صفر خطا ·
  lastSeenAt/enrolledAt غیرNULL · صفر رد پس از نشانگر G.5.
- دو-سبز ۲۷۴۱/۰ ×۲ (رکورد · قبلی ۲۷۲۴) · tsc صفر · lint صفر · ۴۰/۴۲ گارد
  (۲ موردانتظار: آینه/تکرارپذیری — حل در توالی پایانی).

## بازیابی
مثل بسته‌های قبلی — زنجیرهٔ هش: لنگر این بسته به بستهٔ ۳۳ (PN-034-20261014).
پس از بازیابی: (۱) bun install + prisma db push با schema.prisma همین بسته ·
(۲) env.platform.json همین بسته · (۳) APK آمادهٔ نصب در melka-relay-apk/
(sha256 در apk-build.json) + keystore.jks + پروژهٔ کامل برای بازسازی ·
(۴) اسکریپت سخت‌شدهٔ رله (hardened-relay/relay-script.ts با پیش‌پرواز امضا) ·
(۵) صدور کد تازهٔ مالک: scripts/pn031g/issue-owner-code.ts.
کلیدهای حیاتی: env.platform.json + APK + keystore.jks + repo.bundle + hardened-relay/.
EV

# ── ۷) CHAIN.json با لنگر به ۳۳ ──
PREV_HASH=$(sha256sum "upload/.survival/$PREV/MANIFEST.md5" | cut -d' ' -f1)
cat > "$PKG/CHAIN.json" <<CH
{
  "chainIndex": 34,
  "packageName": "PN-035-20261014",
  "prevPackage": "$PREV",
  "prevContentHash": "$PREV_HASH",
  "createdAt": "$TS",
  "law": "بستهٔ ۳۴ به مانیفست کامل بستهٔ ۳۳ لنگر شده است — زنجیرهٔ بازتولیدپذیری"
}
CH
echo "— لنگر به $PREV: ${PREV_HASH:0:16}…"

# ── ۸) MANIFEST.md5 ──
echo "— مهر مانیفست…"
(cd "$PKG" && find . -type f ! -name MANIFEST.md5 -print0 | sort -z | xargs -0 md5sum > MANIFEST.md5)
COUNT=$(wc -l < "$PKG/MANIFEST.md5")

echo ""
echo "═══ بستهٔ بقای ۳۴ کامل: $PKG ═══"
echo "فایل‌ها: $COUNT قلم · حجم کل: $(du -sh "$PKG" | cut -f1)"
