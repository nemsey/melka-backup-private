#!/usr/bin/env bash
# ============================================================================
# PN-038 · بستهٔ بقای chainIndex=۴۱ — قانون بقا (سند ۰۶۳ · شورای عالی ملکا)
# ساخت بستهٔ کامل در upload/.survival/PN-042-20261017/ با لنگر هش به بستهٔ ۴۰
# تازه‌های ن۰۶۳ (جلسهٔ دوم — بازیابی و تثبیت):
#   · قانون دادهٔ مقدس: گارد سه‌لایه (mtime+شمارش+سلامت) در ۴ مسیر بازیابی +
#     بکاپ ۱۵دقیقه‌ای Worker + حذف کامل deleteMany از سینک (ریست=sacred-keep)
#   · هوم یک‌پارچه: حذف M6/M7/ظرف/کاشی‌های کهنه + ۸ کاشی ریشه با نام کوتاه
#   · GLM Probe Mode: مدل GlmProbe + روت /api/glm/probe + CLI melka-debug
#   · پایش ۲۴ساعته: relay-health-check سه‌لایه هر ۵د + RelayStatusCard 🟢🟡🔴
#   · Tier 4: Brier 0.2256/0.2392 > 0.20 → HOLD (دکترین شاهد کمّی)
#   · حذف کد مرده: offline-mode + Old OTP (Cloudflare proxy ماند)
# نام‌گذاری: قرارداد شمارهٔ بسته = chainIndex+1 و سازگار با sort -V گارد
# ============================================================================
set -euo pipefail
cd /home/z/my-project
TS=$(date -u +%FT%TZ)
PKG="upload/.survival/PN-042-20261017"
PREV="PN-041-20261016"

[ -d "upload/.survival/$PREV" ] || { echo "بستهٔ قبلی (۴۰) یافت نشد"; exit 1; }

echo "═══ ساخت بستهٔ بقای ۴۱ · $TS ═══"
mkdir -p "$PKG/evidence-pn038" "$PKG/melka-relay-apk" "$PKG/recovery-scripts" "$PKG/hardened-relay" "$PKG/melka-proxy-worker" "$PKG/glm-probe"

# ── ۱) فایل‌های پایه ──
cp AGENTS.md "$PKG/" 2>/dev/null || echo "(AGENTS.md غایب — رد شد)"
cp bun.lock package.json env.platform.json "$PKG/"
mkdir -p "$PKG/prisma"
cp prisma/schema.prisma "$PKG/prisma/"
cp prisma/schema.postgres.prisma "$PKG/prisma/"
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
gp = con.execute("SELECT COUNT(*) FROM GlmProbe").fetchone()[0]
pr = con.execute("SELECT COUNT(*) FROM PropertyRecord").fetchone()[0]
rq = con.execute("SELECT COUNT(*) FROM RequestRecord").fetchone()[0]
models = con.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table'").fetchone()[0]
sz = os.path.getsize(f"{pkg}/custom.db")
print(f"  custom.db · md5={h[:12]}… · integrity={n} · {sz/1024/1024:.1f}MB · tables={models} · breaker={brk} · devices={dev} · relayJobs={rj} · glmProbes={gp} · properties={pr} · requests={rq}")
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

# ── ۳-ب) رلهٔ سخت‌شده (نسل K + سلامت ن۰۶۳) ──
cp src/lib/melk-api/relay-script.ts "$PKG/hardened-relay/"
cp src/lib/melk-api/relay.ts "$PKG/hardened-relay/"
cp src/lib/melk-api/relay-jobs.ts "$PKG/hardened-relay/"
cp src/lib/relay/health.ts "$PKG/hardened-relay/relay-health.ts"
cp src/lib/client/relay-job.ts "$PKG/hardened-relay/"
cp src/lib/melk-api/config.ts "$PKG/hardened-relay/"
cp src/lib/melk-api/provider.ts "$PKG/hardened-relay/"
cp src/lib/melk-api/arm-catalog.ts "$PKG/hardened-relay/"
cp src/lib/melk-api/melk-public.ts "$PKG/hardened-relay/"
cp src/lib/melk-api/sync.ts "$PKG/hardened-relay/sync-sacred.ts"
cp src/app/api/pm/connection/route.ts "$PKG/hardened-relay/pm-connection-route.ts"
cp src/lib/melk-api/circuit-breaker.ts "$PKG/hardened-relay/" 2>/dev/null || true
cp scripts/recovery/sacred-data-guard.ts "$PKG/recovery-scripts/" 2>/dev/null || true

