#!/usr/bin/env bash
# PN-014 مرحلهٔ ۱۲ — قانون فایل نسخهٔ ۳: ALL.zip + قطعات بقا + SHA256 + REJOIN + استقرار
# تفاوت ساختاری با PN-013: تحویل‌ها به deliver-store/ می‌روند و از مسیر /deliver (route) سرو می‌شوند
# (بخشی از اصلاح D2 — بستهٔ استقرار دیگر ~۶۰۰MB تحویل با خود نمی‌کشد)
set -euo pipefail
cd /home/z/my-project

DELIVER="deliver-store"
P14="upload/.survival/PN-014-20261007"
mkdir -p "$DELIVER/pn014/screens"

echo "── ۱) ALL.zip (گزارش + همهٔ شواهد سبک) ──"
rm -f "$DELIVER/PN-014-ALL.zip"
cd download/pn014
zip -q -r ../../deliver-store/PN-014-ALL.zip . -x "tests-run*.log"
cd /home/z/my-project
cp download/pn014/PN-014-FINAL-REPORT.md "$DELIVER/"
for f in lock-in.json D1-ticket.md D2-publish-fix.json D3-decision.json D4-decision.json fixes.json phase5.json end-gate.json; do
  cp "download/pn014/$f" "$DELIVER/pn014/" 2>/dev/null || echo "  (فاقد: $f)"
done
cp -r download/pn014/screens/. "$DELIVER/pn014/screens/"

echo "── ۲) قطعات بستهٔ بقا (≤ ۴۸MB) ──"
rm -f "$DELIVER"/PN-014-survival-part*.bin
rm -f /tmp/PN-014-survival.tar
tar -cf /tmp/PN-014-survival.tar -C upload/.survival PN-014-20261007
SIZE=$(stat -c%s /tmp/PN-014-survival.tar)
echo "  tar بسته: $((SIZE/1024/1024))MB"
cd "$DELIVER"
split -b 50331648 -d --additional-suffix=.bin /tmp/PN-014-survival.tar PN-014-survival-part
rm -f /tmp/PN-014-survival.tar
cd /home/z/my-project

echo "── ۳) SHA256SUMS + REJOIN ──"
cd "$DELIVER"
sha256sum PN-014-ALL.zip PN-014-survival-part*.bin > PN-014-SHA256SUMS.txt
cat > PN-014-REJOIN.txt <<'EOF'
# الحاق مجدد بستهٔ بقای PN-014 (chainIndex=15)
# در پوشهٔ حاوی همهٔ part*.bin اجرا کنید:
cat PN-014-survival-part*.bin > PN-014-survival.tar
sha256sum -c PN-014-SHA256SUMS.txt   # باید همهٔ ردیف‌ها OK باشند
tar -xf PN-014-survival.tar          # → upload/.survival/PN-014-20261007/
# راستی‌آزمایی زنجیره: MD5 بستهٔ ۱۴ در MANIFEST.json بستهٔ ۱۵ (anchorPreviousManifest)
EOF
cd /home/z/my-project

echo "── ۴) آزمون الحاق (قطعه → tar معتبر) ──"
cat "$DELIVER"/PN-014-survival-part*.bin | tar -tf - >/dev/null && echo "  الحاق قطعات: tar معتبر ✓"

echo "── ۵) آزمون لینک‌ها (HTTP 200 از مسیر /deliver) ──"
PASS=0; FAIL=0
for f in "$DELIVER"/PN-014-ALL.zip "$DELIVER"/PN-014-FINAL-REPORT.md "$DELIVER"/PN-014-SHA256SUMS.txt "$DELIVER"/PN-014-REJOIN.txt "$DELIVER"/pn014/lock-in.json "$DELIVER"/pn014/D2-publish-fix.json "$DELIVER"/pn014/phase5.json "$DELIVER"/pn014/end-gate.json "$DELIVER"/pn014/D1-ticket.md "$DELIVER"/pn014/D3-decision.json "$DELIVER"/pn014/D4-decision.json "$DELIVER"/pn014/fixes.json; do
  n="${f#"$DELIVER"/}"
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/deliver/$n")
  if [ "$code" = "200" ]; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); echo "  ✗ $code /deliver/$n"; fi
done
# اسکرین‌شات‌ها
for f in "$DELIVER"/pn014/screens/*.png; do
  n="${f#"$DELIVER"/}"
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/deliver/$n")
  if [ "$code" = "200" ]; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); echo "  ✗ $code /deliver/$n"; fi
done
# قطعات بقا
for f in "$DELIVER"/PN-014-survival-part*.bin; do
  n=$(basename "$f")
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/deliver/$n")
  if [ "$code" = "200" ]; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); echo "  ✗ $code /deliver/$n"; fi
done
# لینک‌های تاریخی هنوز کار می‌کنند (راستی‌آزمایی عدم-شکست)
for n in PN-013-ALL.zip PN-012-ALL.zip; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/deliver/$n")
  echo "  تاریخی $code /deliver/$n"
done

echo "  نتیجه: $PASS سبز · $FAIL قرمز"
[ "$FAIL" = "0" ] || exit 1

echo "── ۶) ثبت آزمون در شاهد ──"
python3 - <<PYEOF
import json, glob, os, urllib.request
rows = []
files = ["PN-014-ALL.zip", "PN-014-FINAL-REPORT.md", "PN-014-SHA256SUMS.txt", "PN-014-REJOIN.txt",
         "pn014/lock-in.json", "pn014/D1-ticket.md", "pn014/D2-publish-fix.json", "pn014/D3-decision.json",
         "pn014/D4-decision.json", "pn014/fixes.json", "pn014/phase5.json", "pn014/end-gate.json"]
files += sorted(glob.glob("deliver-store/pn014/screens/*.png") + glob.glob("deliver-store/PN-014-survival-part*.bin"))
for f in files:
    rel = f.replace("deliver-store/", "")
    try:
        code = urllib.request.urlopen(f"http://localhost:3000/deliver/{rel}").status
    except Exception as e:
        code = getattr(e, "code", 0)
    rows.append({"path": f"/deliver/{rel}", "status": code})
ok = sum(1 for r in rows if r["status"] == 200)
json.dump({"schema": "melka-pn014-deliver-links", "testedAt": __import__("datetime").datetime.utcnow().isoformat() + "Z",
           "method": "curl از مسیر تازهٔ /deliver (route) — قانون فایل v3",
           "rows": rows, "ok": ok, "total": len(rows)},
          open("download/pn014/deliver-links.json", "w"), ensure_ascii=False, indent=1)
print(f"  deliver-links.json: {ok}/{len(rows)} → 200")
PYEOF

echo "── ۷) به‌روزرسانی حجم مستقر (standalone سبک — بدون کپی deliver: بخشی از D2) ──"
echo "  standalone: $(du -sh .next/standalone | cut -f1) — تحویل‌ها فقط از route سرو می‌شوند"

echo "[تحویل PN-014 کامل] فایل‌ها: $(find "$DELIVER" -name 'PN-014-*' | wc -l)"
