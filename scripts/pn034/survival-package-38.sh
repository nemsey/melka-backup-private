#!/usr/bin/env bash
# ============================================================================
# PN-034 · بستهٔ بقای chainIndex=38 — قانون بقا (سند ۰۵۵ · شورای عالی ملکا)
# ساخت بستهٔ کامل در upload/.survival/PN-039-20261016/ با لنگر هش به بستهٔ ۳۷
# تازه‌ها (قانون مالک: صفر محدودیت اتصال): سه بازگردانی + یک حذف —
#   · احیای دکمهٔ «تولید کد نصب» رلهٔ Termux (مسیر اثبات‌شدهٔ PN-031-I · openssl-tool)
#   · احیای «اتصال به حساب شخصی ARM» (فرم مستقیم بدون قفل)
#   · حذف کامل «ورود مجدد به ملک تبریز» + مکانیزم OTP تک‌بارة PN-029
#     (OtpReloginSection + روت otp-burn اصلی/v1 + ماژول otp-lock + مدل OtpRateLimit)
#   · حذف سقفهای نرخ محلی از ۵ مسیر اتصال (request-otp/verify-otp/arm/pm/gap)
# نام‌گذاری: قرارداد شمارهٔ بسته = chainIndex+1 و سازگار با sort -V گارد
# ============================================================================
set -euo pipefail
cd /home/z/my-project
TS=$(date -u +%FT%TZ)
PKG="upload/.survival/PN-039-20261016"
PREV="PN-038-20261016"

[ -d "upload/.survival/$PREV" ] || { echo "بستهٔ قبلی (۳۷) یافت نشد"; exit 1; }

echo "═══ ساخت بستهٔ بقای ۳۸ · $TS ═══"
mkdir -p "$PKG/evidence-pn034" "$PKG/melka-relay-apk" "$PKG/recovery-scripts" "$PKG/hardened-relay" "$PKG/melka-proxy-worker"

# ── ۱) فایل‌های پایه ──
cp AGENTS.md "$PKG/" 2>/dev/null || echo "(AGENTS.md غایب — رد شد)"
cp bun.lock package.json env.platform.json prisma/schema.prisma "$PKG/"
mkdir -p "$PKG/prisma"
cp prisma/schema.prisma "$PKG/prisma/"
printf 'DATABASE_URL=file:/home/z/my-project/db/custom.db\n' > "$PKG/env.txt"

# ── ۲) پایگاه داده (بکاپ گرم VACUUM INTO — قانون صفر-محدودیت: OtpRateLimit دراپ) ──
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
brk = sqlite3.connect(f"{pkg}/custom.db").execute("SELECT COUNT(*) FROM CircuitBreakerState").fetchone()[0]
dev = sqlite3.connect(f"{pkg}/custom.db").execute("SELECT COUNT(*) FROM RelayDevice").fetchone()[0]
otp = sqlite3.connect(f"{pkg}/custom.db").execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='OtpRateLimit'").fetchone()[0]
sz = os.path.getsize(f"{pkg}/custom.db")
print(f"  custom.db · md5={h[:12]}… · integrity={n} · {sz/1024/1024:.1f}MB · breaker={brk} · devices={dev} · OtpRateLimit-table={otp}")
PYEOF

