#!/usr/bin/env bash
# ============================================================================
# PN-039 · بستهٔ بقای chainIndex=۴۲ — قانون بقا (هشت گام فهرستها · ن۰۶۴)
# ساخت بستهٔ کامل در upload/.survival/PN-043-20261017/ با لنگر هش به بستهٔ ۴۱
# تازه‌های ن۰۶۴:
#   · گام ۲: پایان قحطی سینک درخواستها — اولویت رله requests/list=1 + تناوب برش دیمن
#   · گام ۳: ستون «تاریخ ثبت» M1 (createdAt — پس از تاریخ وضعیت)
#   · گام ۴: ستون «یادداشت» مالک M1+M2 (ownerNote + PATCH /api/owner-notes · آخرین ستون)
#   · گام ۵: ستون «وضعیت آگهی» M1 (پس از دسته‌بندی — قانون ده‌حالته P6530)
#   · گام ۶: فیلتر نوع ملک چیپی در هر دو فهرست
#   · گام ۷: حذف ستون «نوع ساختمان» از M2 (داده در API دست‌نخورده)
#   · ترمیم خسارت بازنشانی ۱۹:۳۷: env.platform از بستهٔ ۴۲ + APK/QR عمومی + اسکرو db
#   · آینه: ۱۰۰ کامیت گم‌شدهٔ PN-038+ به GitHub برگشت (1425ee0..96258ea) + پوش فوری 53f1c9f
# نام‌گذاری: قرارداد شمارهٔ بسته = chainIndex+1 و سازگار با sort -V گارد
# ============================================================================
set -euo pipefail
cd /home/z/my-project
TS=$(date -u +%FT%TZ)
PKG="upload/.survival/PN-043-20261017"
PREV="PN-042-20261017"

[ -d "upload/.survival/$PREV" ] || { echo "بستهٔ قبلی (۴۱) یافت نشد"; exit 1; }

echo "═══ ساخت بستهٔ بقای ۴۲ · $TS ═══"
mkdir -p "$PKG/evidence-pn039" "$PKG/melka-relay-apk" "$PKG/recovery-scripts" "$PKG/hardened-relay" "$PKG/melka-proxy-worker" "$PKG/glm-probe" "$PKG/owner-notes"

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
on_prop = con.execute("SELECT COUNT(*) FROM PropertyRecord WHERE ownerNote IS NOT NULL").fetchone()[0]
on_req = con.execute("SELECT COUNT(*) FROM RequestRecord WHERE ownerNote IS NOT NULL").fetchone()[0]
models = con.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table'").fetchone()[0]
sz = os.path.getsize(f"{pkg}/custom.db")
print(f"  custom.db · md5={h[:12]}… · integrity={n} · {sz/1024/1024:.1f}MB · tables={models} · breaker={brk} · devices={dev} · relayJobs={rj} · glmProbes={gp} · properties={pr} (notes={on_prop}) · requests={rq} (notes={on_req})")
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

# ── ۳-ب) رلهٔ سخت‌شده (نسل K + سلامت ن۰۶۳ + اولویت ن۰۶۴) ──
cp src/lib/melk-api/relay-script.ts "$PKG/hardened-relay/"
cp src/lib/melk-api/relay.ts "$PKG/hardened-relay/"
cp src/lib/melk-api/relay-jobs.ts "$PKG/hardened-relay/"
cp src/lib/melk-api/catalog-daemon.ts "$PKG/hardened-relay/"
cp src/lib/melk-api/arm-catalog.ts "$PKG/hardened-relay/"
cp src/lib/relay/health.ts "$PKG/hardened-relay/relay-health.ts"
cp src/lib/client/relay-job.ts "$PKG/hardened-relay/"
cp src/lib/melk-api/config.ts "$PKG/hardened-relay/"
cp src/lib/melk-api/provider.ts "$PKG/hardened-relay/"
cp src/lib/melk-api/melk-public.ts "$PKG/hardened-relay/"
cp src/lib/melk-api/sync.ts "$PKG/hardened-relay/sync-sacred.ts"
cp src/app/api/pm/connection/route.ts "$PKG/hardened-relay/pm-connection-route.ts"
cp src/lib/melk-api/circuit-breaker.ts "$PKG/hardened-relay/" 2>/dev/null || true
cp scripts/recovery/sacred-data-guard.ts "$PKG/recovery-scripts/" 2>/dev/null || true

# ── ۳-ج) GLM Probe Mode (ن۰۶۳ · فاز ۳) ──
cp src/lib/glm/probe.ts "$PKG/glm-probe/" 2>/dev/null || true
cp src/app/api/glm/probe/route.ts "$PKG/glm-probe/glm-probe-route.ts" 2>/dev/null || true
cp scripts/melka-debug.ts "$PKG/glm-probe/melka-debug.ts" 2>/dev/null || true

