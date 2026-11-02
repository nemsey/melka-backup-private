#!/usr/bin/env bash
# ============================================================================
# PN-035 · بستهٔ بقای chainIndex=39 — قانون بقا (سند ۰۵۷ · شورای عالی ملکا)
# ساخت بستهٔ کامل در upload/.survival/PN-040-20261016/ با لنگر هش به بستهٔ ۳۸
# تازه‌ها (تکمیل ماتریس رله + پایان 502 دروازه):
#   · اسکریپت رله نسل J: پالایش روش + batch=۱۰۰ + موج‌های ۸تایی + retry×۳ +
#     ذخیرهٔ محلی + gzip>۱KB + سازگاری عقبه
#   · الگوی Async: RelayJob + /api/relay/job/[id] + پنج روت فوری jobId
#   · Eager UI: فیلد OTP فوری + poll پس‌زمینه (چهار نقطه)
# نام‌گذاری: قرارداد شمارهٔ بسته = chainIndex+1 و سازگار با sort -V گارد
# ============================================================================
set -euo pipefail
cd /home/z/my-project
TS=$(date -u +%FT%TZ)
PKG="upload/.survival/PN-040-20261016"
PREV="PN-039-20261016"

[ -d "upload/.survival/$PREV" ] || { echo "بستهٔ قبلی (۳۸) یافت نشد"; exit 1; }

echo "═══ ساخت بستهٔ بقای ۳۹ · $TS ═══"
mkdir -p "$PKG/evidence-pn035" "$PKG/melka-relay-apk" "$PKG/recovery-scripts" "$PKG/hardened-relay" "$PKG/melka-proxy-worker"

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

# ── ۳-ب) اسکریپت سخت‌شدهٔ رله (نسل J + کارهای async) ──
cp src/lib/melk-api/relay-script.ts "$PKG/hardened-relay/"
cp src/lib/melk-api/relay.ts "$PKG/hardened-relay/"
cp src/lib/melk-api/relay-jobs.ts "$PKG/hardened-relay/"
cp src/lib/client/relay-job.ts "$PKG/hardened-relay/"
cp src/lib/melk-api/circuit-breaker.ts "$PKG/hardened-relay/" 2>/dev/null || true

# ── ۳-ج) واکِر melka-proxy (آرشیو دوران Worker) ──
cp -r melka-proxy/src "$PKG/melka-proxy-worker/src" 2>/dev/null || true
cp melka-proxy/wrangler.toml melka-proxy/package.json melka-proxy/deploy.sh "$PKG/melka-proxy-worker/" 2>/dev/null || true
cp upload/.runtime/cloudflare-token.env "$PKG/melka-proxy-worker/cloudflare-token.env" 2>/dev/null || true

