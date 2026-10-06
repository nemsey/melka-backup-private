#!/bin/bash
# PN-005 — بستهٔ بقا chainIndex=5 (ادامهٔ زنجیره: P6550-R=1 → PN-001=2 → PN-002=3 → PN-003=4 → PN-005=5)
set -euo pipefail
cd /home/z/my-project

PKG="upload/.survival/PN-005-14050713"
PREV_MANIFEST="upload/.survival/PN-003-14050714/MANIFEST.json"

echo "[1/7] پاک‌سازی مقصد…"
rm -rf "$PKG"
mkdir -p "$PKG/screens"

echo "[2/7] repo.bundle (تاریخ کامل)…"
git bundle create "$PKG/repo.bundle" --all

echo "[3/7] custom.db (VACUUM INTO — دادهٔ واقعی + گراف‌های بازسازی‌شده)…"
bun scripts/snapshot-db.ts "/home/z/my-project/$PKG/custom.db"

echo "[4/7] اسناد + وابستگی‌ها…"
cp worklog.md "$PKG/worklog.md"
cp .env.example "$PKG/.env.example"
cp package.json "$PKG/package.json"
cp bun.lock "$PKG/bun.lock"

echo "[5/7] گزارش و شواهد بصری PN-005…"
cp download/pn005/PN-005-REPORT.md "$PKG/" 2>/dev/null || echo "  (گزارش در جای دیگر)"
cp download/pn005/recovery-witness.json "$PKG/" 2>/dev/null || true
cp download/pn005/screens/*.png "$PKG/screens/" 2>/dev/null || echo "  (بدون اسکرین‌شات — ادامه)"

echo "[6/7] شمارش شاهد + MANIFEST.json…"
COUNTS=$(bun -e '
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } } });
(async () => {
  const c = {
    listings: await db.propertyRecord.count(),
    requests: await db.requestRecord.count(),
    transactions: await db.transactionRecord.count(),
    experts: await db.expertRecord.count(),
    graphNodes: await db.graphNode.count(),
    graphEdges: await db.graphEdge.count(),
    opportunityAlerts: await db.opportunityAlert.count(),
  };
  console.log(JSON.stringify(c));
  await db.$disconnect();
})();' 2>/dev/null)
PREV_MD5=$(md5sum "$PREV_MANIFEST" | awk '{print $1}')
cat > "$PKG/MANIFEST.json" <<EOF
{
  "chainIndex": 5,
  "commit": "$(git rev-parse --short HEAD)",
  "builtAt": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)",
  "previousChainMd5": "${PREV_MD5}",
  "counts": ${COUNTS},
  "note": "PN-005 — بازیابی پس از بازگشت محیط (زنجیرهٔ کدمستر سه‌لایه + گراف ۴۸K + ۱۳۰ هشدار + حلقهٔ ۳۸۶ پیش‌بینی). داده در GLM می‌ماند؛ گیت‌هاب فقط قالب."
}
EOF

echo "[7/7] MANIFEST.md5…"
cd "$PKG"
find . -type f ! -name 'MANIFEST.md5' -print0 | sort -z | xargs -0 md5sum > MANIFEST.md5

echo "═══ بستهٔ بقا chainIndex=5 ساخته شد ═══"
du -sh .
echo "مانیفست: $(grep -c . MANIFEST.md5) فایل"
echo "شمارش: ${COUNTS}"
md5sum MANIFEST.md5
