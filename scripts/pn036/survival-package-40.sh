#!/usr/bin/env bash
# ============================================================================
# PN-036 · بستهٔ بقای chainIndex=40 — قانون بقا (سند ۰۵۸ · شورای عالی ملکا)
# ساخت بستهٔ کامل در upload/.survival/PN-041-20261016/ با لنگر هش به بستهٔ ۳۹
# تازه‌ها (نسل K — گزارش پنج‌نقطه‌ای مالک ۱۴۰۵/۰۷/۲۶):
#   · رفع jq ARG_MAX: --rawfile برای بدنهٔ base64 + ادغام stdin (لاگ خط ۳۷۱)
#   · batch=20 (گرسنگی TTL — ۴۳۰ expired) · مهلت تطبیقی ۱۵/۶۰ث (curl 28)
#   · Express lane: آیتمهای OTP مقدم و جدا از فهرستهای سنگین
#   · پایان بازپخش بی‌پایان: رد قطعی → rc=2 → حذف ردیف (شکایت ۴ مالک)
#   · بودجهٔ تعاملی env-محور ۹۰ث (PM/ARM OTP) + upsertPmStatus با retry
#   · pageSize ۵۰ · مهلت سرور ۷۵ث · RELAY_WAIT ۱۱۰ث
# نام‌گذاری: قرارداد شمارهٔ بسته = chainIndex+1 و سازگار با sort -V گارد
# ============================================================================
set -euo pipefail
cd /home/z/my-project
TS=$(date -u +%FT%TZ)
PKG="upload/.survival/PN-041-20261016"
PREV="PN-040-20261016"

[ -d "upload/.survival/$PREV" ] || { echo "بستهٔ قبلی (۳۹) یافت نشد"; exit 1; }

echo "═══ ساخت بستهٔ بقای ۴۰ · $TS ═══"
mkdir -p "$PKG/evidence-pn036" "$PKG/melka-relay-apk" "$PKG/recovery-scripts" "$PKG/hardened-relay" "$PKG/melka-proxy-worker"

# ── ۱) فایل‌های پایه ──
cp AGENTS.md "$PKG/" 2>/dev/null || echo "(AGENTS.md غایب — رد شد)"
cp bun.lock package.json env.platform.json prisma/schema.prisma "$PKG/"
mkdir -p "$PKG/prisma"
cp prisma/schema.prisma "$PKG/prisma/"
cp prisma/schema.postgres.prisma "$PKG/prisma/" 2>/dev/null || true
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
con = sqlite3.connect(f"{pkg}/custom.db")
n = con.execute("PRAGMA integrity_check").fetchone()[0]
brk = con.execute("SELECT COUNT(*) FROM CircuitBreakerState").fetchone()[0]
dev = con.execute("SELECT COUNT(*) FROM RelayDevice").fetchone()[0]
rj = con.execute("SELECT COUNT(*) FROM RelayJob").fetchone()[0]
models = con.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table'").fetchone()[0]
sz = os.path.getsize(f"{pkg}/custom.db")
print(f"  custom.db · md5={h[:12]}… · integrity={n} · {sz/1024/1024:.1f}MB · tables={models} · breaker={brk} · devices={dev} · relayJobs={rj}")
PYEOF

# ── ۳) APK + پروژهٔ اندروید (آرشیو — بقا می‌ماند) ──
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

# ── ۳-ب) اسکریپت سخت‌شدهٔ رله (نسل K + کارهای async) ──
cp src/lib/melk-api/relay-script.ts "$PKG/hardened-relay/"
cp src/lib/melk-api/relay.ts "$PKG/hardened-relay/"
cp src/lib/melk-api/relay-jobs.ts "$PKG/hardened-relay/"
cp src/lib/client/relay-job.ts "$PKG/hardened-relay/"
cp src/lib/melk-api/config.ts "$PKG/hardened-relay/"
cp src/lib/melk-api/provider.ts "$PKG/hardened-relay/"
cp src/lib/melk-api/arm-catalog.ts "$PKG/hardened-relay/"
cp src/lib/melk-api/melk-public.ts "$PKG/hardened-relay/"
cp src/app/api/pm/connection/route.ts "$PKG/hardened-relay/pm-connection-route.ts"
cp src/lib/melk-api/circuit-breaker.ts "$PKG/hardened-relay/" 2>/dev/null || true

