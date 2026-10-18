#!/usr/bin/env bash
# ============================================================================
# PN-031-I · بستهٔ بقای chainIndex=35 — قانون بقا (سند ۰۵۰ · شورای عالی ملکا)
# ساخت بستهٔ کامل در upload/.survival/PN-036-20261015/ با لنگر هش به بستهٔ ۳۴
# تازه‌ها: پایان curl 9 (http1.1 + UA + نردبان retry + سقف نرخ + لاگ دیباگ
# redact-شده + نبض نسخه) + پایان race بیلد×چرخش (BUILD_RUNNING) + مسیر جایگزین
# واکِر /relay/* + reset-guard داوری دُکلایه (BUILD-STALE) + تازه‌سازی Worker
# نام‌گذاری: قرارداد شمارهٔ بسته = chainIndex+1 و سازگار با sort -V گارد
# ============================================================================
set -euo pipefail
cd /home/z/my-project
TS=$(date -u +%FT%TZ)
PKG="upload/.survival/PN-036-20261015"
PREV="PN-035-20261014"

[ -d "upload/.survival/$PREV" ] || { echo "بستهٔ قبلی (۳۴) یافت نشد"; exit 1; }

echo "═══ ساخت بستهٔ بقای ۳۵ · $TS ═══"
mkdir -p "$PKG/evidence-pn031i" "$PKG/melka-relay-apk" "$PKG/recovery-scripts" "$PKG/hardened-relay" "$PKG/melka-proxy-worker"

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

# ── ۳-ج) واکِر melka-proxy با مسیر جایگزین /relay (تازه — لایهٔ ۳) ──
cp -r melka-proxy/src "$PKG/melka-proxy-worker/src"
cp melka-proxy/wrangler.toml melka-proxy/package.json melka-proxy/deploy.sh "$PKG/melka-proxy-worker/" 2>/dev/null || true
cp upload/.runtime/cloudflare-token.env "$PKG/melka-proxy-worker/cloudflare-token.env" 2>/dev/null || true

