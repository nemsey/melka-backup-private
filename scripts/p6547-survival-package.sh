#!/bin/bash
# p6547-survival-package.sh — بستهٔ بقای پروندهٔ P6547 (قانون تثبیت ۰۳۱ — بند ج کامل)
set -euo pipefail
cd /home/z/my-project

STAMP="P6547-$(date +%Y%m%d)"
DEST="upload/.survival/$STAMP"
mkdir -p "$DEST"

echo "[1/6] بستهٔ git (bundle — کل تاریخ + همهٔ شاخه‌ها)"
git bundle create "$DEST/repo.bundle" --all 2>/dev/null && echo "  repo.bundle: $(du -h "$DEST/repo.bundle" | cut -f1)"

echo "[2/6] پایگاه‌های داده (custom + test)"
cp db/custom.db "$DEST/custom.db"
cp db/test.db "$DEST/test.db" 2>/dev/null || true
echo "  DBs copied"

echo "[3/6] اسناد (worklog + env + سند قانون)"
cp worklog.md "$DEST/worklog.md"
cp .env "$DEST/env.txt"
cp env.platform.json "$DEST/env.platform.json"
cp AGENTS.md "$DEST/AGENTS.md" 2>/dev/null || true

echo "[4/6] شواهد عددی و بصری"
cp -r download/p6547 "$DEST/evidence-p6547"

echo "[5/6] وابستگی‌های کلیدی (lock + package + schema + prisma)"
cp bun.lock "$DEST/bun.lock" 2>/dev/null || true
cp package.json "$DEST/package.json"
cp prisma/schema.prisma "$DEST/schema.prisma"

echo "[6/6] مانیفست md5"
cd "$DEST"
find . -type f ! -name "MANIFEST.md5" -exec md5sum {} \; | sort -k2 > MANIFEST.md5
echo "  files: $(wc -l < MANIFEST.md5)"

# زنجیرهٔ هش (بند ک) — پیوند به بستهٔ قبل
PREV_CHAIN="/home/z/my-project/upload/.survival/P6546-20261003/MANIFEST.md5"
if [ -f "$PREV_CHAIN" ]; then
  PREV_MD5=$(md5sum "$PREV_CHAIN" | cut -d' ' -f1)
  echo "chainIndex=5" > CHAIN.txt
  echo "previousChainMd5=$PREV_MD5" >> CHAIN.txt
  echo "previousPackage=P6546-20261003" >> CHAIN.txt
  echo "createdAt=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> CHAIN.txt
  echo "  chain: index=5 → prev=$PREV_MD5"
fi

echo "✓ بستهٔ بقای $STAMP کامل شد: $(du -sh "$DEST" | cut -f1)"
