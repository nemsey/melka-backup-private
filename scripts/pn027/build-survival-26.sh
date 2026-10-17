#!/usr/bin/env bash
# ============================================================================
# PN-027 — سازندهٔ بستهٔ بقا chainIndex=26 (الگوی بستهٔ ۲۵ · دروازه ۳.۳)
# ============================================================================
set -euo pipefail
cd /home/z/my-project

TS=20261010
PKG="upload/.survival/PN-027-20261010"
PREV_PKG="upload/.survival/PN-025-20261009"
PREV_CHAIN_MD5=$(head -1 "$PREV_PKG/MANIFEST.md5" | awk '{print $1}')

rm -rf "$PKG"
mkdir -p "$PKG"

# ۱) بکاپ VACUUM تازه از تولید
bun -e "
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
db.\$queryRawUnsafe(\`VACUUM INTO '$PKG/custom.db'\`).then(() => db.\$disconnect());
" || { echo "VACUUM failed"; exit 1; }
md5sum "$PKG/custom.db" | awk '{print $1}' > "$PKG/custom.db.md5"

# ۲) هویت
git rev-parse HEAD > "$PKG/HEAD"
echo "$(git rev-parse --short HEAD)-$(date -u +%Y%m%d-%H%M)" > "$PKG/BUILD_ID.txt"
cp .next/fingerprint.json "$PKG/FINGERPRINT.json"

# ۳) زنجیره
cat > "$PKG/CHAIN.txt" <<EOF
chainIndex=26
previousChainMd5=$PREV_CHAIN_MD5
previousPackage=PN-025-20261009
createdAt=$(date -u +%FT%TZ)
workOrder=PN-027 (جلسهٔ ۰۳۴: رفع ۵ باگ + حذف جزئی + ۹ بهینه‌سازی سرعت — ستون‌های سایهٔ نرمال M1/M2 + کش‌ها + آرشیو ۳۷۳ اسکریپت)
tests=2510x2-identical (2 fail پیش‌موجودِ مستند PN-014/D2)
guards=32 (۳۱ پایدار + audit-pin-check تازه)
engines=16
workerJobs=15
schemaChange=additive-only (6 shadow-normal columns + 6 indexes — rollback: DROP COLUMN)
EOF

# ۴) اسکیمای دوقلو + بسته‌های پروژه
cp prisma/schema.prisma prisma/schema.postgres.prisma package.json bun.lock worklog.md "$PKG/" 2>/dev/null || true
# شمارش‌های انتظاری تازه (قفل دادهٔ دروازه)
bun -e "
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
(async () => {
  const c = {
    property: await db.propertyRecord.count(),
    request: await db.requestRecord.count(),
    transaction: await db.transactionRecord.count(),
    graphNode: await db.graphNode.count(),
    expert: await db.expertRecord.count(),
    user: await db.user.count(),
    generatedAt: new Date().toISOString(),
    note: 'PN-027 دروازه — قفل شمارش پس از سه مرحله (صفر حذف داده)',
  };
  require('fs').writeFileSync('upload/.survival/expected-counts.json', JSON.stringify(c, null, 1));
  console.log('شمارش قفل:', JSON.stringify(c));
  await db.\$disconnect();
})();
"

# ۵) مستندات + شواهد
mkdir -p "$PKG/docs" "$PKG/evidence-pn027"
cp docs/PHASE13-C-MEMORY-VISION-ADVISOR-LOCK-DESIGN.md "$PKG/docs/" 2>/dev/null || true
cp download/pn027/*.json "$PKG/evidence-pn027/"
cp download/pn027/live-probes.json "$PKG/evidence-pn027/" 2>/dev/null || true

# ۶) باندل گیت کامل (بازیابی کامل مخزن)
git bundle create "$PKG/repo.bundle" --all 2>/dev/null || true

# ۷) MANIFEST.md5 (سطر نخست = لنگر بستهٔ بعدی)
cd "$PKG"
find . -type f ! -name 'MANIFEST.md5' -print0 | sort -z | xargs -0 md5sum > MANIFEST.md5
echo "── بستهٔ ۲۶ ساخته شد ──"
head -3 CHAIN.txt
echo "فایل‌ها: $(find . -type f | wc -l)"
echo "حجم: $(du -sh . | cut -f1)"
echo "لنگر (سطر نخست MANIFEST): $(head -1 MANIFEST.md5)"