# ── ۴) docs + شواهد PN-031-I + اسکریپت‌ها ──
cp -r docs "$PKG/docs" 2>/dev/null || echo "(docs غایب)"
cp download/pn031i/*.json download/pn031i/*.txt "$PKG/evidence-pn031i/" 2>/dev/null || true
cp -r download/pn031i/raw-curl "$PKG/evidence-pn031i/raw-curl" 2>/dev/null || true
cp -r scripts/pn031i "$PKG/evidence-pn031i/scripts" 2>/dev/null || true
cp tests/pn031i-relay-hardening.test.ts "$PKG/evidence-pn031i/" 2>/dev/null || true
cp scripts/audit-melka-relay-apk.sh scripts/audit-mobile-relay.sh "$PKG/recovery-scripts/" 2>/dev/null || true
cp scripts/recovery/audit-head-guard.sh scripts/recovery/auto-recovery.sh scripts/recovery/reset-guard.sh "$PKG/recovery-scripts/" 2>/dev/null || true
cp scripts/log-rotate.sh "$PKG/recovery-scripts/log-rotate.sh" 2>/dev/null || true
cp scripts/pn031g/survival-package-34.sh "$PKG/recovery-scripts/" 2>/dev/null || true
cp worklog.md "$PKG/worklog.md"

# ── ۵) repo.bundle + هویت ──
echo "— باندل گیت…"
git bundle create "$PKG/repo.bundle" --all 2>/dev/null | tail -1 || true
git rev-parse --short HEAD > "$PKG/HEAD"
cat .next/BUILD_ID > "$PKG/BUILD_ID.txt" 2>/dev/null || echo "(BUILD_ID غایب)" || true
cp .next/fingerprint.json "$PKG/FINGERPRINT.json" 2>/dev/null || echo "(fingerprint غایب)"

# ── ۶) EVENTS.md ──
cat > "$PKG/EVENTS.md" <<'EV'
# بستهٔ بقا ۳۵ — PN-031-I (شورای عالی ملکا · جلسهٔ ۰۵۰)

## چه گذشت؟
- گزارش مالک (جلسهٔ ۰۵۰): پس از رفع «missing auth headers» (نسل G)، علامت تازه:
  curl error 9 روی گوشی — دروازه اجازهٔ ادامه نداد. هم‌زمان: بازگشت نسخهٔ
  دهم (اپ به چند ورژن قبل برگشت).
- جرم‌شناسی بازگشت دهم (سه شکاف واقعی):
  ۱) reset-guard فقط درخت گیت را داوری می‌کرد — درخت را در ۰۷:۲۹ بازیابی کرد،
     بیلدش شکست خورد (race چرخش لاگ!) و detect بعدی «HEALTHY equal» دروغین
     گفت؛ سرور ۱۴ ساعت بیلد کهنه سرو کرد.
  ۲) Worker از درختِ بازگشته بوت شده بود — رجیستری کارهایش فاقد head-guard
     بود (قربانی دومِ بازگشت) و هیچ‌کس تازه‌اش نمی‌کرد.
  ۳) بیلدهای «گذرا» شکست‌خوردهٔ head-guard (۰۳:۰۱-۰۵:۰۲) ریشهٔ قطعی داشتند:
     race بین چرخش لاگ (هرس server.log.*.gz) و outputFileTracing نکست
     (ENOENT copyfile) — شاهد زندهٔ ۲۲:۳۹.
- رفع سه‌لایه (لایه‌های سند ۰۵۰):
  · لایهٔ ۱ (curl 9): اسکریپت رله نسل I — http1.1 اجباری + UA بروزری +
    نردبان retry ۳۰/۶۰/۱۲۰/۳۰۰/۳۰۰ + سقف ۵/دقیقه + لاگ دیباگ redact-شده +
    نبض نسخهٔ ۱۰دقیقه‌ای (کشف بازنشانی از خود گوشی). ماتریس فاز ۲: ۴/۴
    ترکیب حمل‌ونقل ۲۰۴ از URL عمومی — دروازهٔ space-z.ai فقط HTTP/1.1
    صحبت می‌کند (حتی با --http2)؛ پس کد ۹ مالِ مسیر گوشی (WAF/bot/rate) است.
  · لایهٔ ۲ (بازگشت): reset-guard داوری دُکلایه — درخت + بیلد زنده؛ «درخت
    سالم + بیلد کهنه» = BUILD-STALE → recover با تازه‌سازی Worker. شبیه‌سازی
    قطعی با سرور ساختگی: exit 2 (تست ۲-ب).
  · لایهٔ ۳ (مسیر جایگزین): واکِر melka-proxy مسیر /relay/* گرفت — مبدأ ثابت
    (فقط space-z.ai) + پیشوندهای مجاز + سقف ۳۰/IP/دقیقه. ۵/۵ poll امضاشده
    ۲۰۴ از مسیر واکِر. گوشی پس از ۳ خطای پیاپی خودکار سوئیچ می‌کند.
  · پایان race بیلد: پرچم BUILD_RUNNING در اسکریپت build + موکول‌سازی چرخش.
- دروازه: دو-سبز ۲۷۶۴/۰ ×۲ (رکورد) · tsc صفر · lint صفر · گارد ۴۴/۴ ·
  دروازهٔ زندهٔ اسکریپت واقعی ۷۵ث: اتصال ✓ · خطای شبکه ۰ · نشت راز ۰ ·
  لاگ دیباگ ۱۱.۷KB با ۴ خط امضای redact-شده · ALPN http/1.1.

## چگونه بازیابی کنیم؟
پس از بازیابی: (۱) bun install + prisma db push با schema.prisma همین بسته ·
(۲) env.platform.json همین بسته (شامل MELK_RELAY_ALT_URL) · (۳) APK آمادهٔ
نصب + keystore.jks + پروژهٔ کامل اندروید · (۴) اسکریپت رلهٔ نسل I در
hardened-relay/relay-script.ts · (۵) واکِر مسیر جایگزین در melka-proxy-worker/
(دیپلوی: wrangler deploy با توکن cloudflare-token.env) · (۶) صدور کد تازهٔ
مالک: scripts/pn031i/issue-owner-code.ts.
کلیدهای حیاتی: env.platform.json + APK + keystore.jks + repo.bundle +
hardened-relay/ + melka-proxy-worker/ + recovery-scripts/reset-guard.sh (نسل I).
EV

# ── ۷) CHAIN.json با لنگر به ۳۴ ──
PREV_HASH=$(sha256sum "upload/.survival/$PREV/MANIFEST.md5" | cut -d' ' -f1)
cat > "$PKG/CHAIN.json" <<CH
{
  "chainIndex": 35,
  "packageName": "PN-036-20261015",
  "prevPackage": "$PREV",
  "prevContentHash": "$PREV_HASH",
  "createdAt": "$TS",
  "law": "بستهٔ ۳۵ به مانیفست کامل بستهٔ ۳۴ لنگر شده است — زنجیرهٔ بازتولیدپذیری"
}
CH
echo "— لنگر به $PREV: ${PREV_HASH:0:16}…"

# ── ۸) MANIFEST.md5 ──
echo "— مهر مانیفست…"
(cd "$PKG" && find . -type f ! -name MANIFEST.md5 -print0 | sort -z | xargs -0 md5sum > MANIFEST.md5)
COUNT=$(wc -l < "$PKG/MANIFEST.md5")

echo ""
echo "═══ بستهٔ بقای ۳۵ کامل: $PKG ═══"
echo "فایل‌ها: $COUNT قلم · حجم کل: $(du -sh "$PKG" | cut -f1)"