# ── ۳-د) یادداشت مالک (ن۰۶۴ · گام ۴) ──
cp "src/app/api/owner-notes/[entity]/[id]/route.ts" "$PKG/owner-notes/owner-notes-route.ts"
cp src/components/app/shared/OwnerNoteCell.tsx "$PKG/owner-notes/"
cp src/core/repositories/prisma/property.repository.ts "$PKG/owner-notes/" 2>/dev/null || true
cp src/core/repositories/prisma/request.repository.ts "$PKG/owner-notes/" 2>/dev/null || true

# ── ۳-هـ) واکِر melka-proxy (آرشیو دوران Worker) ──
cp -r melka-proxy/src "$PKG/melka-proxy-worker/src" 2>/dev/null || true
cp melka-proxy/wrangler.toml melka-proxy/package.json melka-proxy/deploy.sh "$PKG/melka-proxy-worker/" 2>/dev/null || true
cp upload/.runtime/cloudflare-token.env "$PKG/melka-proxy-worker/cloudflare-token.env" 2>/dev/null || true

# ── ۴) docs + شواهد PN-039 + اسکریپت‌ها ──
cp -r docs "$PKG/docs" 2>/dev/null || echo "(docs غایب)"
cp download/pn039/*.json download/pn039/*.txt download/pn039/*.md download/pn039/*.log "$PKG/evidence-pn039/" 2>/dev/null || true
cp -r scripts/pn039 "$PKG/evidence-pn039/scripts" 2>/dev/null || true
cp scripts/pn036/issue-owner-code.ts "$PKG/recovery-scripts/" 2>/dev/null || true
cp scripts/audit-melka-relay-apk.sh scripts/audit-mobile-relay.sh scripts/audit-relay-matrix.sh scripts/audit-data-sacred.sh "$PKG/recovery-scripts/" 2>/dev/null || true
cp scripts/recovery/audit-head-guard.sh scripts/recovery/auto-recovery.sh scripts/recovery/reset-guard.sh "$PKG/recovery-scripts/" 2>/dev/null || true
cp scripts/log-rotate.sh "$PKG/recovery-scripts/log-rotate.sh" 2>/dev/null || true
cp scripts/pn038/survival-package-41.sh "$PKG/recovery-scripts/" 2>/dev/null || true
cp tests/pn039-lists-columns.test.ts tests/pn020-step1-lists.test.ts tests/pn038-sacred-data.test.ts "$PKG/evidence-pn039/" 2>/dev/null || true
cp worklog.md "$PKG/worklog.md"

# ── ۵) repo.bundle + هویت ──
echo "— باندل گیت…"
git bundle create "$PKG/repo.bundle" --all 2>/dev/null | tail -1 || true
git rev-parse --short HEAD > "$PKG/HEAD"
cat .next/BUILD_ID > "$PKG/BUILD_ID.txt" 2>/dev/null || echo "(BUILD_ID غایب)" || true
cp .next/fingerprint.json "$PKG/FINGERPRINT.json" 2>/dev/null || echo "(fingerprint غایب)"

# ── ۶) EVENTS.md ──
cat > "$PKG/EVENTS.md" <<'EV'
# بستهٔ بقا ۴۲ — PN-039 (هشت گام فهرستها · ن۰۶۴)

## چه گذشت؟
- سفارش هشت‌گام مالک (۱۴۰۵/۰۷/۲۶): راستی‌آزمایی نسخهٔ زندهٔ پس از PN-038 ·
  بروزرسانی چهار فهرست · چهار ستون تازه (تاریخ ثبت / یادداشت ×۲ / وضعیت آگهی) ·
  فیلتر چیپی نوع ملک · حذف ستون نوع ساختمان از فهرست درخواست.
- کشف بحرانی گام ۱: سرور زنده روی بیلد کهنهٔ 1425ee0 (اکتبر ۱۰) بود — بازنشانی
  پلتفرم در ۱۹:۳۷ درخت را کهنه کرده بود؛ reset-guard در ۱۹:۴۳ به 96258ea
  برگرداند اما بیلدِ ۱۹:۳۷ از درخت کهنه ساخته شده بود. شاهد: glm/probe و
  relay/health هر دو 404.
- کشف بحرانی دوم: آینهٔ GitHub ۱۰۰ کامیت عقب بود (1425ee0) — پوشهای PN-038
  هرگز نرسیده بودند. فوراً پوش شد (1425ee0..96258ea) — درس ۵ یک‌بار دیگر
  حیات را نجات داد.
- گام ۲ — ریشهٔ هفت‌روزهٔ راکدمان فهرست درخواست: ایستگاه requests از ۱۰ اکتبر
  در صفحهٔ 287/417 گیرکرده بود + ۴۷۲ expired در صف رله. ریشه: هر صفحهٔ
  requests/list ~۵ثانیه هزینهٔ مبدأ دارد و پشت موج آگهی‌ها/غنی‌سازی‌ها
  (اولویت ۰) در TTL ۱۲۰ث می‌مُرد. درمان: اولویت ۱ برای صفحات requests/list
  (relayPriorityForUrl — گوشی در هر poll اول اینها را برمی‌دارد) + تناوب
  برش‌های دیمن (تیک فرد: درخواست‌ها اول).
- گام ۳-۷: ستون «تاریخ ثبت» (createdAt — دقیق‌ترین لحظهٔ ایجاد در سامانه) بعد
  از تاریخ وضعیت؛ ستون «یادداشت» مالک قابل ویرایش (ownerNote + PATCH
  /api/owner-notes/[entity]/[id] + OwnerNoteCell inline) آخرین ستون هر دو
  فهرست؛ ستون «وضعیت آگهی» بعد از دسته‌بندی (قانون ده‌حالتهٔ P6530 با رنگ
  رجیستری)؛ فیلتر نوع ملک چیپی در هر دو فهرست (چندانتخابی، رنگ متمایز هر
  مقدار)؛ حذف ستون «نوع ساختمان» از فهرست درخواست (داده در API/اکسل
  دست‌نخورده).
- قانون دادهٔ مقدس: سینک ARM هرگز ownerNote را نمی‌نویسد (گارد تست ث-۱/ث-۲) ·
  صفر deleteMany · به‌روزرسانی نقطه‌ای تک‌ستون · db push افزایشی با صفر
  ازدست‌رفتگی (۲۷۸۶۳/۲۵۵۳۰/۷۹۲/۲۹۳ بایت‌به‌بایت ثابت).
- ترمیم خسارت بازنشانی ۱۹:۳۷: env.platform.json از بستهٔ ۴۲ بازسازی شد
  (MELK_ARM_RELAY_MODE=mobile + MELK_PUBLIC_BASE_URL + _pn033) + APK و QR
  عمومی از بستهٔ بقا برگشت + لایهٔ دوم اسکرو (db/.runtime) همگام شد.
- مرز مخزن (PN-012/۱.۳): مسیر owner-notes از updateOwnerNote مخزن می‌نویسد —
  صفر db.* در روت (گارد ۱-م-۱ سبز).
- مانیفست API: ۱۰۹ → ۱۱۰ روت (+owner-notes/[entity]/[id] + آینهٔ v1).
- دو-سبز رکورد: ۲۸۶۸/۰ ×۲ (قبلی ۲۸۴۴) · tsc صفر · lint صفر · گارد ۴۵/۴۵.

## چگونه بازیابی کنیم؟
پس از بازیابی: (۱) bun install + prisma generate + prisma db push با
schema.prisma همین بسته (۷۰ مدل · +ownerNote روی PropertyRecord/RequestRecord)
· (۲) env.platform.json همین بسته (رلهٔ mobile) · (۳) بیلد با bun run build +
بوت با standalone/server.js (نگهبان: scripts/prod-watchdog.sh) · (۴) Worker:
bun scripts/runtime/worker.ts (۱۹ کار · قفل TTL خودآزاد — با env کامل شامل
MELK_TOKEN_KEY تا رمزگشایی خزانهٔ ARM کار کند) · (۵) کد تازهٔ مالک:
recovery-scripts/issue-owner-code.ts یا UI «تولید کد نصب» · (۶) مسیر مالک:
Termux → پیست کد نصب → Enter → «✓ اتصال تأیید شد» → اپ → کدپرسنلی ۴۱۰۰۳۱۳۲۰.
کلیدهای حیاتی: env.platform.json + custom.db + repo.bundle + hardened-relay/
(نسل K + اولویت ن۰۶۴ + دیمن متناوب) + owner-notes/ + glm-probe/ +
recovery-scripts/sacred-data-guard.ts.
EV

# ── ۷) CHAIN.json با لنگر به ۴۱ ──
PREV_HASH=$(sha256sum "upload/.survival/$PREV/MANIFEST.md5" | cut -d' ' -f1)
cat > "$PKG/CHAIN.json" <<CH
{
  "chainIndex": 42,
  "packageName": "PN-043-20261017",
  "prevPackage": "$PREV",
  "prevContentHash": "$PREV_HASH",
  "createdAt": "$TS",
  "law": "بستهٔ ۴۲ به مانیفست کامل بستهٔ ۴۱ لنگر شده است — زنجیرهٔ بازتولیدپذیری (آغاز زنجیره: PN-006 · chainIndex=7)"
}
CH
echo "— لنگر به $PREV: ${PREV_HASH:0:16}…"

# ── ۸) MANIFEST.md5 ──
echo "— مهر مانیفست…"
(cd "$PKG" && find . -type f ! -name MANIFEST.md5 -print0 | sort -z | xargs -0 md5sum > MANIFEST.md5)
COUNT=$(wc -l < "$PKG/MANIFEST.md5")

echo ""
echo "═══ بستهٔ بقای ۴۲ کامل: $PKG ═══"
echo "فایل‌ها: $COUNT قلم · حجم کل: $(du -sh "$PKG" | cut -f1)"
