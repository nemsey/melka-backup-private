#!/usr/bin/env bash
# ============================================================================
# PN-031-F · بستهٔ بقای chainIndex=33 — قانون بقا (سند ۰۴۵ · PN-031-F)
# ساخت بستهٔ کامل در upload/.survival/PN-034-20261014/ با لنگر هش به بستهٔ ۳۲
# تازه‌ها: شواهد PN-031-E (سه رفع باگ حیاتی + تست زندهٔ رله PASS) + PN-031-F
# (کد مالک + QR + APK مستقر + head-guard تست‌شده) + اسکریپت سخت‌شدهٔ رله
# نام‌گذاری: قرارداد شمارهٔ بسته = chainIndex+1 و سازگار با sort -V گارد
# ============================================================================
set -euo pipefail
cd /home/z/my-project
TS=$(date -u +%FT%TZ)
PKG="upload/.survival/PN-034-20261014"
PREV="PN-033-20261013"

[ -d "upload/.survival/$PREV" ] || { echo "بستهٔ قبلی (۳۲) یافت نشد"; exit 1; }

echo "═══ ساخت بستهٔ بقای ۳۳ · $TS ═══"
mkdir -p "$PKG/evidence-pn031e" "$PKG/melka-relay-apk" "$PKG/recovery-scripts" "$PKG/hardened-relay"

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
cp download/pn031e/qr-install.png "$PKG/melka-relay-apk/qr-install.png"
cp download/pn031e/OWNER-GUIDE.html "$PKG/melka-relay-apk/OWNER-GUIDE.html"
cp melka-relay-android/melka-relay.jks "$PKG/melka-relay-apk/keystore.jks"
rsync -a --exclude 'build/' --exclude '.gradle/' melka-relay-android/ "$PKG/melka-relay-apk/project/" 2>/dev/null || {
  mkdir -p "$PKG/melka-relay-apk/project"
  cp -r melka-relay-android/app "$PKG/melka-relay-apk/project/" 2>/dev/null || true
  cp melka-relay-android/*.kts melka-relay-android/*.properties melka-relay-android/.gitignore "$PKG/melka-relay-apk/project/" 2>/dev/null || true
}

# ── ۳-ب) اسکریپت سخت‌شدهٔ رله (منبع حقیقت + منطق احراز) ──
cp src/lib/melk-api/relay-script.ts "$PKG/hardened-relay/"
cp src/lib/melk-api/relay.ts "$PKG/hardened-relay/"

# ── ۴) docs + شواهد + اسکریپت‌ها ──
cp -r docs "$PKG/docs" 2>/dev/null || echo "(docs غایب)"
cp download/pn031e/*.json download/pn031e/*.md download/pn031e/*.log "$PKG/evidence-pn031e/" 2>/dev/null || true
cp download/pn031e/qr-install.png "$PKG/evidence-pn031e/" 2>/dev/null || true
cp -r scripts/pn031e "$PKG/evidence-pn031e/scripts" 2>/dev/null || true
cp scripts/audit-melka-relay-apk.sh scripts/audit-mobile-relay.sh "$PKG/recovery-scripts/" 2>/dev/null || true
cp scripts/recovery/audit-head-guard.sh scripts/recovery/auto-recovery.sh scripts/recovery/reset-guard.sh "$PKG/recovery-scripts/" 2>/dev/null || true
cp scripts/pn031d/survival-package-32.sh "$PKG/recovery-scripts/" 2>/dev/null || true
cp worklog.md "$PKG/worklog.md"

# ── ۵) repo.bundle + هویت ──
echo "— باندل گیت…"
git bundle create "$PKG/repo.bundle" --all 2>/dev/null | tail -1 || true
git rev-parse --short HEAD > "$PKG/HEAD"
cat .next/BUILD_ID > "$PKG/BUILD_ID.txt" 2>/dev/null || echo "(BUILD_ID غایب)" || true
cp .next/fingerprint.json "$PKG/FINGERPRINT.json" 2>/dev/null || echo "(fingerprint غایب)"

# ── ۶) EVENTS.md ──
cat > "$PKG/EVENTS.md" <<'EV'
# بستهٔ بقا ۳۳ — PN-031-F (شورای عالی ملکا · جلسهٔ فوق‌العاده ۰۴۵)

## چه گذشت؟
- PN-031-E (شورا-ن۰۴۴): ادامهٔ اجباری پس از نهمین بازنشانی پلتفرم از نقطهٔ توقف.
  سه باگ حیاتی و پنهان کشف و رفع شد:
  (۱) بن‌بست lastSeenAt: سرور فقط به دستگاهی صف می‌داد که «برخط» بود، اما
      lastSeenAt فقط هنگام claim آیتم تازه می‌شد → با صف خالی دستگاه هرگز برخط
      نمی‌شد → صف همیشه خالی (مرغ-و-تخم‌مرغ). رفع: هر Poll موفق lastSeenAt را
      تازه می‌کند (noteRelayPollSeen) — ۴ تست F-1..F-4.
  (۲) باگ تاریخی signed_curl از PN-031 اولیه: تابع امضا می‌ساخت ولی URL را به
      curl نمی‌داد → هر Poll روی گوشی با کد ۲ (آرگومان ناقص) می‌مرد و هرگز به
      سرور نمی‌رسید — ریشهٔ هر ۴ شکست نصب مالک. رفع + ۴ تست G-1..G-4.
      درس ماندگار: شبیه‌سازی ≠ اجرای واقعی — کشف فقط با اجرای واقعی اسکریپت.
  (۳) بیلد آمیخته: Next.js standalone ماژول‌ها را فقط در بوت می‌خواند → HTML
      تازه + API کهنه در حافظه. درس: هر تست سرور را خودش ری‌استارت می‌کند و
      BUILD_ID را راستی‌آزمایی می‌کند.
- فاز C کامل: اسکریپت واقعی رله از اینترنت اجرا شد — Poll به سرور رسید
  (lastSeenAt + enrolledAt غیرNULL) · clock-sync ✓ · رد stale با serverTime ✓ ·
  AuditLog(RELAY_POLL_REJECT) ✓ — شاهد live-relay-test.json (VERDICT: PASS).
- PN-031-F (شورا-ن۰۴۵ · همین بسته): ادامه از فاز D تا H.
  فاز D: کد تازهٔ مالک poco-f3-352f68 از URL عمومی صادر شد + QR 640px در
  ۴ مکان + ۴ لینک ۲۰۰ + روت QR تنظیمات + OWNER-GUIDE.html ۲۰۰ (429 پس از
  پایان پنجرهٔ ۱۵دقیقه‌ای خودش رفع شد).
  فاز E: APK امضاشدهٔ PN-031-D (sha256 منطبق 20e5967f…) در مسیر تحویل
  pn031e مستقر + لینک ۲۰۰ با ۵٬۵۸۷٬۹۶۵ بایت کامل + گارد APK سبز.
  فاز F: head-guard کامل — Worker job هر ۱۰ دقیقه؛ تست جبران با لت واقعی:
  زنده f28c601 ≠ HEAD 3745a29 → rebuild → VERIFIED → OK build-equals-head؛
  بنر سبز «سرور روی HEAD است» (verdict=FRESH).
- رفع باگ شاهد فاز D (درس تکرار PN-031-C): print داخل ریدایرکت heredoc —
  شاهد JSON بازسازی شد و اسکریپت برای همیشه اصلاح شد.

## بازیابی
مثل بسته‌های قبلی — زنجیرهٔ هش: لنگر این بسته به بستهٔ ۳۲ (PN-033-20261013).
پس از بازیابی: (۱) bun install + prisma db push با schema.prisma همین بسته ·
(۲) env.platform.json همین بسته · (۳) APK آمادهٔ نصب در melka-relay-apk/
(sha256 در apk-build.json) + keystore.jks + پروژهٔ کامل برای بازسازی ·
(۴) اسکریپت سخت‌شدهٔ رله (hardened-relay/relay-script.ts) — منبع حقیقت clock-sync ·
(۵) صدور کد تازهٔ مالک: scripts/pn031e/issue-owner-code.sh.
کلیدهای حیاتی: env.platform.json + APK + keystore.jks + repo.bundle + hardened-relay/.
EV

# ── ۷) CHAIN.json با لنگر به ۳۲ ──
PREV_HASH=$(sha256sum "upload/.survival/$PREV/MANIFEST.md5" | cut -d' ' -f1)
cat > "$PKG/CHAIN.json" <<CH
{
  "chainIndex": 33,
  "packageName": "PN-034-20261014",
  "prevPackage": "$PREV",
  "prevContentHash": "$PREV_HASH",
  "createdAt": "$TS",
  "law": "بستهٔ ۳۳ به مانیفست کامل بستهٔ ۳۲ لنگر شده است — زنجیرهٔ بازتولیدپذیری"
}
CH
echo "— لنگر به $PREV: ${PREV_HASH:0:16}…"

# ── ۸) MANIFEST.md5 ──
echo "— مهر مانیفست…"
(cd "$PKG" && find . -type f ! -name MANIFEST.md5 -print0 | sort -z | xargs -0 md5sum > MANIFEST.md5)
COUNT=$(wc -l < "$PKG/MANIFEST.md5")

echo ""
echo "═══ بستهٔ بقای ۳۳ کامل: $PKG ═══"
echo "فایل‌ها: $COUNT قلم · حجم کل: $(du -sh "$PKG" | cut -f1)"
