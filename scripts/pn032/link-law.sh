#!/usr/bin/env bash
# PN-032 · قانون لینک — وارسی ۲۰۰ همهٔ اقلام تحویل از URL عمومی + شاهد
set -uo pipefail
cd /home/z/my-project
TS=$(date -u +%FT%TZ)
BASE="https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai"
OUT="download/pn032/link-law.json"

echo "=== قانون لینک · PN-032 · $TS ==="

cp download/pn032/PN-032-FINAL-REPORT.md deliver-store/pn032/ 2>/dev/null || true
cp download/pn032/SHA256SUMS.txt deliver-store/pn032/ 2>/dev/null || true
cp download/pn032/PN-032-ALL.zip deliver-store/pn032/ 2>/dev/null || true

declare -a FILES=(
  "PN-032-FINAL-REPORT.md"
  "build-freshness.json"
  "offline-flag-removed.json"
  "restart-proof.json"
  "tunnel-alive.json"
  "entry-lock.json"
  "guards-summary.json"
  "guards-raw.txt"
  "tests-run1.log"
  "tests-run2.log"
  "SHA256SUMS.txt"
  "melka-relay.apk"
  "qr-install.png"
  "OWNER-GUIDE.html"
  "CHAIN.json"
  "EVENTS.md"
)

OK=0; BAD=0; RESULT=""
for f in "${FILES[@]}"; do
  if [ ! -f "download/pn032/$f" ] && [ ! -f "deliver-store/pn032/$f" ]; then
    # SHA256SUMS/ZIP بعداً ساخته می‌شوند — از deliver-store چک می‌شوند
    :
  fi
  CODE=$(timeout 15 curl -s -m 12 -o /dev/null -w "%{http_code}" "$BASE/deliver/pn032/$f" 2>/dev/null || echo "ERR")
  if [ "$CODE" = "200" ]; then OK=$((OK+1)); RESULT="$RESULT {\"name\":\"$f\",\"status\":200},"
  else BAD=$((BAD+1)); RESULT="$RESULT {\"name\":\"$f\",\"status\":\"$CODE\"},"; echo "  ✗ $f → $CODE"; fi
done
RESULT="[${RESULT%,}]"

# سرور + publish
HEALTH=$(timeout 15 curl -s -m 12 -o /dev/null -w "%{http_code}" "$BASE/api/health" 2>/dev/null || echo ERR)
VERSION=$(timeout 15 curl -s -m 12 "$BASE/api/version" 2>/dev/null | sed -n 's/.*"buildId":"\([^"]*\)".*/\1/p')
PUBLISH=$(timeout 15 curl -s -m 12 -o /dev/null -w "%{http_code}" "https://c1vdh8442240-d.space-z.ai/api/health" 2>/dev/null || echo ERR)

VERDICT="PASS"; [ "$BAD" -gt 0 ] && VERDICT="FAIL"; [ "$HEALTH" != "200" ] && VERDICT="FAIL"

python3 - "$OUT" "$TS" "$OK" "$BAD" "$RESULT" "$HEALTH" "$VERSION" "$PUBLISH" "$VERDICT" <<'PYEOF'
import json, sys
out, ts, ok, bad, links, health, version, publish, verdict = sys.argv[1:10]
d = {
  "phase": "PN-032 (شورا-ن۰۵۲) — قانون لینک",
  "at": ts,
  "server": {
    "previewBase": "https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai",
    "previewHealth": health,
    "previewBuildId": version,
    "publishBase": "https://c1vdh8442240-d.space-z.ai",
    "publishHealth": publish,
    "publishNote": "دامنهٔ publish طبق مستند P6521/P6526 «Recycled» — تازه‌سازی فقط از مودال UI مالک (زیرساخت پلتفرم، خارج از ریپو). لینک تحویلِ کارِ مالک مطابق معماری، دامنهٔ preview است.",
  },
  "linksOk": int(ok),
  "linksBad": int(bad),
  "linksChecked": json.loads(links),
  "verdict": verdict,
}
json.dump(d, open(out, "w"), ensure_ascii=False, indent=2)
print(f"لینک‌ها: {ok} سبز · {bad} قرمز · health={health} · build={version} · publish={publish} → {verdict}")
PYEOF
