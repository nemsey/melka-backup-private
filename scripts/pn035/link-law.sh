#!/usr/bin/env bash
# PN-035 · قانون لینک — کپی تحویل‌ها به deliver-store + وارسی ۲۰۰ از URL عمومی + شاهد
set -uo pipefail
cd /home/z/my-project
TS=$(date -u +%FT%TZ)
BASE="https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai"
OUT="download/pn035/link-law.json"

echo "=== قانون لینک · PN-035 · $TS ==="

mkdir -p deliver-store/pn035
cp download/pn035/PN-035-FINAL-REPORT.md deliver-store/pn035/ 2>/dev/null || true
cp download/pn035/SHA256SUMS.txt deliver-store/pn035/ 2>/dev/null || true
for f in async-pattern-proof.json relay-post-fix.json result-path-fix.json longpoll-latency.json batch-sync-proof.json capacity-benchmark.json otp-e2e-live.json fresh-install-code.json guards-summary.json guards-raw.txt; do
  cp "download/pn035/$f" deliver-store/pn035/ 2>/dev/null || echo "  (فاقد: $f)"
done
cp download/pn035/ui-eager-otp.png download/pn035/ui-connection-eager.png deliver-store/pn035/ 2>/dev/null || true

declare -a FILES=(
  "PN-035-FINAL-REPORT.md"
  "async-pattern-proof.json"
  "relay-post-fix.json"
  "result-path-fix.json"
  "longpoll-latency.json"
  "batch-sync-proof.json"
  "capacity-benchmark.json"
  "otp-e2e-live.json"
  "fresh-install-code.json"
  "guards-summary.json"
  "guards-raw.txt"
  "ui-eager-otp.png"
  "ui-connection-eager.png"
  "SHA256SUMS.txt"
)

PASS=0; FAIL=0
for f in "${FILES[@]}"; do
  CODE=$(curl -s --max-time 15 -o /dev/null -w "%{http_code}" "$BASE/deliver/pn035/$f")
  if [ "$CODE" = "200" ]; then PASS=$((PASS+1)); echo "  200  $f";
  else FAIL=$((FAIL+1)); echo "  $CODE  $f ← خطا"; fi
done

BUILD_ID=$(curl -s --max-time 15 "$BASE/api/version" | python3 -c "import json,sys; print(json.load(sys.stdin).get('buildId',''))")

python3 - "$PASS" "$FAIL" "$BUILD_ID" "$TS" <<'PYEOF'
import json, sys
p, f, bid, ts = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3], sys.argv[4]
json.dump(
    {
        "law": "قانون لینک (الگوی PN-032) — هر قلم تحویل از URL عمومی ۲۰۰",
        "pass": p,
        "fail": f,
        "total": p + f,
        "baseUrl": "https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai/deliver/pn035/",
        "buildId": bid,
        "at": ts,
        "verdict": "PASS" if f == 0 and bid.startswith("b6428a5") else "FAIL",
    },
    open("download/pn035/link-law.json", "w", encoding="utf8"),
    ensure_ascii=False,
    indent=2,
)
PYEOF
echo "— نتیجه: $PASS سبز / $FAIL قرمز (بیلد $BUILD_ID)"
[ "$FAIL" -eq 0 ] || exit 1
