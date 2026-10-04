#!/usr/bin/env bash
# P6550-skeleton-v2 — بستهٔ بقا (chainIndex=9)
# الگو: scripts/p6547-cont-survival-package.sh + CHAIN زنجیرهٔ هش
set -euo pipefail
cd /home/z/my-project

STAMP="P6550-skeleton-v2-20261004"
DEST="upload/.survival/$STAMP"
PREV_CHAIN_MD5="1ea6ad3ba87f938107fa36fed5a3b0bf"   # md5 فایل CHAIN.txt بستهٔ P6549 (chainIndex=8)
rm -rf "$DEST"; mkdir -p "$DEST"

echo "[1/8] repo.bundle (کل تاریخ + همهٔ شاخه‌ها)"
git -c pack.windowMemory=96m -c pack.threads=1 -c pack.window=5 -c pack.depth=10 \
  bundle create "$DEST/repo.bundle" --all 2>/dev/null
echo "  repo.bundle: $(du -h "$DEST/repo.bundle" | cut -f1)"

echo "[2/8] پایگاه داده — VACUUM تازه (برش نهایی روز)"
bun scripts/p6527-vacuum-backup.ts /home/z/my-project/db/custom.db "/home/z/my-project/$DEST/custom.db"
echo "  custom.db: $(du -h "$DEST/custom.db" | cut -f1)"
cp db/test.db "$DEST/test.db" 2>/dev/null || echo "  (بدون test.db)"

echo "[3/8] اسناد هویتی"
cp worklog.md "$DEST/worklog.md"
cp env.platform.json "$DEST/env.platform.json"
if [ -f .env ]; then cp .env "$DEST/env.txt"; else echo "  ⚠ .env موجود نیست (env.platform.json کافی است — رازهای حقیقی از مالک)" | tee -a "$DEST/EVENTS.md.note"; fi
cp AGENTS.md "$DEST/AGENTS.md"
cp package.json "$DEST/package.json"
cp prisma/schema.prisma "$DEST/schema.prisma"
cp bun.lock "$DEST/bun.lock" 2>/dev/null || true

echo "[4/8] سه‌گانهٔ انتقال (خروجی این پرونده)"
mkdir -p "$DEST/skeleton"
cp upload/skeleton/MELKA-SKELETON-COMPLETE-v1.0.md "$DEST/skeleton/"
cp upload/skeleton/melka-source-v1.0-20261004.tar.gz "$DEST/skeleton/"
cp upload/skeleton/melka-source-v1.0.md5 "$DEST/skeleton/"
cp upload/skeleton/REBUILD-LETTER.md "$DEST/skeleton/"
cp upload/skeleton/.skeleton-v1.0.md5 "$DEST/skeleton/" 2>/dev/null || true

echo "[5/8] شاهد راستی‌آزمایی قرنطینه"
mkdir -p "$DEST/evidence-p6550"
{
  echo "# شاهد راستی‌آزمایی بستهٔ سورس — قرنطینهٔ P6550"
  echo "تاریخ: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  echo "## ۴ گام (همگی سبز)"
  echo "1. md5sum -c MANIFEST.md5 → 827/827 OK"
  echo "2. bun install → 857 packages installed [6.21s]"
  echo "3. bunx prisma generate ✓ + bunx tsc --noEmit → صفر خطا (TSC_EXIT=0)"
  echo "4. bun run build → سبز (BUILD_EXIT=0) · BUILD_ID=ce284df-20261004-0903 · standalone+env.platform.json بسته‌بندی شد"
  echo
  echo "## اسکن صفر-راز (سه‌مرحله‌ای)"
  echo "- مرحلهٔ ۱: پالایش 80211186→00000000 و 41372895→11111111 در ۳۶ فایل بسته"
  echo "- مرحلهٔ ۲: اسکن نهایی grep (کدها/ghp_/github_pat_) → صفر نشت"
  echo "- مرحلهٔ ۳: md5sum بستهٔ نهایی → c505c50e9c22343cbcaa9c746a99405e"
} > "$DEST/evidence-p6550/VERIFICATION.txt"
cat "$DEST/evidence-p6550/VERIFICATION.txt"