# ── ۳-ج) GLM Probe Mode (ن۰۶۳ · فاز ۳) ──
cp src/lib/glm/probe.ts "$PKG/glm-probe/" 2>/dev/null || true
cp src/app/api/glm/probe/route.ts "$PKG/glm-probe/glm-probe-route.ts" 2>/dev/null || true
cp scripts/melka-debug.ts "$PKG/glm-probe/melka-debug.ts" 2>/dev/null || true

# ── ۳-د) واکِر melka-proxy (آرشیو دوران Worker) ──
cp -r melka-proxy/src "$PKG/melka-proxy-worker/src" 2>/dev/null || true
cp melka-proxy/wrangler.toml melka-proxy/package.json melka-proxy/deploy.sh "$PKG/melka-proxy-worker/" 2>/dev/null || true
cp upload/.runtime/cloudflare-token.env "$PKG/melka-proxy-worker/cloudflare-token.env" 2>/dev/null || true

# ── ۴) docs + شواهد PN-038 + اسکریپت‌ها ──
cp -r docs "$PKG/docs" 2>/dev/null || echo "(docs غایب)"
cp download/pn038/*.json download/pn038/*.txt download/pn038/*.md download/pn038/*.png download/pn038/*.log "$PKG/evidence-pn038/" 2>/dev/null || true
cp -r scripts/pn038 "$PKG/evidence-pn038/scripts" 2>/dev/null || true
cp scripts/pn036/issue-owner-code.ts "$PKG/recovery-scripts/" 2>/dev/null || true
cp scripts/audit-melka-relay-apk.sh scripts/audit-mobile-relay.sh scripts/audit-relay-matrix.sh scripts/audit-data-sacred.sh "$PKG/recovery-scripts/" 2>/dev/null || true
cp scripts/recovery/audit-head-guard.sh scripts/recovery/auto-recovery.sh scripts/recovery/reset-guard.sh "$PKG/recovery-scripts/" 2>/dev/null || true
cp scripts/log-rotate.sh "$PKG/recovery-scripts/log-rotate.sh" 2>/dev/null || true
cp scripts/pn036/survival-package-40.sh "$PKG/recovery-scripts/" 2>/dev/null || true
cp tests/pn038-sacred-data.test.ts tests/pn038-glm-probe.test.ts tests/pn038-relay-health.test.ts "$PKG/evidence-pn038/" 2>/dev/null || true
cp worklog.md "$PKG/worklog.md"

# ── ۵) repo.bundle + هویت ──
echo "— باندل گیت…"
git bundle create "$PKG/repo.bundle" --all 2>/dev/null | tail -1 || true
git rev-parse --short HEAD > "$PKG/HEAD"
cat .next/BUILD_ID > "$PKG/BUILD_ID.txt" 2>/dev/null || echo "(BUILD_ID غایب)" || true
cp .next/fingerprint.json "$PKG/FINGERPRINT.json" 2>/dev/null || echo "(fingerprint غایب)"

# ── ۶) EVENTS.md ──
cat > "$PKG/EVENTS.md" <<'EV'
# بستهٔ بقا ۴۱ — PN-038 (شورای عالی ملکا · جلسهٔ ن۰۶۳)

## چه گذشت؟
- سند ن۰۶۳ (۱۴۰۵/۰۷/۲۷): سه محور — (۱) نجات دادهٔ ازدست‌رفته (قانون دادهٔ
  مقدس) — تشخیص مالک درست بود: بازنشانی سرور GLM روی پلتفرم + auto-recovery
  با بکاپ کهنه = رونویسی دادهٔ تازه؛ (۲) بازطراحی UI (هوم یک‌پارچه)؛
  (۳) مرحلهٔ رشد (Probe + Uptime + Tier 4).
- جلسهٔ اول (صبح): فازهای ۱-۶ کامل کامیت شد اما پیش از بیلد/ری‌استارت جلسه
  مرد. پلتفرم ساعت ۰۷:۲۳ درخت را به کامیت ۱۰ اکتبر (1425ee0) برگرداند
  (بازگشت چهاردهم) — جلسهٔ اول از reflog بازیابی کرد (07:31 → 7e1f711) و
  فازها را اجرا کرد.
- ۱۲:۲۴: reset-guard (BUILD-STALE + ahead-of-mirror — آینه فقط تا فاز ۲
  پوش شده بود) درخت را به 6631a03 برگرداند — **گارد دادهٔ مقدس فاز ۱ BLOCK
  کرد (live-richer-rowcounts) و دیتابیس زنده نجات یافت** — نخستین اثبات
  زندهٔ کارکرد قانون دادهٔ مقدس.
- جلسهٔ دوم (این بسته): بازیابی rollback پانزدهم از reflog (git reset d930d67)
  + پوش فوری آینه (سپر) + بیلد + ری‌استارت + دو-سبز ۲۸۴۴/۰ ×۲ (رکورد) +
  شش گارد به واقعیت ن۰۶۳ + رله زنده (گوشی مالک فعال — ۷۷۷ آیتم در ۲۴س).
- قانون دادهٔ مقدس: sacred-data-guard سه‌لایه (mtime+شمارش+سلامت) در ۴ مسیر
  بازیابی · بکاپ ۱۵دقیقه‌ای Worker (VACUUM) · صفر deleteMany در سینک ·
  ریست=sacred-keep (داده ماند، کد نو).
- UI: هوم یک‌پارچه — ۸ کاشی ریشه (فایل یابی←آگهی←درخواست←معاملات←کارشناسان←
  تطبیق←مغز←تنظیمات) با نام کوتاه؛ M6/M7/ظرف حذف؛ دادهٔ DB ماندگار.
- GLM Probe: مدل GlmProbe + /api/glm/probe (OWNER) + CLI melka-debug ·
  شاهد زنده: health ✓ · melk-public 504 · enums-persian 503 (خنک‌ساز ۶ساعته
  قانون Retry هوشمند) + کش رله (۱۷۵ ساعت).
- پایش: relay-health-check هر ۵د سه‌لایه (نبض/فعالیت/تازگی) + AuditLog +
  RelayStatusCard 🟢🟡🔴 در هوم — شاهد: green سه‌لایه.
- Tier 4: Brier 0.2256 (جلسهٔ ۱) و 0.2392 (جلسهٔ ۲) > 0.20 → HOLD —
  ارتقا فقط با رأی شورا پس از آستانه (دکترین شاهد کمّی).
- حذف کد مرده (فاز ۶): ماژول offline-mode + Old-OTP راستی‌آمایی ·
  Cloudflare proxy ماند (لایهٔ ۳ مسیر جایگزین).

## چگونه بازیابی کنیم؟
پس از بازیابی: (۱) bun install + prisma generate + prisma db push با
schema.prisma همین بسته (۷۰ مدل · +GlmProbe) · (۲) env.platform.json همین
بسته (رلهٔ mobile) · (۳) بیلد با bun run build + بوت با standalone/server.js
· (۴) Worker: bun scripts/runtime/worker.ts (۱۹ کار · قفل TTL خودآزاد) ·
(۵) کد تازهٔ مالک: recovery-scripts/issue-owner-code.ts یا UI «تولید کد نصب»
· (۶) مسیر مالک: Termux → پیست کد نصب → Enter → «✓ اتصال تأیید شد» → اپ →
کدپرسنلی ۴۱۰۰۳۱۳۲۰.
کلیدهای حیاتی: env.platform.json + custom.db + repo.bundle + hardened-relay/
(نسل K + relay-health) + glm-probe/ + recovery-scripts/sacred-data-guard.ts.
EV

# ── ۷) CHAIN.json با لنگر به ۴۰ ──
PREV_HASH=$(sha256sum "upload/.survival/$PREV/MANIFEST.md5" | cut -d' ' -f1)
cat > "$PKG/CHAIN.json" <<CH
{
  "chainIndex": 41,
  "packageName": "PN-042-20261017",
  "prevPackage": "$PREV",
  "prevContentHash": "$PREV_HASH",
  "createdAt": "$TS",
  "law": "بستهٔ ۴۱ به مانیفست کامل بستهٔ ۴۰ لنگر شده است — زنجیرهٔ بازتولیدپذیری"
}
CH
echo "— لنگر به $PREV: ${PREV_HASH:0:16}…"

# ── ۸) MANIFEST.md5 ──
echo "— مهر مانیفست…"
(cd "$PKG" && find . -type f ! -name MANIFEST.md5 -print0 | sort -z | xargs -0 md5sum > MANIFEST.md5)
COUNT=$(wc -l < "$PKG/MANIFEST.md5")

echo ""
echo "═══ بستهٔ بقای ۴۱ کامل: $PKG ═══"
echo "فایل‌ها: $COUNT قلم · حجم کل: $(du -sh "$PKG" | cut -f1)"
