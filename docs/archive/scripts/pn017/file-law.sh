#!/usr/bin/env bash
# PN-017 — قانون فایل v3: ALL.zip + قطعات ≤48MB + SHA256SUMS + REJOIN (عین الگوی PN-016)
set -euo pipefail
cd /home/z/my-project

SRC="upload/.survival/PN-017-20261008"
TAR="deliver-store/pn017-survival.tar"

echo "[فایل‌قانون v3] tar بستهٔ بقا…"
rm -f "$TAR" deliver-store/pn017-survival-part*.bin
tar -cf "$TAR" -C upload/.survival "PN-017-20261008"
ls -la "$TAR"

echo "[فایل‌قانون v3] تقسیم به قطعات ۴۸MB…"
rm -f deliver-store/pn017-survival-part*.bin
split -b 48M --numeric-suffixes=0 --additional-suffix=.bin "$TAR" "deliver-store/pn017-survival-part"

echo "[فایل‌قانون v3] SHA256SUMS…"
cd deliver-store
sha256sum pn017-survival-part*.bin pn017-ALL.zip > pn017-SHA256SUMS.txt 2>/dev/null || sha256sum pn017-survival-part*.bin > pn017-SHA256SUMS.txt
cd ..

cat > deliver-store/pn017-REJOIN.txt <<EOF
# الحاق قطعات بستهٔ بقا — PN-017 (قانون فایل v3)
cat pn017-survival-part*.bin > pn017-survival.tar
sha256sum -c pn017-SHA256SUMS.txt
tar -xf pn017-survival.tar   # → upload/.survival/PN-017-20261008/
EOF

echo "قطعات:"
ls -la deliver-store/pn017-survival-part*.bin | awk '{print "  " $9 " — " $5 " بایت"}'

# آزمون بازگشت (حاق قطعات = tar اصلی)
cat deliver-store/pn017-survival-part*.bin > /tmp/pn017-rejoin-test.tar
if cmp -s /tmp/pn017-rejoin-test.tar "$TAR"; then echo "آزمون الحاق: سبز (بایت‌به‌بایت یکسان)"; else echo "خطا: الحاق نایکسان"; exit 1; fi
rm -f /tmp/pn017-rejoin-test.tar
echo "[فایل‌قانون v3] کامل."
