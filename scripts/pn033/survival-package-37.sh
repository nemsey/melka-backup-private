#!/usr/bin/env bash
# ============================================================================
# PN-033 · بستهٔ بقای chainIndex=37 — قانون بقا (سند ۰۵۴ · شورای عالی ملکا)
# ساخت بستهٔ کامل در upload/.survival/PN-038-20261016/ با لنگر هش به بستهٔ ۳۶
# تازه‌ها: رفع قفل سخت فیوز PN-029 (حذف رکوردها + خاموشی دائمی env) · پاکسازی
# کامل DB (فقط ۱ دستگاه فعال) · UI هدف ن۰۵۴ (فقط Termux + کدپرسنلی + OTP) ·
# حذف کلیدهای دوران Worker از env/escrow · ۱۴ تست گارد تمیزکاری
# نام‌گذاری: قرارداد شمارهٔ بسته = chainIndex+1 و سازگار با sort -V گارد
# ============================================================================
set -euo pipefail
cd /home/z/my-project
TS=$(date -u +%FT%TZ)
PKG="upload/.survival/PN-038-20261016"
PREV="PN-037-20261016"

[ -d "upload/.survival/$PREV" ] || { echo "بستهٔ قبلی (۳۶) یافت نشد"; exit 1; }

echo "═══ ساخت بستهٔ بقای ۳۷ · $TS ═══"
mkdir -p "$PKG/evidence-pn033" "$PKG/melka-relay-apk" "$PKG/recovery-scripts" "$PKG/hardened-relay" "$PKG/melka-proxy-worker"

# ── ۱) فایل‌های پایه ──
cp AGENTS.md "$PKG/" 2>/dev/null || echo "(AGENTS.md غایب — رد شد)"
cp bun.lock package.json env.platform.json prisma/schema.prisma "$PKG/"
mkdir -p "$PKG/prisma"
cp prisma/schema.prisma "$PKG/prisma/"
printf 'DATABASE_URL=file:/home/z/my-project/db/custom.db\n' > "$PKG/env.txt"

# ── ۲) پایگاه داده (بکاپ گرم VACUUM INTO — پس از پاکسازی: فیوز ۰ رکورد · ۱ دستگاه) ──
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
sz = os.path.getsize(f"{pkg}/custom.db")
print(f"  custom.db · md5={h[:12]}… · integrity={n} · {sz/1024/1024:.1f}MB · breaker={brk} · devices={dev}")
PYEOF

# ── ۳) APK + پروژهٔ اندروید + QR مالک (آرشیو دوران APK — UI حذف شد اما بقا می‌ماند) ──
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

# ── ۳-ب) اسکریپت سخت‌شدهٔ رله + ماژول فیوز (منبع حقیقت خاموشی دائمی) ──
cp src/lib/melk-api/relay-script.ts "$PKG/hardened-relay/"
cp src/lib/melk-api/relay.ts "$PKG/hardened-relay/"
cp src/lib/melk-api/circuit-breaker.ts "$PKG/hardened-relay/"

# ── ۳-ج) واکِر melka-proxy (آرشیو دوران Worker — env پاک شد اما سورس بقا می‌ماند) ──
cp -r melka-proxy/src "$PKG/melka-proxy-worker/src"
cp melka-proxy/wrangler.toml melka-proxy/package.json melka-proxy/deploy.sh "$PKG/melka-proxy-worker/" 2>/dev/null || true
cp upload/.runtime/cloudflare-token.env "$PKG/melka-proxy-worker/cloudflare-token.env" 2>/dev/null || true

