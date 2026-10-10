#!/bin/bash
# PN-001 BLOCK 4.4 — ساخت بستهٔ بقای نهایی (بند ج + ک)
# ۷ قلم الزامی + CHAIN.txt با زنجیرهٔ هش (chainIndex=2 — ادامهٔ زنجیرهٔ بازسازی)
set -euo pipefail
cd /home/z/my-project

STAMP="14050712"
PKG="upload/.survival/PN-001-${STAMP}"
PREV_MANIFEST="upload/.survival/P6550-R-14050712/MANIFEST.md5"

echo "[1/6] پاک‌سازی مقصد اگر هست…"
rm -rf "$PKG"
mkdir -p "$PKG/screens"

echo "[2/6] repo.bundle (تاریخ کامل + هر دو شاخهٔ محلی)…"
git bundle create "$PKG/repo.bundle" --all 2>/dev/null || git bundle create "$PKG/repo.bundle" main

echo "[3/6] custom.db (VACUUM INTO سازگار — دادهٔ واقعی آگهی/درخواست)…"
bun scripts/snapshot-db.ts "/home/z/my-project/$PKG/custom.db"

echo "[4/6] اسناد + وابستگی‌ها…"
cp worklog.md "$PKG/worklog.md"
cp .env.example "$PKG/.env.example"          # پاک‌شده — هرگز .env.local
cp package.json "$PKG/package.json"
cp bun.lock "$PKG/bun.lock"

echo "[5/6] شواهد بصری PN-001…"
cp download/pn001/screens/*.png "$PKG/screens/" 2>/dev/null || echo "  (بدون اسکرین‌شات — ادامه)"

echo "[6/6] CHAIN.txt + MANIFEST.md5…"
PREV_MD5=$(md5sum "$PREV_MANIFEST" | awk '{print $1}')
cat > "$PKG/CHAIN.txt" <<EOF
chainIndex: 2
lineage: PN-001 (دستور جامع سه‌گامی ملکا-شورا-ن۰۰۱-۱۴۰۵)
date: 1405/07/12 (2026-10-04) — پس از کامیت‌های بلوک‌های ۰ تا ۴
previousPackage: P6550-R-14050712 (chainIndex=1)
previousChainMd5: ${PREV_MD5}
anchorHead: $(git rev-parse --short HEAD)
note: |
  ادامهٔ زنجیرهٔ تازهٔ تسک بازآغاز (لنگر = md5 بستهٔ سورس v1.0 در chainIndex=1).
  این بسته شامل دادهٔ واقعی همگام‌شده از endpoint عمومی ARM است
  (آگهی/درخواست — طبق شمارش‌های ثبت‌شده در worklog).
  قواعد: صفر توکن · صفر رمز · MASTER_ACCESS_CODE فقط در .env.local سرور.
contents: repo.bundle · custom.db (VACUUM INTO — دادهٔ واقعی) · worklog.md · MANIFEST.md5 · .env.example (پاک‌شده) · screens/ (شواهد بصری PN-001) · package.json + bun.lock
EOF

cd "$PKG"
find . -type f ! -name 'MANIFEST.md5' -print0 | sort -z | xargs -0 md5sum > MANIFEST.md5

echo "═══ بستهٔ بقا ساخته شد ═══"
du -sh .
echo "مانیفست: $(grep -c . MANIFEST.md5) فایل"
echo "chainIndex=2 · previousChainMd5=${PREV_MD5}"
md5sum MANIFEST.md5