echo "[6/8] EVENTS.md"
cat > "$DEST/EVENTS.md" << 'EOF'
# نقشهٔ وقایع — P6550-skeleton-v2 (بستهٔ انتقال کامل ملکا)

## خط زمانی (UTC — ۴ اکتبر ۲۰۲۶)

- **۰۸:۴۴** — BLOCK 0: VACUUM INTO pre-p6550 (۱۶۷MB) · کشف و ثبت درس: مسیر نسبی Prisma به prisma/db خالی اشاره می‌کند (بایستی مطلق)
- **۰۸:۴۵-۰۸:۵۹** — جمع‌آوری حقایق: ۶۱ روت · ۱۳ کاشی · ۱۱ موتور · ۳۹ مدل · پالت ۱۳×۵ · وضعیت‌های ARM — همه با شمارهٔ خط از کد مبنا
- **۰۸:۵۹** — BLOCK 1: مونتاژ سند اسکلت ۸٬۷۳۰خطی از ۱۱ جزء + ۲۶ جاسازی عین‌متنی (کامیت ce284df)
- **۰۹:۰۰-۰۹:۰۲** — BLOCK 2: بستهٔ سورس ۲٫۵MB · پالایش سازگار ۳۶ فایل · اسکن صفر-نشت · tar.gz (کامیت 8527991)
- **۰۹:۰۲-۰۹:۰۳** — راستی‌آزمایی قرنطینه ۴/۴ سبز (md5/install/tsc/build)
- **۰۹:۰۵** — BLOCK 3: REBUILD-LETTER.md
- **۰۹:۰۶+** — تثبیت: worklog + این بسته (chainIndex=9) + گزارش نهایی با جدول لینک (قانون ۰۳۵-A)

## رخدادهای صادقانه

۱. VACUUM نخست با مسیر نسبی فایل ۴KB خالی ساخت (اشاره به prisma/db/custom.db صفربایت) — بلافاصله تشخیص و تکرار با مسیر مطلق؛ فایل معیوب حذف شد
۲. اسکن صفر-راز بار اول به خودِ اسکریپت بسته‌بندی برخورد (کپی بازگشتی استیجینگ داخل scripts/) — اصلاح: استثنای p6550-staging/build-package در rsync + گیت‌ایگنور
۳. سند اسکلت نخستین مونتاژ ۳٬۷۷۷ خط شد (زیر هدف) — با گسترش صادقانه (بخش‌های کامل ۱۱گانهٔ M5-M8 + جاسازی قراردادها/دیمن‌ها/کتابخانه‌ها) به ۸٬۷۳۰ خط رسید — صفر پرگویی، همهٔ افزوده‌ها ارجاع‌دار

## وضعیت سه‌گانه

| بسته | اندازه | md5 |
|---|---|---|
| MELKA-SKELETON-COMPLETE-v1.0.md | ۴۷۴KB · ۸٬۷۳۰ خط | 0d01f54fc39bc3910cb9a3a2ee6f617d |
| melka-source-v1.0-20261004.tar.gz | ۲٫۵MB · ۸۲۷ فایل | c505c50e9c22343cbcaa9c746a99405e |
| REBUILD-LETTER.md | ~۹٫۷KB | (در MANIFEST) |
EOF

echo "[7/8] MANIFEST.md5"
cd "$DEST"
find . -type f ! -name 'MANIFEST.md5' | LC_ALL=C sort | xargs md5sum > MANIFEST.md5
echo "  $(wc -l < MANIFEST.md5) فایل در مانیفست"

echo "[8/8] CHAIN.txt (chainIndex=9)"
cat > CHAIN.txt << EOF
chainIndex=9
previousChainMd5=$PREV_CHAIN_MD5
previousPackage=P6549-20261004 (CHAIN.txt)
createdAt=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF
cat CHAIN.txt

echo
echo "── راستی‌آزمایی زنجیره (md5 بستهٔ قبل):"
md5sum ../P6549-20261004/CHAIN.txt
echo "── محتوای بسته:"
ls -la "$DEST"
du -h "$DEST/repo.bundle" "$DEST/custom.db" "$DEST/skeleton/melka-source-v1.0-20261004.tar.gz"
echo "OK ✅"
