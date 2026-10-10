#!/usr/bin/env bash
# PN-013 مرحلهٔ ۸ — قانون فایل نسخهٔ ۳: ALL.zip + قطعات بقا + SHA256 + REJOIN + استقرار
set -euo pipefail
cd /home/z/my-project

DELIVER="public/deliver"
P13="upload/.survival/PN-013-20261007"
mkdir -p "$DELIVER/pn013/screens"

echo "── ۱) ALL.zip (گزارش + همهٔ شواهد سبک) ──"
rm -f "$DELIVER/PN-013-ALL.zip"
cd download/pn013
zip -q -r ../../public/deliver/PN-013-ALL.zip . -x "tests-run*.log"
cd /home/z/my-project
# گزارش هم جداگانه و هم داخل ALL.zip (داخل . است)
cp download/pn013/PN-013-FINAL-REPORT.md "$DELIVER/"
for f in lock-in.json control-report.json debt-register.json debt-closure.json phase4-shell.json phase4-budget.json phase4-observability.json end-gate.json observability-live.json ci-eight-steps.log tests-run1.log tests-run2.log; do
  cp "download/pn013/$f" "$DELIVER/pn013/" 2>/dev/null || echo "  (فاقد: $f)"
done
cp -r download/pn013/screens/. "$DELIVER/pn013/screens/"

echo "── ۲) قطعات بستهٔ بقا (≤ ۵۰MB) ──"
rm -f "$DELIVER"/PN-013-survival-part*.bin
cd "$P13"
split -b 50331648 -d --additional-suffix=.bin MANIFEST.json /dev/null 2>/dev/null || true
# قطعه‌بندی کل بسته به‌صورت tar
cd /home/z/my-project
rm -f /tmp/PN-013-survival.tar
tar -cf /tmp/PN-013-survival.tar -C upload/.survival PN-013-20261007
SIZE=$(stat -c%s /tmp/PN-013-survival.tar)
echo "  tar بسته: $((SIZE/1024/1024))MB"
cd "$DELIVER"
split -b 50331648 -d --additional-suffix=.bin /tmp/PN-013-survival.tar PN-013-survival-part
rm -f /tmp/PN-013-survival.tar
cd /home/z/my-project

echo "── ۳) SHA256SUMS + REJOIN ──"
cd "$DELIVER"
sha256sum PN-013-ALL.zip PN-013-survival-part*.bin > PN-013-SHA256SUMS.txt
cat > PN-013-REJOIN.txt <<'EOF'
# الحاق مجدد بستهٔ بقای PN-013 (chainIndex=14)
# در پوشهٔ حاوی همهٔ part*.bin اجرا کنید:
cat PN-013-survival-part*.bin > PN-013-survival.tar
sha256sum -c PN-013-SHA256SUMS.txt   # باید همهٔ ردیف‌ها OK باشند
tar -xf PN-013-survival.tar          # → upload/.survival/PN-013-20261007/
# راستی‌آزمایی زنجیره: MD5 بستهٔ ۱۳ در MANIFEST.json بستهٔ ۱۴ (anchorPreviousManifest)
EOF
cd /home/z/my-project

echo "── ۴) آزمون الحاق (قطعه → tar → md5) ──"
cat "$DELIVER"/PN-013-survival-part*.bin | tar -tf - >/dev/null && echo "  الحاق قطعات: tar معتبر ✓"

echo "── ۵) کپی تاب‌آور به standalone ──"
mkdir -p .next/standalone/public
cp -r "$DELIVER"/* .next/standalone/public/deliver/

echo "── ۶) آزمون لینک‌ها (HTTP 200) ──"
PASS=0; FAIL=0
for f in "$DELIVER"/PN-013-ALL.zip "$DELIVER"/PN-013-FINAL-REPORT.md "$DELIVER"/PN-013-SHA256SUMS.txt "$DELIVER"/PN-013-REJOIN.txt "$DELIVER"/pn013/end-gate.json; do
  n=$(basename "$f")
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/deliver/$n")
  [ "$n" = "end-gate.json" ] && code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/deliver/pn013/$n")
  echo "  $code  /deliver/$n"
  [ "$code" = "200" ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))
done
for f in "$DELIVER"/PN-013-survival-part*.bin; do
  n=$(basename "$f")
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/deliver/$n")
  echo "  $code  /deliver/$n ($(du -m "$f" | cut -f1)MB)"
  [ "$code" = "200" ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))
done
echo "نتیجهٔ لینک محلی: $PASS سبز · $FAIL قرمز"
ls -la "$DELIVER" | head -20
