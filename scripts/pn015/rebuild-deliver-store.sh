#!/usr/bin/env bash
# ============================================================
# rebuild-deliver-store.sh — بازسازی مخزن تحویل پس از بازنشانی هفتم (PN-015 · مرحلهٔ ۹)
# ------------------------------------------------------------
# هر ۲۷+ لینک وعده‌داده‌شدهٔ قانون فایل v3 باید دوباره ۲۰۰ بدهد
# (عهد «عدم-شکست»). منابع:
#   · شواهد سبک: download/pnXXX (بازیافته از گیت — بایت‌اصیل)
#   · بسته‌های بقا: upload/.survival/PN-XXX (ossfs — از بازنشانی جان به در بردند)
#     → قطعات با همان اندازهٔ اصلی (48MB) بازتولید می‌شوند؛
#       SHA256SUMS تازه مهر می‌خورد (بازتولیدِ پس از بازنشانی — صادقانه مستند)
# ============================================================
set -euo pipefail
cd /home/z/my-project
DELIVER="deliver-store"
mkdir -p "$DELIVER"

ONLY="${1:-all}"
rebuild_session() { # $1=pnXXX $2=package-dir-name
  local S="$1" PKG="$2"
  [ "$ONLY" != "all" ] && [ "$ONLY" != "$S" ] && return 0
  echo "── $S (بسته: $PKG) ──"
  mkdir -p "$DELIVER/$S"
  # ۱) شواهد سبک از گیت
  (cd "download/$S" && zip -q -r "../../$DELIVER/$S-ALL.zip" . -x "tests-run*.log" 2>/dev/null || zip -q -r "../../$DELIVER/$S-ALL.zip" .)
  [ -f "download/$S/$S-FINAL-REPORT.md" ] && cp "download/$S/$S-FINAL-REPORT.md" "$DELIVER/" 2>/dev/null || true
  for f in "download/$S"/*.json "download/$S"/*.md; do
    [ -f "$f" ] && cp "$f" "$DELIVER/$S/"
  done
  [ -d "download/$S/screens" ] && mkdir -p "$DELIVER/$S/screens" && cp -r "download/$S/screens/." "$DELIVER/$S/screens/"
  # ۲) قطعات بقا از مخزن ابری — همان اندازهٔ اصلی
  rm -f "$DELIVER/$S-survival-part"*.bin /tmp/$S-survival.tar
  tar -cf /tmp/$S-survival.tar -C upload/.survival "$PKG"
  local TARMB=$(( $(stat -c%s /tmp/$S-survival.tar) / 1048576 ))
  (cd "$DELIVER" && split -b 50331648 -d --additional-suffix=.bin /tmp/$S-survival.tar "$S-survival-part")
  echo "  tar بسته: ${TARMB}MB → $(ls "$DELIVER/$S-survival-part"*.bin | wc -l) قطعه"
  rm -f /tmp/$S-survival.tar
  # ۳) مهر تازه SHA256 + راهنمای الحاق
  (cd "$DELIVER" && sha256sum "$S-ALL.zip" "$S-survival-part"*.bin > "$S-SHA256SUMS.txt" 2>/dev/null; \
   [ -f "$S-FINAL-REPORT.md" ] && sha256sum "$S-FINAL-REPORT.md" >> "$S-SHA256SUMS.txt")
  cat > "$DELIVER/$S-REJOIN.txt" <<EOF
# الحاق قطعات بستهٔ بقا — $S (بازتولید PN-015 پس از بازنشانی هفتم)
cat $S-survival-part*.bin > $S-survival.tar
sha256sum -c $S-SHA256SUMS.txt
tar -xf $S-survival.tar   # → upload/.survival/$PKG/
EOF
}

[ -d download/pn012 ] && rebuild_session pn012 PN-012-20261007
[ -d download/pn013 ] && rebuild_session pn013 PN-013-20261007
[ -d download/pn014 ] && rebuild_session pn014 PN-014-20261007

echo "── آزمون الحاق (قطعه → tar معتبر) ──"
for S in pn012 pn013 pn014; do
  cat "$DELIVER/$S-survival-part"*.bin | tar -tf - >/dev/null && echo "  $S: ✓"
done

echo "── آزمون لینک‌ها (مسیر /deliver روی سرور زنده) ──"
PASS=0; FAIL=0; LINKS=""
for f in "$DELIVER"/PN-01[234]-ALL.zip "$DELIVER"/PN-01[234]-SHA256SUMS.txt "$DELIVER"/PN-01[234]-REJOIN.txt "$DELIVER"/PN-01[234]-survival-part00.bin; do
  n=$(basename "$f")
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "http://localhost:3000/deliver/$n")
  echo "  $code  /deliver/$n"
  LINKS="$LINKS$n:$code\n"
  [ "$code" = "200" ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))
done
echo "نتیجه: $PASS سبز · $FAIL قرمز"
du -sh "$DELIVER"