# ── ۴) docs + شواهد PN-033 + اسکریپت‌ها ──
cp -r docs "$PKG/docs" 2>/dev/null || echo "(docs غایب)"
cp download/pn033/*.json download/pn033/*.txt "$PKG/evidence-pn033/" 2>/dev/null || true
cp download/pn033/ui-cleanup-proof.png "$PKG/evidence-pn033/" 2>/dev/null || true
cp -r scripts/pn033 "$PKG/evidence-pn033/scripts" 2>/dev/null || true
cp scripts/pn031i/live-gate.sh scripts/pn031i/issue-owner-code.ts "$PKG/recovery-scripts/" 2>/dev/null || true
cp scripts/audit-melka-relay-apk.sh scripts/audit-mobile-relay.sh "$PKG/recovery-scripts/" 2>/dev/null || true
cp scripts/recovery/audit-head-guard.sh scripts/recovery/auto-recovery.sh scripts/recovery/reset-guard.sh "$PKG/recovery-scripts/" 2>/dev/null || true
cp scripts/log-rotate.sh "$PKG/recovery-scripts/log-rotate.sh" 2>/dev/null || true
cp scripts/pn032/survival-package-36.sh "$PKG/recovery-scripts/" 2>/dev/null || true
cp tests/pn033-cleanup.test.ts "$PKG/evidence-pn033/" 2>/dev/null || true
cp worklog.md "$PKG/worklog.md"

# ── ۵) repo.bundle + هویت ──
echo "— باندل گیت…"
git bundle create "$PKG/repo.bundle" --all 2>/dev/null | tail -1 || true
git rev-parse --short HEAD > "$PKG/HEAD"
cat .next/BUILD_ID > "$PKG/BUILD_ID.txt" 2>/dev/null || echo "(BUILD_ID غایب)" || true
cp .next/fingerprint.json "$PKG/FINGERPRINT.json" 2>/dev/null || echo "(fingerprint غایب)"

# ── ۶) EVENTS.md ──
cat > "$PKG/EVENTS.md" <<'EV'
# بستهٔ بقا ۳۷ — PN-033 (شورای عالی ملکا · جلسهٔ ۰۵۴)

## چه گذشت؟
- گزارش مالک (جلسهٔ ۰۵۴): تونل زنده است اما «قفل سخت ۲۴ ساعتهٔ فیوز فعال است —
  تلاش بعدی تا ۱۲ ساعت و ۲۷ دقیقه دیگر مجاز است». فیوز PN-029 از دوران جنگ
  (وقتی هیچ راهی نبود) سه شکست پیاپیِ مسدود را قفل ۲۴ ساعته کرده بود و حتی با
  مسیر زندهٔ Termux، هر درخواست OTP مالک را می‌بست.
- شورا دستور PN-033 صادر کرد: رفع قفل + پاکسازی کامل (DB/UI/env) + تمرکز بر
  Termux. بیانیهٔ مالک: «قفل فیوز را حذف کن. تمام تنظیمات مازاد را پاک کن.
  فقط رلهٔ Termux بماند.»
- اجرای GLM (پنج فاز):
  · فاز ۱: هر ۳ رکورد قفل (arus/pm/gap — قفل تا ۲۲:۰۴Z) حذف + درگاه باز
    تأیید + کشف: سرور کهنه رکورد شکست تازه ثبت می‌کند → درس: خاموشی دائمی
    (MELK_ARM_CIRCUIT_DISABLED=1) پیش از پاکسازی حیاتی است.
  · فاز ۲: ۵۱ دستگاه → ۵۰ مرده حذف → فقط poco-f3-b816dd (poll ~۲۵ث ·
    served=11). انتخاب نگه‌ارنده پویا — گوشی چند-نشستی Termux دارد.
  · فاز ۳: UI به معماری هدف: RelaySetupSection مینیمال (بدون APK/QR/
    رلهٔ مرورگری/فهرست دستگاه/دکمهٔ ثبت) · ورود مجدد بدون کارت Worker/آفلینی ·
    پیکره بدون بنر آفلینی/فیوز/IP · ARM تکراری حذف · سرویس‌ها ARM/PM/APU.
  · فاز ۴: MELK_ARM_PROXY_URL + MELK_RELAY_ALT_URL حذف از env+example+
    BOOT_SECRET_KEYS+اسکرو دوجهته · MELK_ARM_CIRCUIT_DISABLED=1 نصب (بقا).
  · فاز ۵: دو-سبز ۲۷۷۸/۰×۲ · گارد ۴۴/۴۴ · بیلد 9f3e707+ · تونل زنده
    (connect ✓ · خطا ۰ · نشت ۰ · فیوز ۰) · آینه همگا.
- دروازهٔ نهایی مالک: تنظیمات ← ورود مجدد ← کدپرسنلی ۴۱۰۰۳۱۳۲۰ ← ارسال کد ←
  OTP. قفل فیوز دیگر باز نمی‌گردد (خاموشی دائمی در env + escrow سه‌لایه).

## چگونه بازیابی کنیم؟
پس از بازیابی: (۱) bun install + prisma db push با schema.prisma همین بسته ·
(۲) env.platform.json همین بسته (فیوز خاموش · رلهٔ mobile) · (۳) بیلد با bun
run build + بوت scripts/prod-watchdog.sh · (۴) Worker: bun
scripts/runtime/worker.ts (قفل runtime:worker با TTL ۹۰ث خودآزاد است) ·
(۵) کد تازهٔ مالک: recovery-scripts/issue-owner-code.ts · (۶) تست تونل از
UI مالک یا scripts/pn033/tunnel-gate.sh.
کلیدهای حیاتی: env.platform.json + custom.db (تک‌دستگاه) + repo.bundle +
hardened-relay/ (شامل circuit-breaker.ts خاموش‌شونده) + recovery-scripts/.
آرشیو دوران‌گذشته (بقا اما بی‌استفاده): melka-relay-apk/ + melka-proxy-worker/.
EV

# ── ۷) CHAIN.json با لنگر به ۳۶ ──
PREV_HASH=$(sha256sum "upload/.survival/$PREV/MANIFEST.md5" | cut -d' ' -f1)
cat > "$PKG/CHAIN.json" <<CH
{
  "chainIndex": 37,
  "packageName": "PN-038-20261016",
  "prevPackage": "$PREV",
  "prevContentHash": "$PREV_HASH",
  "createdAt": "$TS",
  "law": "بستهٔ ۳۷ به مانیفست کامل بستهٔ ۳۶ لنگر شده است — زنجیرهٔ بازتولیدپذیری"
}
CH
echo "— لنگر به $PREV: ${PREV_HASH:0:16}…"

# ── ۸) MANIFEST.md5 ──
echo "— مهر مانیفست…"
(cd "$PKG" && find . -type f ! -name MANIFEST.md5 -print0 | sort -z | xargs -0 md5sum > MANIFEST.md5)
COUNT=$(wc -l < "$PKG/MANIFEST.md5")

echo ""
echo "═══ بستهٔ بقای ۳۷ کامل: $PKG ═══"
echo "فایل‌ها: $COUNT قلم · حجم کل: $(du -sh "$PKG" | cut -f1)"
