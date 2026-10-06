#!/usr/bin/env bash
# ============================================================
# build-package-p6549.sh — بستهٔ بقا chainIndex=8 (P6549 — قانون ۰۳۵)
# ساختار عین بسته‌های قبل + زنجیرهٔ هش (previousChainMd5 = md5 مانیفست بستهٔ ۷)
# داده: DB سازگار (VACUUM INTO) · کد: repo.bundle لاغر (پس از purge قانون ۰۳۵-A)
# اجرا: bash scripts/recovery-034/build-package-p6549.sh
# ============================================================
set -euo pipefail
REPO="/home/z/my-project"
SURV="$REPO/upload/.survival"
PKGNAME="P6549-20261004"
PKG="$SURV/$PKGNAME"
PREV="$SURV/P6548-recovery-20261004"

mkdir -p "$PKG"

# ── کد: باندل کامل تاریخچه (اکنون لاغر — ۴۵MB پس از purge) ──
git -C "$REPO" bundle create "$PKG/repo.bundle" --all 2>/dev/null

# ── داده: اسنپ‌شات سازگار DB ──
bun "$REPO/scripts/snapshot-db.ts" "$PKG/custom.db"

# ── اسناد بقای حیاتی ──
cp -a "$REPO/AGENTS.md" "$PKG/"
cp -a "$REPO/worklog.md" "$PKG/"
cp -a "$REPO/package.json" "$PKG/"
cp -a "$REPO/prisma/schema.prisma" "$PKG/"
cp -a "$REPO/env.platform.json" "$PKG/" 2>/dev/null || true
cp -a "$REPO/.env" "$PKG/env.txt" 2>/dev/null || true
cp -a "$REPO/bun.lock" "$PKG/" 2>/dev/null || true

# ── شواهد P6549 ──
mkdir -p "$PKG/evidence-p6549"
cp -a "$REPO/download/p6549/columns-coverage.json" "$PKG/evidence-p6549/" 2>/dev/null || true
cp -a "$REPO/download/p6549/palette-evidence.json" "$PKG/evidence-p6549/" 2>/dev/null || true
cp -a "$REPO/download/p6549/lighthouse-home.json" "$PKG/evidence-p6549/" 2>/dev/null || true
cp -a "$REPO/download/p6549/screenshots" "$PKG/evidence-p6549/screenshots" 2>/dev/null || true
cp -a "$REPO/upload/.mirror/push-log.jsonl" "$PKG/evidence-p6549/" 2>/dev/null || true
cp -a "$SURV/recovery-log.jsonl" "$PKG/evidence-p6549/" 2>/dev/null || true

# ── نقشهٔ وقایع ──
cat > "$PKG/EVENTS.md" <<'EOF'
# نقشهٔ وقایع — P6549 (دستور پنج‌گام + دو قانون ۰۳۵)

**سند:** ملکا-شورا-۱۴۰۵-۰۳۵-A/B · **پیش‌نیاز:** بازیابی حادثهٔ چهارم (P6549-recovery)

## خط زمانی (UTC)

- **۰۶:۱۱–۰۶:۳۴** — BLOCK 0/1: تشخیص حادثهٔ چهارم (HEAD=76ed3d4 بدون کامیت‌های بازیابی؛ سرور با کد کهنه سرو می‌کرد) + بازیابی کامل از بستهٔ بقا P6548 (reset به 2498719 + DB ۱۶۶MB + چهار دیمن) + بازگردانی ۱۶۷ فایل upload که reset پاک کرده بود (از آبجکت‌های کامیت بوت پلتفرم) + درمان ریشه‌ای: repo.tar خودتازه (رفع خانوادهٔ حادثات «اسنپ‌شات کهنه» برای همیشه)
- **۰۶:۳۵–۰۷:۲۰** — گام‌های ۱-۴ (حسابرسی): پوشش سطح-DB همهٔ ستون‌های چهارگانه → دو گپ واقعی: آدرس M4 (هرگز وجود نداشت) + موبایل متقاضی M2 (۸٫۹٪)
  * **شاهکار endpoint:** کشف زندهٔ `realtors/info/contactInfo` → `contactInfo.address` (PM) → backfill ۱۴۱/۱۴۲ = ۹۹٫۳٪ + ستون آدرس M4 زنده در فهرست/فیلتر/پوشش
  * **دیمن تکمیل:** برش «تکمیل ستون‌های ناقص M2» در پایدارساز (rowIds هدفمند، round-robin) + شتاب‌دهی ۴۵دقیقه‌ای → موبایل متقاضی ۹٪ → ۲۲٫۷٪ (+۱۷۲۱) و دیمن ادامه می‌دهد
  * M3: قیمت ۹۷٫۶٪ / نوع ۱۰۰٪ (بروزرسانی ناقص معاملات از P6546-47 ریشه‌ای رفع شده بود)