# ── ۳-ج) واکِر melka-proxy (آرشیو دوران Worker) ──
cp -r melka-proxy/src "$PKG/melka-proxy-worker/src" 2>/dev/null || true
cp melka-proxy/wrangler.toml melka-proxy/package.json melka-proxy/deploy.sh "$PKG/melka-proxy-worker/" 2>/dev/null || true
cp upload/.runtime/cloudflare-token.env "$PKG/melka-proxy-worker/cloudflare-token.env" 2>/dev/null || true

# ── ۴) docs + شواهد PN-036 + اسکریپت‌ها ──
cp -r docs "$PKG/docs" 2>/dev/null || echo "(docs غایب)"
cp download/pn036/*.json download/pn036/*.txt download/pn036/*.md "$PKG/evidence-pn036/" 2>/dev/null || true
cp -r scripts/pn036 "$PKG/evidence-pn036/scripts" 2>/dev/null || true
cp scripts/pn031i/live-gate.sh "$PKG/recovery-scripts/" 2>/dev/null || true
cp scripts/pn036/issue-owner-code.ts "$PKG/recovery-scripts/" 2>/dev/null || true
cp scripts/audit-melka-relay-apk.sh scripts/audit-mobile-relay.sh scripts/audit-relay-matrix.sh "$PKG/recovery-scripts/" 2>/dev/null || true
cp scripts/recovery/audit-head-guard.sh scripts/recovery/auto-recovery.sh scripts/recovery/reset-guard.sh "$PKG/recovery-scripts/" 2>/dev/null || true
cp scripts/log-rotate.sh "$PKG/recovery-scripts/log-rotate.sh" 2>/dev/null || true
cp scripts/pn035/survival-package-39.sh "$PKG/recovery-scripts/" 2>/dev/null || true
cp tests/pn035-relay-async.test.ts "$PKG/evidence-pn036/" 2>/dev/null || true
cp worklog.md "$PKG/worklog.md"

# ── ۵) repo.bundle + هویت ──
echo "— باندل گیت…"
git bundle create "$PKG/repo.bundle" --all 2>/dev/null | tail -1 || true
git rev-parse --short HEAD > "$PKG/HEAD"
cat .next/BUILD_ID > "$PKG/BUILD_ID.txt" 2>/dev/null || echo "(BUILD_ID غایب)" || true
cp .next/fingerprint.json "$PKG/FINGERPRINT.json" 2>/dev/null || echo "(fingerprint غایب)"

# ── ۶) EVENTS.md ──
cat > "$PKG/EVENTS.md" <<'EV'
# بستهٔ بقا ۴۰ — PN-036 (شورای عالی ملکا · جلسهٔ ۰۵۸)

## چه گذشت؟
- گزارش پنج‌نقطه‌ای مالک (۱۴۰۵/۰۷/۲۶): تونل ✓ · ARM OTP ✓ (PN-035 زنده!) ·
  PM فیلد OTP نمی‌آید ✗ · APIها ✗ · فهرستها ✗ — شورا ن۰۵۸ چهار ریشه تشخیص داد:
  (۱) jq «Argument list too long» روی پاسخهای بزرگ (خط ۳۷۱ لاگ مالک)؛
  (۲) curl خطای ۲۸ (مهلت ۲۵ث برای فهرستهای سنگین)؛ (۳) گرسنگی TTL صف —
  ۴۳۰ آیتم expired زیر موجهای batch=۱۰۰؛ (۴) بازپخش بی‌پایان ردیفهای
  failed-results.jsonl برای رد قطعی (مالک مجبور به Ctrl+C).
- حادثهٔ اجرا: rollback سیزدهم — کار نیمه‌کارهٔ جلسهٔ مردهٔ PN-036 در کامیت
  822820d (۴۴۰ خط · نسل K + بودجه‌ها + pageSize) بود؛ reset-guard درخت را
  به 4e6cfe3 برگرداند. بازیابی صادقانه از گیت (checkout فایلهای سورس) —
  صفر دادهٔ ازدست‌رفته. فایل سرگردان PN-036-PRE-20261016.db به backups/ منتقل شد.
- کشف PN-036 فاز ۳: endpoint PM «درست» بود — پاسخ ۴۱۲ واقعی سامانه PM
  («کد تایید قبلا ارسال شده است») در صف رله: پیامک PM واقعاً ارسال می‌شد؛
  ریشه: بودجهٔ min(cfg,20s) + گرسنگی صف + شکست خاموش upsertPmConnection.
- اجرای GLM — نسل K (relay-script.ts):
  · jq ARG_MAX: بدنهٔ base64 با --rawfile از فایل موقت؛ ادغام با cat|jq stdin.
  · BATCH=20 + Express lane (OTP جدا و مقدم؛ POST جداگانه).
  · مهلت تطبیقی: تعاملی ۱۵ث / سنگین ۶۰ث + تلاش دوم خطای ۲۸ (۵ث فاصله).
  · پایان بازپخش بی‌پایان: post_results قرارداد سه‌حالته (0 پذیرش · 1 گذرا ·
    2 رد قطعی) — رد قطعی = حذف ردیف؛ حالت nostore در replay (نه دوبرابر).
  · لاگ زمان هر آیتم (روش+مسیر+کد+مدت).
- سرور: بودجهٔ تعاملی env-محور MELK_INTERACTIVE_TIMEOUT_MS (۹۰ث · تست ۳۰۰ms
  شکست‌سریع PN-013/D5) در provider + pm route · upsertPmStatus با ۴ تلاش ·
  poll اپ ۱۲۰/۱۵۰ · pageSize ۵۰ (ARM/عمومی) · مهلت ۷۵ث · RELAY_WAIT ۱۱۰ث.
- پایداری: دو-سبز ۲۸۱۱/۰ ×۲ (رکورد · قبلی ۲۸۰۳ · +۸ تست: K-1..K-7 + B-5)
  · tsc صفر · lint صفر · گارد ۴۵/۴۵ (matrix ۳۳/۳۳) · BUILD_ID=HEAD=آینه ·
  دروازهٔ async گرم ۱۸ms · کد نصب نسل K با راستی‌آزمایی ۶ نشانگر.
- دروازه‌های jq: ۱۰۰ فایل ۱۱ms · ۵۰۰ فایل ۶۸ms · b64 دو-مگابایتی --rawfile.

## چگونه بازیابی کنیم؟
پس از بازیابی: (۱) bun install + prisma generate + prisma db push با
schema.prisma همین بسته (۶۹ مدل) · (۲) env.platform.json همین بسته (فیوز
خاموش · رلهٔ mobile) · (۳) بیلد با bun run build + بوت با standalone/server.js
· (۴) Worker: bun scripts/runtime/worker.ts (قفل runtime:worker با TTL ۹۰ث
خودآزاد است) · (۵) کد تازهٔ مالک: recovery-scripts/issue-owner-code.ts یا از
UI «تولید کد نصب» · (۶) مسیر مالک: Termux → Ctrl+C رلهٔ کهنه → پیست کد نصب →
Enter → «✓ اتصال تأیید شد» (نسل K) → اپ → PM: کدپرسنلی ۴۱۰۰۳۱۳۲۰ ← ارسال کد.
کلیدهای حیاتی: env.platform.json + custom.db + repo.bundle +
hardened-relay/ (relay-script.ts نسل K + config.ts + provider.ts +
pm-connection-route.ts) + recovery-scripts/.
EV

# ── ۷) CHAIN.json با لنگر به ۳۹ ──
PREV_HASH=$(sha256sum "upload/.survival/$PREV/MANIFEST.md5" | cut -d' ' -f1)
cat > "$PKG/CHAIN.json" <<CH
{
  "chainIndex": 40,
  "packageName": "PN-041-20261016",
  "prevPackage": "$PREV",
  "prevContentHash": "$PREV_HASH",
  "createdAt": "$TS",
  "law": "بستهٔ ۴۰ به مانیفست کامل بستهٔ ۳۹ لنگر شده است — زنجیرهٔ بازتولیدپذیری"
}
CH
echo "— لنگر به $PREV: ${PREV_HASH:0:16}…"

# ── ۸) MANIFEST.md5 ──
echo "— مهر مانیفست…"
(cd "$PKG" && find . -type f ! -name MANIFEST.md5 -print0 | sort -z | xargs -0 md5sum > MANIFEST.md5)
COUNT=$(wc -l < "$PKG/MANIFEST.md5")

echo ""
echo "═══ بستهٔ بقای ۴۰ کامل: $PKG ═══"
echo "فایل‌ها: $COUNT قلم · حجم کل: $(du -sh "$PKG" | cut -f1)"
