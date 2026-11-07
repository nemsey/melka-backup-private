#!/usr/bin/env bash
# ============================================================================
# PN-031-C · بستهٔ بقای chainIndex=31 — قانون بقا (سند ۰۴۰ · PN-031-C)
# ساخت بستهٔ کامل در upload/.survival/PN-032-20261013/ با لنگر هش به بستهٔ ۳۰
# تازه‌ها: اسکیمای کد بخشنده (۳ فیلد) + اسکریپت recovery/head-guard + شواهد PN-031-B/C
# ============================================================================
set -euo pipefail
cd /home/z/my-project
TS=$(date -u +%FT%TZ)
PKG="upload/.survival/PN-032-20261013"
PREV="PN-031-20261012"

[ -d "upload/.survival/$PREV" ] || { echo "بستهٔ قبلی (۳۰) یافت نشد"; exit 1; }

echo "═══ ساخت بستهٔ بقای ۳۱ · $TS ═══"
mkdir -p "$PKG/evidence-pn031c"

# ── ۱) فایلهای پایه ──
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

# ── ۳) docs + شواهد ──
cp -r docs "$PKG/docs" 2>/dev/null || echo "(docs غایب)"
cp download/pn031c/*.json download/pn031c/*.md "$PKG/evidence-pn031c/" 2>/dev/null || true
cp -r scripts/pn031c "$PKG/evidence-pn031c/scripts" 2>/dev/null || true
# اسکریپت‌های بقای بحرانی (قانون بقا سند ۰۴۰: اسکریپت head-guard در بسته)
mkdir -p "$PKG/recovery-scripts"
cp scripts/recovery/audit-head-guard.sh scripts/recovery/auto-recovery.sh scripts/recovery/reset-guard.sh "$PKG/recovery-scripts/" 2>/dev/null || true
cp scripts/audit-mobile-relay.sh "$PKG/recovery-scripts/" 2>/dev/null || true
cp scripts/pn031b/live-simulation.sh "$PKG/evidence-pn031c/" 2>/dev/null || true

# ── ۴) repo.bundle + هویت ──
echo "— باندل گیت…"
git bundle create "$PKG/repo.bundle" --all 2>/dev/null | tail -1 || true
git rev-parse --short HEAD > "$PKG/HEAD"
cat .next/BUILD_ID > "$PKG/BUILD_ID.txt" 2>/dev/null || echo "(BUILD_ID غایب)" || true
cp .next/fingerprint.json "$PKG/FINGERPRINT.json" 2>/dev/null || echo "(fingerprint غایب)"

# ── ۵) EVENTS.md ──
cat > "$PKG/EVENTS.md" <<'EV'
# بستهٔ بقا ۳۱ — PN-031-C (شورای عالی ملکا · جلسهٔ فوق‌العاده ۰۴۰)

## چه گذشت؟
- چرخهٔ خطای رله مالک (جلسه‌های ۰۳۸→۰۴۰): 404 (بیلد کهنه) → 403 (کد یک‌بارمصرف
  در تلاش ناموفق می‌سوخت) — ریشهٔ ساختاری، نه خطای مالک.
- PN-031-HOTFIX (۰۳۸): قانون URL عمومی — getPublicBaseUrl برای هر URL بیرونی.
- PN-031-B (۰۳۹): احیای رله پس از بازنشانی هشتم + گارد head-guard
  (scripts/recovery/audit-head-guard.sh · Worker هر ۱۰ دقیقه · نرخ‌حد ۳۰د · جبران خودکار).
- PN-031-C (۰۴۰ · همین بسته): کد راه‌اندازی بخشنده — پایان چرخهٔ ۴۰۳:
  * سه فیلد تازه روی RelayDevice: attemptCount / maxAttempts(3) / lastAttemptAt
  * تلاش ناموفق کد را نمی‌سوزاند؛ سوختن نهایی فقط با اولین Poll موفق گوشی
    (markRelayEnrollCompleted در روت poll)
  * پیام خطای متمایز: used/limit (سوخته) · expired (منقضی) · invalid (نامعتبر) · revoked
  * روت تازه /api/admin/relay/code-status + آینهٔ v1 (مانیفست ۱۰۷)
  * UI: وضعیت کد هر دستگاه (نصب کامل ✓ / در حال نصش n/3 / سوخته / منقضی)
  * بنر تازگی بیلد در تنظیمات (از PN-031-B)
  * دروازهٔ زندهٔ سه‌گانه از URL عمومی: A (تلاش دوم با همان کد → ۲۰۰) ·
    B (تلاش چهارم → ۴۰۳ limit) · C (head-guard) — همه PASS
- اسکیما عوض شد (۳ فیلد تازه — همین بسته شامل schema.prisma تازه است).
- env: بدون کلید تازه (MELK_ARM_OFFLINE=1 پابرجا تا تست تونل مالک).
- دو-سبز ۲۶۷۶/۰ ×۲ (رکورد) · tsc صفر · lint صفر خطا · گارد ۴۳/۴۳.

## بازیابی
مثل بسته‌های قبلی — زنجیرهٔ هش: لنگر این بسته به بستهٔ ۳۰ (PN-031).
پس از بازیابی: (۱) prisma db push با schema.prisma همین بسته (۳ فیلد تازه) ·
(۲) env.platform.json همین بسته (MELK_PUBLIC_BASE_URL + MELK_ARM_RELAY_MODE=mobile +
MELK_ARM_OFFLINE=1 تا تست تونل) · (۳) فعال‌سازی head-guard در Worker خودکار است.
کلیدهای حیاتی: env.platform.json + scripts/recovery/audit-head-guard.sh (در recovery-scripts/).
EV

# ── ۶) CHAIN.json با لنگر به ۳۰ ──
PREV_HASH=$(sha256sum "upload/.survival/$PREV/MANIFEST.md5" | cut -d' ' -f1)
cat > "$PKG/CHAIN.json" <<CH
{
  "chainIndex": 31,
  "packageName": "PN-032-20261013",
  "prevPackage": "$PREV",
  "prevContentHash": "$PREV_HASH",
  "createdAt": "$TS",
  "law": "بستهٔ ۳۱ به مانیفست کامل بستهٔ ۳۰ لنگر شده است — زنجیرهٔ بازتولیدپذیری"
}
CH
echo "— لنگر به $PREV: ${PREV_HASH:0:16}…"

# ── ۷) MANIFEST.md5 ──
echo "— مهر مانیفست…"
(cd "$PKG" && find . -type f ! -name MANIFEST.md5 -print0 | sort -z | xargs -0 md5sum > MANIFEST.md5)
COUNT=$(wc -l < "$PKG/MANIFEST.md5")

echo ""
echo "═══ بستهٔ بقای ۳۱ کامل: $PKG ═══"
echo "فایلها: $COUNT قلم · حجم کل: $(du -sh "$PKG" | cut -f1)"
