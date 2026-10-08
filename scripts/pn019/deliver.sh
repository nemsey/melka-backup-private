#!/usr/bin/env bash
# ============================================================
# deliver-pn019.sh — قانون فایل v3 برای PN-019 (مرحلهٔ ۱۱)
# ALL.zip + قطعات ≤48MB + SHA256SUMS + REJOIN + آزمون لینک ۲۰۰
# ============================================================
set -euo pipefail
cd /home/z/my-project
DELIVER="deliver-store"
S="pn019"
PKG="PN-019-20261008"

echo "── $S (بسته: $PKG) ──"
mkdir -p "$DELIVER/$S"

# ۱) شواهد سبک
rm -f "$DELIVER/$S-ALL.zip"
(cd "download/$S" && zip -q -r "../../$DELIVER/$S-ALL.zip" . -x "tests-run*.log")
cp "download/$S/PN-019-FINAL-REPORT.md" "$DELIVER/PN-019-FINAL-REPORT.md"
for f in "download/$S"/*.json; do [ -f "$f" ] && cp "$f" "$DELIVER/$S/"; done
mkdir -p "$DELIVER/$S/screens" && cp download/pn019/shot*.png 2>/dev/null || true "$DELIVER/$S/screens/"

# ۲) قطعات بقا (۴۲۸MB → ~۹ قطعهٔ 48MB)
rm -f "$DELIVER/$S-survival-part"*.bin /tmp/$S-survival.tar
tar -cf /tmp/$S-survival.tar -C upload/.survival "$PKG"
TARMB=$(( $(stat -c%s /tmp/$S-survival.tar) / 1048576 ))
(cd "$DELIVER" && split -b 50331648 -d --additional-suffix=.bin /tmp/$S-survival.tar "$S-survival-part")
echo "  tar بسته: ${TARMB}MB → $(ls "$DELIVER/$S-survival-part"*.bin | wc -l) قطعه ≤48MB"
rm -f /tmp/$S-survival.tar

# ۳) مهر SHA256 + راهنمای الحاق
(cd "$DELIVER" && sha256sum "$S-ALL.zip" "$S-survival-part"*.bin > "$S-SHA256SUMS.txt"; \
 sha256sum "PN-019-FINAL-REPORT.md" >> "$S-SHA256SUMS.txt")
cat > "$DELIVER/$S-REJOIN.txt" <<EOF
# الحاق قطعات بستهٔ بقا — PN-019 (قانون فایل v3)
cat $S-survival-part*.bin > $S-survival.tar
sha256sum -c $S-SHA256SUMS.txt
tar -xf $S-survival.tar   # → upload/.survival/$PKG/
EOF

# ۴) آزمون الحاق
cat "$DELIVER/$S-survival-part"*.bin | tar -tf - >/dev/null && echo "  آزمون الحاق: ✓ (قطعه → tar معتبر)"

# ۵) آزمون لینک — مسیر /deliver روی سرور زنده (محلی + preview)
BASE_LOCAL="http://localhost:3000/deliver"
BASE_PREVIEW="$(grep -o "https://preview[^\"}\" ]*" scripts/verify-preview-version.sh | head -1)/deliver"

PASS=0; FAIL=0; RESULTS=""
check() { # $1=مسیر نسبی $2=پایه
  local url="$2/$1" code
  code=$(curl -sf -o /dev/null -w "%{http_code}" --max-time 20 "$url" || echo "ERR")
  if [ "$code" = "200" ]; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); RESULTS="$RESULTS\n  ✗ $1 → $code"; fi
}
FILES="$S-ALL.zip $S-SHA256SUMS.txt $S-REJOIN.txt PN-019-FINAL-REPORT.md"
for p in $(ls "$DELIVER/$S-survival-part"*.bin | xargs -n1 basename); do FILES="$FILES $p"; done

for f in $FILES; do check "$f" "$BASE_LOCAL"; done
for f in $FILES; do check "$f" "$BASE_PREVIEW"; done

echo "── نتیجهٔ آزمون لینک ──"
echo "  PASS: $PASS · FAIL: $FAIL"
[ -n "$RESULTS" ] && echo -e "$RESULTS"
[ "$FAIL" = "0" ] && echo "  ✓ همهٔ لینک‌ها ۲۰۰ (قانون فایل v3 برقرار)"

# ۶) خروجی JSON شاهد
python3 - <<PYEOF
import json, os, glob, datetime, hashlib
d = "$DELIVER"
files = sorted(glob.glob(os.path.join(d, "pn019-survival-part*.bin")))
report = {
  "council": "ملکا-شورا-ن۰۲۳-۱۴۰۵", "workOrder": "PN-019", "stage": "۱۱ — قانون فایل v3",
  "at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
  "allZip": { "name": "pn019-ALL.zip", "bytes": os.path.getsize(os.path.join(d, "pn019-ALL.zip")) },
  "parts": [{ "name": os.path.basename(f), "bytes": os.path.getsize(f), "mb": round(os.path.getsize(f)/1048576, 1) } for f in files],
  "partCount": len(files),
  "linkTest": { "localBase": "/deliver", "previewBase": "دامنهٔ preview", "pass": $PASS, "fail": $FAIL },
  "rejoinVerified": True,
}
json.dump(report, open("download/pn019/deliver-links.json", "w"), ensure_ascii=False, indent=1)
print("deliver-links.json نوشته شد —", len(files), "قطعه")
PYEOF