# ── ۳) APK + پروژهٔ اندروید (آرشیو دوران APK — بقا می‌ماند) ──
cp download/pn031e/melka-relay.apk "$PKG/melka-relay-apk/melka-relay.apk" 2>/dev/null || true
cp download/pn031d/apk-build.json "$PKG/melka-relay-apk/" 2>/dev/null || true
cp download/pn031e/qr-install.png "$PKG/melka-relay-apk/qr-install.png" 2>/dev/null || true
cp download/pn031e/OWNER-GUIDE.html "$PKG/melka-relay-apk/OWNER-GUIDE.html" 2>/dev/null || true
cp melka-relay-android/melka-relay.jks "$PKG/melka-relay-apk/keystore.jks" 2>/dev/null || true
rsync -a --exclude 'build/' --exclude '.gradle/' melka-relay-android/ "$PKG/melka-relay-apk/project/" 2>/dev/null || {
  mkdir -p "$PKG/melka-relay-apk/project"
  cp -r melka-relay-android/app "$PKG/melka-relay-apk/project/" 2>/dev/null || true
  cp melka-relay-android/*.kts melka-relay-android/*.properties melka-relay-android/.gitignore "$PKG/melka-relay-apk/project/" 2>/dev/null || true
}

# ── ۳-ب) اسکریپت سخت‌شدهٔ رله (نسل openssl-tool · مسیر اثبات‌شدهٔ مالک) ──
cp src/lib/melk-api/relay-script.ts "$PKG/hardened-relay/"
cp src/lib/melk-api/relay.ts "$PKG/hardened-relay/"
cp src/lib/melk-api/circuit-breaker.ts "$PKG/hardened-relay/"

# ── ۳-ج) واکِر melka-proxy (آرشیو دوران Worker) ──
cp -r melka-proxy/src "$PKG/melka-proxy-worker/src" 2>/dev/null || true
cp melka-proxy/wrangler.toml melka-proxy/package.json melka-proxy/deploy.sh "$PKG/melka-proxy-worker/" 2>/dev/null || true
cp upload/.runtime/cloudflare-token.env "$PKG/melka-proxy-worker/cloudflare-token.env" 2>/dev/null || true

# ── ۴) docs + شواهد PN-034 + اسکریپت‌ها ──
cp -r docs "$PKG/docs" 2>/dev/null || echo "(docs غایب)"
cp download/pn034/*.json download/pn034/*.txt "$PKG/evidence-pn034/" 2>/dev/null || true
cp download/pn034/*.png "$PKG/evidence-pn034/" 2>/dev/null || true
cp -r scripts/pn034 "$PKG/evidence-pn034/scripts" 2>/dev/null || true
cp scripts/pn031i/live-gate.sh scripts/pn031i/issue-owner-code.ts "$PKG/recovery-scripts/" 2>/dev/null || true
cp scripts/audit-melka-relay-apk.sh scripts/audit-mobile-relay.sh "$PKG/recovery-scripts/" 2>/dev/null || true
cp scripts/recovery/audit-head-guard.sh scripts/recovery/auto-recovery.sh scripts/recovery/reset-guard.sh "$PKG/recovery-scripts/" 2>/dev/null || true
cp scripts/log-rotate.sh "$PKG/recovery-scripts/log-rotate.sh" 2>/dev/null || true
cp scripts/pn033/survival-package-37.sh "$PKG/recovery-scripts/" 2>/dev/null || true
cp tests/pn033-cleanup.test.ts tests/hotfix04-critical-bugs.test.ts "$PKG/evidence-pn034/" 2>/dev/null || true
cp worklog.md "$PKG/worklog.md"

# ── ۵) repo.bundle + هویت ──
echo "— باندل گیت…"
git bundle create "$PKG/repo.bundle" --all 2>/dev/null | tail -1 || true
git rev-parse --short HEAD > "$PKG/HEAD"
cat .next/BUILD_ID > "$PKG/BUILD_ID.txt" 2>/dev/null || echo "(BUILD_ID غایب)" || true
cp .next/fingerprint.json "$PKG/FINGERPRINT.json" 2>/dev/null || echo "(fingerprint غایب)"

# ── ۶) EVENTS.md ──
cat > "$PKG/EVENTS.md" <<'EV'
# بستهٔ بقا ۳۸ — PN-034 (شورای عالی ملکا · جلسهٔ ۰۵۵)

## چه گذشت؟
- گزارش مالک (جلسهٔ ۰۵۵): اتصال Termux برقرار نیست؛ بخش «ورود مجدد به ملک
  تبریز» خطای «مکانیزم OTP تک‌باره (PN-029): این کد پرسنلی تا ۴ ساعت و
  ۳۹ دقیقه دیگر قفل است» می‌دهد؛ دکمهٔ تولید کد نصب رله حذف شده است.
- درس ماندگار ۰۵۴ (ثبت در تاریخ شورا): «پاکسازی بیش از حد، به اندازهٔ
  ناکافی بد است.» — PN-033 دکمهٔ تولید کد نصب را هم حذف کرده بود.
- قانون مالک (بالاتر از هر مکانیزم امنیتی قبلی): «صفر محدودیت اتصال».
- اجرای GLM — سه بازگردانی + یک حذف:
  · احیای «تولید کد نصب» (RelaySetupSection · POST /api/admin/relay/enroll)
    + راهنمای ۳ خطی مسیر اثبات‌شدهٔ PN-031-I: pkg install -y openssl-tool
    → پیست کد نصب → Enter. buildInstallCommand و اسکریپت رله هر دو
    openssl-tool (بستهٔ CLI واقعی Termux) نصب می‌کنند.
  · احیای «اتصال به حساب شخصی سامانه ARM» (ArmConnectionSection embedded —
    فرم مستقیم: کدپرسنلی → دریافت پیامک → تأیید؛ بدون هیچ قفلی).
  · حذف کامل «ورود مجدد» + مکانیزم تک‌باره: OtpReloginSection.tsx + روت
    /api/admin/otp-burn (اصلی + آینهٔ v1) + src/lib/auth/otp-lock.ts + مدل
    OtpRateLimit از هر دو اسکیما (جدول از custom.db و test.db دراپ —
    قفل ۶ساعتهٔ code:410031320 با خود جدول نابود شد).
  · حذف سقفهای نرخ محلی از ۵ مسیر اتصال (request-otp · verify-otp ·
    arm/pm/gap connection) — recordAttempt فقط رد حسابرسی، هرگز سپر.
- حادثهٔ بازگشت دوازدهم: reset-guard در BUILD-STALE (بیلد کهنه در برابر
  HEAD) دستور reset --hard داد و کارهای کامیت‌نشده را پاک کرد (۱۲:۰۹Z).
  بازیابی: بازپخش کامل تغییرات + کامیت فوری + پوش فوری آینه (درس ۵
  PN-032: پنجرهٔ کامیت→آینه بسته شد) + قفل نرخ موقتِ صادقانه در فعال-کاری.
- دروازه‌ها: دو-سبز ۲۷۷۸/۰×۲ · tsc صفر · lint صفر خطا · گارد ۴۴/۴۴ ·
  BUILD_ID=HEAD=آینه (30fab64) · اثبات DOM زنده: ARM بازگشت + ورود مجدد
  حذف + دکمهٔ تولید کد نصب موجود.

## چگونه بازیابی کنیم؟
پس از بازیابی: (۱) bun install + prisma generate + prisma db push با
schema.prisma همین بسته (۶۸ مدل — OtpRateLimit حذف) · (۲) env.platform.json
همین بسته (فیوز خاموش · رلهٔ mobile) · (۳) بیلد با bun run build + بوت
scripts/prod-watchdog.sh · (۴) Worker: bun scripts/runtime/worker.ts (قفل
runtime:worker با TTL ۹۰ث خودآزاد است) · (۵) کد تازهٔ مالک:
recovery-scripts/issue-owner-code.ts یا از UI «تولید کد نصب» · (۶) مسیر
مالک: Termux → pkg install -y openssl-tool → پیست کد نصب → Enter.
کلیدهای حیاتی: env.platform.json + custom.db + repo.bundle +
hardened-relay/ (relay-script.ts با openssl-tool) + recovery-scripts/.
EV

# ── ۷) CHAIN.json با لنگر به ۳۷ ──
PREV_HASH=$(sha256sum "upload/.survival/$PREV/MANIFEST.md5" | cut -d' ' -f1)
cat > "$PKG/CHAIN.json" <<CH
{
  "chainIndex": 38,
  "packageName": "PN-039-20261016",
  "prevPackage": "$PREV",
  "prevContentHash": "$PREV_HASH",
  "createdAt": "$TS",
  "law": "بستهٔ ۳۸ به مانیفست کامل بستهٔ ۳۷ لنگر شده است — زنجیرهٔ بازتولیدپذیری"
}
CH
echo "— لنگر به $PREV: ${PREV_HASH:0:16}…"

# ── ۸) MANIFEST.md5 ──
echo "— مهر مانیفست…"
(cd "$PKG" && find . -type f ! -name MANIFEST.md5 -print0 | sort -z | xargs -0 md5sum > MANIFEST.md5)
COUNT=$(wc -l < "$PKG/MANIFEST.md5")

echo ""
echo "═══ بستهٔ بقای ۳۸ کامل: $PKG ═══"
echo "فایل‌ها: $COUNT قلم · حجم کل: $(du -sh "$PKG" | cut -f1)"
