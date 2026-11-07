#!/usr/bin/env bash
# ============================================================================
# PN-025 — سازندهٔ بستهٔ بقا chainIndex=25 (الگوی بستهٔ ۲۴)
# ============================================================================
set -euo pipefail
cd /home/z/my-project

TS=20261009
PKG="upload/.survival/PN-025-20261009"
PREV_PKG="upload/.survival/PN-024-20261009"
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
chainIndex=25
previousChainMd5=$PREV_CHAIN_MD5
previousPackage=PN-024-20261009
createdAt=$(date -u +%FT%TZ)
workOrder=PN-025 (شاهکار چهارستونه: حافظهٔ بلندمدت + بینایی کامل + موتور ۱۶ مشاور تصمیم + کمربند ایمنی + سه کاشی حیاتی + جلسهٔ ۰۳۳: حذفیات و تغییرات UI مالک)
tests=2510x2-identical
guards=30
engines=16
workerJobs=15
recoveredFrom=platform-reset-20261009 (آینه GitHub — درس K3)
EOF

# ۴) اسکیمای دوقلو + بسته‌های پروژه
cp prisma/schema.prisma prisma/schema.postgres.prisma package.json bun.lock worklog.md expected-counts.json "$PKG/" 2>/dev/null || true
cp upload/.survival/expected-counts.json "$PKG/expected-counts.json" 2>/dev/null || true

# ۵) مستندات + شواهد
mkdir -p "$PKG/docs" "$PKG/evidence-pn025"
cp docs/PHASE13-C-MEMORY-VISION-ADVISOR-LOCK-DESIGN.md "$PKG/docs/"
cp download/pn025/*.json "$PKG/evidence-pn025/"
cp /tmp/pn025-ci-final.log "$PKG/evidence-pn025/ci-final.log" 2>/dev/null || true
cp /tmp/pn025-run1.log /tmp/pn025-run2.log "$PKG/evidence-pn025/tests-run1.log" 2>/dev/null || true
cp /tmp/pn025-run1.log "$PKG/evidence-pn025/tests-run1.log" 2>/dev/null || true
cp /tmp/pn025-run2.log "$PKG/evidence-pn025/tests-run2.log" 2>/dev/null || true

# ۶) باندل گیت کامل (بازیابی کامل مخزن)
git bundle create "$PKG/repo.bundle" --all 2>/dev/null || true

# ۷) MANIFEST.md5 (سطر نخست = لنگر بستهٔ بعدی)
cd "$PKG"
find . -type f ! -name "MANIFEST.md5" -print0 | sort -z | xargs -0 md5sum > MANIFEST.md5

echo "✓ بستهٔ بقا chainIndex=25 ساخته شد: $PKG"
echo "  لنگر این بسته (سطر نخست MANIFEST): $(head -1 MANIFEST.md5 | awk '{print $1}')"
echo "  شمار فایل: $(find . -type f | wc -l)"
du -sh . | awk '{print "  حجم: " $1}'