- **۰۶:۴۰–۰۸:۱۰** — قانون ۰۳۵-B (ظاهر فاخر): پالت ۱۳بخش×۵سایه (DP بهینه، حداکثر فاصلهٔ hue ۲۷٫۷° = سقف ریاضی ۱۳ رنگ، AA خودتنظیم) + تم سه‌گانه روشن/سیستم/تاریک با انتقال ۳۰۰ms + PWA کامل (portrait-primary/اسکرین‌شات×۲/میان‌بر×۳/SW-v5 بنر آپدیت) + اسپلش + ناوبری پایین + ریپل + PTR ×۴ فهرست + BottomSheet + حالت‌های طراحی‌شده + haptics + safe-area + بارگذاری تنبل کاشی‌ها (چانک ۱٫۳MB→۲۶۷KB) + Lighthouse (a11y=100/bp=96/seo=100/CLS=0.001/perf=58 شبیه‌سازی موبایل — صادقانه)
- **۰۸:۱۷–۰۸:۲۵** — قانون ۰۳۵-A: حذف DB از git — purge تاریخچه با git-filter-repo (db/custom.db + بکاپ‌های DB + تار ۱٫۱۵GB که به‌اشتباه کامیت شده بود): **.git از ۱٫۲GB → ۴۵MB** · آینهٔ GitHub = survival/code (کد کامل، بدون داده — روح قانون) · main پوش همچنان رد (سقف حجم مخزن GitHub + حفاظت شاخهٔ پیش‌فرض — مستند) · ۲۸ فایل بکاپ DB به upload/dataset-backups منتقل شد (دادهٔ مقدس)
- **۰۸:۲۵–۰۸:۳۵** — راستی‌آزمایی نهایی: ۱۸۹۴/۱۸۹۴ پس از purge · tsc صفر · ESLint صفر · بیلد production سبز · repo.tar تازه (۶۶۸MB با .git لاغر) + همین بسته (chainIndex=8)

## وضعیت گاردها (صادقانه)

- repository --strict-agents: PASS · log-safety: PASS
- repository --strict (روت‌ها): FAIL از قبل (۳۱ فراخوانی db — بدهی تاریخی، سهم P6549: صفر)
- intelligence --strict: FAIL از قبل (۲ فایل — بدون تغییر در P6549)
EOF

# ── زنجیرهٔ هش ──
PREV_MD5=$(md5sum "$PREV/MANIFEST.md5" | awk '{print $1}')
cat > "$PKG/CHAIN.txt" <<EOF
chainIndex=8
previousChainMd5=$PREV_MD5
previousPackage=P6548-recovery-20261004 (MANIFEST.md5)
createdAt=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF

# ── مانیفست ──
( cd "$PKG" && find . -type f ! -name MANIFEST.md5 -print0 | sort -z | xargs -0 md5sum > MANIFEST.md5 )

echo "بستهٔ بقا ساخته شد: $PKGNAME"
du -sh "$PKG"
echo "--- CHAIN.txt ---"
cat "$PKG/CHAIN.txt"
echo "--- مانیفست: $(wc -l < "$PKG/MANIFEST.md5") فایل ---"
md5sum "$PKG/MANIFEST.md5"
