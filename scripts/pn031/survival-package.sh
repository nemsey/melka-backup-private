#!/usr/bin/env bash
# ============================================================================
# PN-031 · بستهٔ بقای chainIndex=30 — قانون بقا
# ساخت بستهٔ کامل در upload/.survival/PN-031-20261012/ با لنگر هش به بستهٔ ۲۹
# ============================================================================
set -euo pipefail
cd /home/z/my-project
TS=$(date -u +%FT%TZ)
PKG="upload/.survival/PN-031-20261012"
PREV="PN-030-20261011"

[ -d "upload/.survival/$PREV" ] || { echo "بستهٔ قبلی یافت نشد"; exit 1; }

echo "═══ ساخت بستهٔ بقای ۳۰ · $TS ═══"
mkdir -p "$PKG/evidence-pn031"

# ── ۱) فایلهای پایه ──
cp AGENTS.md "$PKG/" 2>/dev/null || echo "(AGENTS.md غایب — رد شد)"
cp bun.lock package.json env.platform.json "$PKG/"
printf 'DATABASE_URL=file:/home/z/my-project/db/custom.db\n' > "$PKG/env.txt"

# ── ۲) پایگاه داده (بکاپ گرم VACUUM INTO — snapshot سازگار) ──
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
cp download/pn031/*.json download/pn031/*.md "$PKG/evidence-pn031/" 2>/dev/null || true
cp download/pn031/OWNER-SETUP-GUIDE.html "$PKG/evidence-pn031/" 2>/dev/null || true
cp -r scripts/pn031 "$PKG/evidence-pn031/scripts" 2>/dev/null || true

# ── ۴) repo.bundle + هویت ──
echo "— باندل گیت…"
git bundle create "$PKG/repo.bundle" --all 2>/dev/null | tail -1 || true
git rev-parse --short HEAD > "$PKG/HEAD"
cat .next/BUILD_ID > "$PKG/BUILD_ID.txt"
cp .next/fingerprint.json "$PKG/FINGERPRINT.json" 2>/dev/null || echo "(fingerprint غایب)"

# ── ۵) EVENTS.md ──
cat > "$PKG/EVENTS.md" <<'EV'
# بستهٔ بقا ۳۰ — PN-031 (شورای عالی ملکا · جلسهٔ فوق‌العاده ۰۳۷)

## چه گذشت؟
- کشف قفل ورود: سرور زنده پس از بازنشانی هفتم روی بیلد قدیمی PN-027 (1425ee0)
  اجرا می‌شد — کد PN-028/029/030 غایب بود (otp-burn → 404) — اصلاح: بیلد از HEAD + ری‌استارت
- اجرای کامل PN-031 (رلهٔ موبایل ایرانی · صفر هزینه · صفر مکاتبه):
  * دو جدول تازه: RelayDevice + RelayQueue (اسکیمای دوقلو ۶۹=۶۹)
  * کتابخانهٔ relay.ts — HMAC دوجهتهٔ عین قرارداد PN-030 + صف pull-based
    (claim اتمیک · دی‌داپ ۱۵ث · TTL ۴۵ث) + امضای دوجهتهٔ آیتم صف
  * proxyFetch حالت سوم: MELK_ARM_RELAY_MODE=mobile (اولویت بر Worker —
    سد جغرافیایی فایروال ملک تبریز کلودفلر را هم بلاک می‌کند)
  * ۱۰ روت (poll · result · bootstrap · admin×۵ · browser×۲) + آینه‌های v1 (105)
  * اسکریپت Termux با پیکربندی تزریقی ضدتزریق + whitelist سمت گوشی + wake-lock
  * UI راه‌اندازی رله در تنظیمات (فقط OWNER): QR + دستور نصب + تست تونل + ابطال
  * پشتیبان مرورگری (رویکرد B سند) با احراز نشست
  * تست سنتزی زندهٔ شش‌گامی: MACHINERY-VERIFIED — کل قرارداد کار می‌کند؛
    تنها حلقهٔ باقی‌مانده گوشی واقعی مالک در ایران (دقیقهٔ صفر تا دو مالک)
- env تازه: MELK_ARM_RELAY_MODE=mobile (این فایل env.platform.json همین بسته)
  · پرچم MELK_ARM_OFFLINE=1 پابرجا تا قبولی «تست تونل» از گوشی واقعی
- وابستگی تازه: qrcode — lockfile عوض شد (بستهٔ تازه لازم بود — همین بسته)
- دو-سبز ۲۶۱۷/۰ ×۲ (رکورد) · tsc صفر · lint صفر خطا · گارد ۴۲/۴۲
- درس ثبت‌شده: نشست env در تست‌ها آبشاری است — کلید تازه باید در WATCHED_KEYS
  تست platform-env ثبت شود (MELK_ARM_RELAY_MODE ثبت شد)

## بازیابی
مثل بسته‌های قبلی — زنجیرهٔ هش: لنگر این بسته به بستهٔ ۲۹ (PN-030).
کلیدهای حیاتی این بسته: env.platform.json شامل MELK_ARM_RELAY_MODE + MELK_PROXY_SECRET
+ MELK_ARM_OFFLINE (پس از تست تونل مالک برداشته می‌شود — طبق رویهٔ چهارگامه).
EV

# ── ۶) CHAIN.json با لنگر به ۲۹ ──
PREV_HASH=$(sha256sum "upload/.survival/$PREV/MANIFEST.md5" | cut -d' ' -f1)
cat > "$PKG/CHAIN.json" <<CH
{
  "chainIndex": 30,
  "packageName": "PN-031-20261012",
  "prevPackage": "$PREV",
  "prevContentHash": "$PREV_HASH",
  "createdAt": "$TS",
  "law": "بستهٔ ۳۰ به مانیفست کامل بستهٔ ۲۹ لنگر شده است — زنجیرهٔ بازتولیدپذیری"
}
CH
echo "— لنگر به $PREV: ${PREV_HASH:0:16}…"

# ── ۷) MANIFEST.md5 ──
echo "— مهر مانیفست…"
(cd "$PKG" && find . -type f ! -name MANIFEST.md5 -print0 | sort -z | xargs -0 md5sum > MANIFEST.md5)
COUNT=$(wc -l < "$PKG/MANIFEST.md5")

echo ""
echo "═══ بستهٔ بقای ۳۰ کامل: $PKG ═══"
echo "فایلها: $COUNT قلم · حجم کل: $(du -sh "$PKG" | cut -f1)"
ls "$PKG" | head -20