# ── ۴) docs + شواهد PN-035 + اسکریپت‌ها ──
cp -r docs "$PKG/docs" 2>/dev/null || echo "(docs غایب)"
cp download/pn035/*.json download/pn035/*.txt download/pn035/*.md "$PKG/evidence-pn035/" 2>/dev/null || true
cp download/pn035/*.png "$PKG/evidence-pn035/" 2>/dev/null || true
cp -r scripts/pn035 "$PKG/evidence-pn035/scripts" 2>/dev/null || true
cp scripts/pn031i/live-gate.sh scripts/pn031i/issue-owner-code.ts "$PKG/recovery-scripts/" 2>/dev/null || true
cp scripts/audit-melka-relay-apk.sh scripts/audit-mobile-relay.sh scripts/audit-relay-matrix.sh "$PKG/recovery-scripts/" 2>/dev/null || true
cp scripts/recovery/audit-head-guard.sh scripts/recovery/auto-recovery.sh scripts/recovery/reset-guard.sh "$PKG/recovery-scripts/" 2>/dev/null || true
cp scripts/log-rotate.sh "$PKG/recovery-scripts/log-rotate.sh" 2>/dev/null || true
cp scripts/pn034/survival-package-38.sh "$PKG/recovery-scripts/" 2>/dev/null || true
cp tests/pn035-relay-async.test.ts tests/hotfix04-critical-bugs.test.ts "$PKG/evidence-pn035/" 2>/dev/null || true
cp download/pn012/api-versioning.json "$PKG/evidence-pn035/" 2>/dev/null || true
cp worklog.md "$PKG/worklog.md"

# ── ۵) repo.bundle + هویت ──
echo "— باندل گیت…"
git bundle create "$PKG/repo.bundle" --all 2>/dev/null | tail -1 || true
git rev-parse --short HEAD > "$PKG/HEAD"
cat .next/BUILD_ID > "$PKG/BUILD_ID.txt" 2>/dev/null || echo "(BUILD_ID غایب)" || true
cp .next/fingerprint.json "$PKG/FINGERPRINT.json" 2>/dev/null || echo "(fingerprint غایب)"

# ── ۶) EVENTS.md ──
cat > "$PKG/EVENTS.md" <<'EV'
# بستهٔ بقا ۳۹ — PN-035 (شورای عالی ملکا · جلسهٔ ۰۵۷)

## چه گذشت؟
- پنج تحلیل پارلمانی (throughput/timeout/latency/مسیر برگشت/POST) هرکدام
  ریشهٔ متفاوتی تشخیص داده بودند؛ جلسهٔ ۰۵۷ حکم داد: سه مشکل روی‌هم‌افتاده.
- ریشه‌ها: (۱) اسکریپت رله POST را اجرا نمی‌کرد (log فقط GET) → start-otp
  روی گوشی اجرا نمی‌شد؛ (۲) مسیر برگشت /result شکننده (TTL ۴۵ث + بدون
  retry) → پیامک می‌رسید، پاسخ برنمی‌گشت → 502؛ (۳) دروازهٔ Z.ai بیش از
  ~۳۰-۶۰ث صبر نمی‌کرد → هر عملیات بلند 502 می‌شد در حالی که کار انجام شده بود.
- اجرای GLM — هفت فاز (سند ۰۵۷):
  · فاز ۱ (سرور + کلاینت): ماتریس کامل روش‌ها؛ اسکریپت نسل J با پالایش
    GET/POST/PUT/DELETE/PATCH + بدنه + هدرهای عبوری.
  · فاز ۲ (سرور + کلاینت): TTL ۱۲۰ث + احیای تازه‌منقضی + retry×۳ (۲/۶ث)
    + ذخیرهٔ محلی ~/failed-results.jsonl (TTL ۱۰د) + بازپخش خودکار + triage
    (رد قطعی بدون retry).
  · فاز ۳: الگوی Async — RelayJob (queued→running→done/failed · راز
    AES-256-GCM یک‌بارمصرف) + روت /api/relay/job/[id] + پنج روت فوری jobId
    (arm/pm connection · auth request/verify) — هر گره HTTP < ۱ث.
  · فاز ۴: poll دسته‌ای wait=20/batch=100 + سازگاری عقبه (request) + Eager
    UI (فیلد OTP فوری + poll پس‌زمینه در چهار نقطهٔ ورود/اتصال).
  · فاز ۵: موج‌های ۸ کارگر موازی + نتیجهٔ دسته‌ای «یک POST برای کل موج» +
    نام‌گذاری صفرپرشده (ترتیب قطعی) + تنفس حلقه.
  · فاز ۶: gzip بدنه‌های >۱KB — امضا روی بایت‌های فشردهٔ سیم (÷۱۴ حجم).
  · فاز ۷: دو-سبز ۲۸۰۳/۰×۲ (رکورد · قبلی ۲۷۷۸) · tsc صفر · lint صفر ·
    گارد ۴۵/۴۵ · BUILD_ID=HEAD=آینه · دروازه‌های زنده از URL عمومی.
- رخداد اجرا: سه بیلد head-guard روی کامیت‌های سروریِ ناتمامِ جلسهٔ قبل
  شکسته بود («generate is not a function» — گذرا) → علت ناتمام ماندن
  سند؛ بیلد دستی سبز شد و ادامه از همان‌جا.
- دروازه‌های زنده: async ۱۷۹ms (سنجهٔ <۱ث) · قرارداد job + 403/missing ·
  اسکریپت نسل J ۷۵ث روی بیلد زنده «✓ اتصال تأیید شد» · نشت راز ×۰ ·
  بنچمارک ۱۰۰۰ رکورد ≈ ۴.۴ث (هدف <۳۰ث).

## چگونه بازیابی کنیم؟
پس از بازیابی: (۱) bun install + prisma generate + prisma db push با
schema.prisma همین بسته (۶۹ مدل — RelayJob نسل ۰۵۷) · (۲) env.platform.json
همین بسته (فیوز خاموش · رلهٔ mobile) · (۳) بیلد با bun run build + بوت
scripts/prod-watchdog.sh · (۴) Worker: bun scripts/runtime/worker.ts (قفل
runtime:worker با TTL ۹۰ث خودآزاد است) · (۵) کد تازهٔ مالک:
recovery-scripts/issue-owner-code.ts یا از UI «تولید کد نصب» · (۶) مسیر
مالک: Termux → pkg install -y curl openssl-tool jq → پیست کد نصب → Enter
→ «✓ اتصال تأیید شد — رلهٔ ملکا فعال است» (نسل J).
کلیدهای حیاتی: env.platform.json + custom.db + repo.bundle +
hardened-relay/ (relay-script.ts نسل J + relay-jobs.ts + relay-job.ts) +
recovery-scripts/.
EV

# ── ۷) CHAIN.json با لنگر به ۳۸ ──
PREV_HASH=$(sha256sum "upload/.survival/$PREV/MANIFEST.md5" | cut -d' ' -f1)
cat > "$PKG/CHAIN.json" <<CH
{
  "chainIndex": 39,
  "packageName": "PN-040-20261016",
  "prevPackage": "$PREV",
  "prevContentHash": "$PREV_HASH",
  "createdAt": "$TS",
  "law": "بستهٔ ۳۹ به مانیفست کامل بستهٔ ۳۸ لنگر شده است — زنجیرهٔ بازتولیدپذیری"
}
CH
echo "— لنگر به $PREV: ${PREV_HASH:0:16}…"

# ── ۸) MANIFEST.md5 ──
echo "— مهر مانیفست…"
(cd "$PKG" && find . -type f ! -name MANIFEST.md5 -print0 | sort -z | xargs -0 md5sum > MANIFEST.md5)
COUNT=$(wc -l < "$PKG/MANIFEST.md5")

echo ""
echo "═══ بستهٔ بقای ۳۹ کامل: $PKG ═══"
echo "فایل‌ها: $COUNT قلم · حجم کل: $(du -sh "$PKG" | cut -f1)"
