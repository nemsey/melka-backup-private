#!/usr/bin/env bash
# P6550-skeleton-v2 / BLOCK 2 — بستهٔ سورس کامل ملکا (بدون داده)
# ============================================================
# خروجی: upload/skeleton/melka-source-v1.0-20261004.tar.gz (≤10MB)
# قیدها: صفر داده · صفر توکن · صفر رمز (پالایش سازگار کدهای مدیر)
set -euo pipefail

ROOT="/home/z/my-project"
STAGE="$ROOT/scripts/p6550-staging"
PKG="melka-source"
OUT_TGZ="$ROOT/upload/skeleton/melka-source-v1.0-20261004.tar.gz"
DATE="2026-10-04"

echo "── پاک‌سازی استیجینگ قبلی"
rm -rf "$STAGE"; mkdir -p "$STAGE/$PKG"

echo "── ۱) رونوشت فایل‌های مشمول (بدون داده)"
cd "$ROOT"
# کد و پیکربندی
rsync -a --exclude 'node_modules' src/ "$STAGE/$PKG/src/"
rsync -a public/ "$STAGE/$PKG/public/"
rsync -a docs/ "$STAGE/$PKG/docs/"
rsync -a tests/ "$STAGE/$PKG/tests/"
# اسکریپت‌ها بدون شواهد تصویری (PNG) و بدون فایل‌های سنگین/داده‌ای و بدون ابزارهای همین بسته‌بندی
rsync -a --exclude '*.png' --exclude '*.jpg' --exclude '*.jpeg' --exclude '*.webp' \
      --exclude '*.db' --exclude '*.sqlite*' --exclude '*.log' \
      --exclude 'p6550-staging' --exclude 'p6550-build-package.sh' --exclude 'p6550-quarantine' \
      scripts/ "$STAGE/$PKG/scripts/"
# prisma — فقط اسکیما (بدون db)
mkdir -p "$STAGE/$PKG/prisma"
cp prisma/schema.prisma "$STAGE/$PKG/prisma/"
# پیکربندی ریشه
for f in package.json tsconfig.json next.config.ts tailwind.config.ts postcss.config.mjs \
         components.json eslint.config.mjs bunfig.toml capacitor.config.ts bun.lock \
         .env.example .gitignore README.md AGENTS.md worklog.md env.platform.json; do
  [ -f "$f" ] && cp "$f" "$STAGE/$PKG/" || echo "   ⚠ غایب: $f"
done
# سند اسکلت در ریشهٔ بسته
cp "$ROOT/upload/skeleton/MELKA-SKELETON-COMPLETE-v1.0.md" "$STAGE/$PKG/"

echo "── ۲) پالایش رازها (کدهای مدیر → نگه‌دارندهٔ جایگزین)"
# سازگاری حفظ می‌شود: کد فعلی → 00000000 · کد قدیمی مرده → 11111111
# (تست‌های مقایسه‌ای env.platform.json ↔ assertions هم‌ارز می‌مانند)
SAN_COUNT=$(grep -rl '80211186\|41372895' "$STAGE/$PKG" 2>/dev/null | wc -l || true)
grep -rl '80211186' "$STAGE/$PKG" 2>/dev/null | while read -r f; do
  sed -i 's/80211186/00000000/g' "$f"
done
grep -rl '41372895' "$STAGE/$PKG" 2>/dev/null | while read -r f; do
  sed -i 's/41372895/11111111/g' "$f"
done
echo "   پالایش در $SAN_COUNT فایل انجام شد"

echo "── ۳) اسکن نهایی صفر-راز (must be empty)"
LEAKS=$(grep -rn '80211186\|41372895\|ghp_[A-Za-z0-9]\{10,\}\|github_pat_' "$STAGE/$PKG" 2>/dev/null | head -5 || true)
if [ -n "$LEAKS" ]; then echo "❌ نشت راز:"; echo "$LEAKS"; exit 1; fi
echo "   ✓ صفر نشت"

echo "── ۴) شناسنامهٔ بسته"
cat > "$STAGE/$PKG/BUILD-INFO.txt" << EOF
بستهٔ سورس کامل ملکا — melka-source v1.0 ($DATE)
پرونده: P6550-skeleton-v2 (دستور ملکا-شورا-۱۴۰۵-۰۳۷)
مبنای کد: HEAD ce284df (پس از کامیت BLOCK1 سند اسکلت)
قیدها: صفر داده · صفر توکن · صفر رمز
پالایش: کد مدیر فعلی → 00000000 · کد قدیمی → 11111111 (سازگار با تست‌های مقایسه‌ای)
بدون: node_modules/ .next/ db/ prisma/db/ backups/ download/ upload/ .git/ logs/ *.png شواهد
راهنمای بازسازی: REBUILD-LETTER.md + MELKA-SKELETON-COMPLETE-v1.0.md (فصل پیوست ۵)
EOF

echo "── ۵) MANIFEST.md5"
cd "$STAGE/$PKG"
find . -type f ! -name 'MANIFEST.md5' | LC_ALL=C sort | xargs md5sum > MANIFEST.md5
echo "   $(wc -l < MANIFEST.md5) فایل"

echo "── ۶) فشرده‌سازی"
cd "$STAGE"
tar -czf "$OUT_TGZ" "$PKG"
SIZE=$(du -h "$OUT_TGZ" | cut -f1)
SIZE_B=$(stat -c%s "$OUT_TGZ")
echo "   بسته: $OUT_TGZ ($SIZE / $SIZE_B bytes)"
if [ "$SIZE_B" -gt 10485760 ]; then echo "❌ بزرگ‌تر از ۱۰MB"; exit 1; fi

echo "── ۷) اثر انگشت tarball"
md5sum "$OUT_TGZ" | tee "$ROOT/upload/skeleton/melka-source-v1.0.md5"
echo "OK ✅"
