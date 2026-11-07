#!/usr/bin/env bash
# post-rebuild-verify.sh — PN-031-F · فاز H: راستی‌آزمایی زندهٔ پس از بیلد نهایی
# استقرار همهٔ اقلام در ۴ مکان + جدول لینک ۲۰۰ از URL عمومی + شاهد link-law.json
set -euo pipefail
cd /home/z/my-project

PUBLIC_URL="https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai"
SRC="download/pn031e"
DESTS=(deliver-store/pn031e public/deliver/pn031e .next/standalone/public/deliver/pn031e)

echo "— استقرار اقلام تحویل در $((${#DESTS[@]}+1)) مکان…"
for d in "${DESTS[@]}"; do
  mkdir -p "$d"
  for f in PN-031-F-FINAL-REPORT.md OWNER-GUIDE.html qr-install.png melka-relay.apk \
           qr-apk.png qr-apk.svg phase-d-witness.json phase-f-witness.json \
           tests-run1.log tests-run2.log guards-raw.txt guards-summary.json \
           live-relay-test.json relay-script-run.log; do
    [ -f "$SRC/$f" ] && cp "$SRC/$f" "$d/$f"
  done
done
echo "  ✓ (download = منبع · ۳ مقصد کپی شد)"

# ── راستی‌آزمایی زنده ──
echo "— راستی‌آزمایی زنده از URL عمومی…"
B_LIVE=$(curl -s -m 10 http://127.0.0.1:3000/api/version | python3 -c "import json,sys;print(json.load(sys.stdin)['fingerprint']['gitSha'][:8])")
B_HEAD=$(git rev-parse --short=8 HEAD)
H=$(curl -s -o /dev/null -w "%{http_code}" -m 10 http://127.0.0.1:3000/api/health)
[ "$B_LIVE" = "$B_HEAD" ] || { echo "✗ BUILD_ID ($B_LIVE) ≠ HEAD ($B_HEAD)"; exit 1; }
[ "$H" = "200" ] || { echo "✗ health=$H"; exit 1; }
echo "  سرور: health=200 · BUILD_ID=$B_LIVE=HEAD ✓"

declare -a LINKS=(
  "PN-031-F-FINAL-REPORT.md:$PUBLIC_URL/deliver/pn031e/PN-031-F-FINAL-REPORT.md"
  "melka-relay.apk:$PUBLIC_URL/deliver/pn031e/melka-relay.apk"
  "qr-install.png:$PUBLIC_URL/deliver/pn031e/qr-install.png"
  "OWNER-GUIDE.html:$PUBLIC_URL/deliver/pn031e/OWNER-GUIDE.html"
  "tests-run1.log:$PUBLIC_URL/deliver/pn031e/tests-run1.log"
  "tests-run2.log:$PUBLIC_URL/deliver/pn031e/tests-run2.log"
  "guards-summary.json:$PUBLIC_URL/deliver/pn031e/guards-summary.json"
  "qr-apk.svg:$PUBLIC_URL/deliver/pn031e/qr-apk.svg"
)
LJ="[]"; OK=0; BAD=0; BADL=""
for entry in "${LINKS[@]}"; do
  NAME="${entry%%:*}"; URL="${entry#*:}"
  C=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "$URL")
  echo "  $NAME → $C"
  if [ "$C" = "200" ]; then OK=$((OK+1)); else BAD=$((BAD+1)); BADL="$BADL $NAME($C)"; fi
  LJ=$(echo "$LJ" | python3 -c "import json,sys;l=json.load(sys.stdin);l.append({'name':'$NAME','status':int('$C')});print(json.dumps(l))")
done
[ "$BAD" = "0" ] || { echo "✗ لینک‌های خراب:$BADL"; exit 1; }
echo "  ✓ $OK/$OK لینک ۲۰۰"

python3 - "$B_LIVE" "$H" "$OK" "$LJ" <<'PYEOF'
import json, sys, datetime
w = {
  "phase": "PN-031-F · فاز H — راستی‌آزمایی پس از بیلد نهایی",
  "at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
  "server": {"buildId": sys.argv[1] + " (= HEAD)", "health": int(sys.argv[2])},
  "linksOk": int(sys.argv[3]),
  "linksChecked": json.loads(sys.argv[4]),
  "note": "همهٔ لینک‌ها از URL عمومی preview — مطابق قانون لینک",
  "verdict": "PASS",
}
json.dump(w, open("download/pn031e/link-law.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("link-law.json ✓ PASS")
PYEOF
for d in "${DESTS[@]}"; do cp download/pn031e/link-law.json "$d/link-law.json" 2>/dev/null || true; done
echo "═══ راستی‌آزمایی پس از بیلد: PASS ═══"
