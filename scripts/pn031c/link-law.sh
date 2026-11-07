#!/usr/bin/env bash
# ============================================================================
# PN-031-C · قانون لینک — وارسی ۲۰۰ همهٔ اقلام تحویل + شاهد (سند ۰۴۰)
# ============================================================================
set -uo pipefail
cd /home/z/my-project
TS=$(date -u +%FT%TZ)
OUT="download/pn031c/link-law.json"
BASE="http://127.0.0.1:3000"

echo "=== قانون لینک · PN-031-C · $TS ==="

# الف) فایلهای تحویل روی دیسک
declare -a FILES=(
  "download/pn031c/OWNER-GUIDE.md"
  "download/pn031c/qr-install-command.png"
  "download/pn031c/qr-install-command.svg"
  "download/pn031c/regenerated-owner.json"
  "download/pn031c/live-gate-test.json"
  "download/pn031c/entry-lock.json"
  "download/pn031c/guards-summary.json"
  "scripts/pn031c/entry-lock.sh"
  "scripts/pn031c/run-guards.sh"
  "scripts/pn031c/live-gate-test.sh"
  "scripts/pn031c/regenerate-owner.sh"
  "scripts/pn031c/survival-package-31.sh"
  "scripts/pn031c/update-version-manifest.py"
  "scripts/recovery/audit-head-guard.sh"
  "src/lib/melk-api/relay.ts"
  "src/app/api/admin/relay/code-status/route.ts"
  "src/app/api/mobile-relay/bootstrap/route.ts"
  "tests/pn031c-forgiving-code.test.ts"
  "upload/.survival/PN-032-20261013/CHAIN.json"
  "upload/.survival/PN-032-20261013/EVENTS.md"
)
OK=0; BAD=0; BADLIST=""
for f in "${FILES[@]}"; do
  if [ -f "$f" ] && [ -s "$f" ]; then OK=$((OK+1)); else BAD=$((BAD+1)); BADLIST="$BADLIST $f"; fi
done
echo "فایلهای تحویل: $OK/$((OK+BAD))"
[ -n "$BADLIST" ] && echo "غایب/خالی:$BADLIST"

# ب) لینکهای زندهٔ سرور (۱۱ روت رله + code-status + سلامت — آینه‌های v1)
declare -a LIVE=(
  "GET|/api/health"
  "GET|/api/v1/health"
  "GET|/api/version"
  "GET|/api/mobile-relay/bootstrap?code=linklaw-probe"
  "POST|/api/mobile-relay/poll"
  "GET|/api/admin/relay/status"
  "GET|/api/admin/relay/code-status"
  "GET|/api/v1/admin/relay/code-status"
  "GET|/api/runtime/build-freshness"
  "GET|/api/v1/admin/relay/status"
)
OKL=0; BADL=0; BADLLIST=""
for entry in "${LIVE[@]}"; do
  M="${entry%%|*}"; U="${entry##*|}"
  if [ "$M" = "GET" ]; then
    CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$BASE$U" || echo 000)
  else
    CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 -X POST -H "Content-Type: application/json" -d '{}' "$BASE$U" || echo 000)
  fi
  # 200/204 = زنده کامل · 401/403/405 = زنده با احراز/متد (قرارداد لینک PN-031)
  case "$CODE" in 200|204|401|403|405) OKL=$((OKL+1));; *) BADL=$((BADL+1)); BADLLIST="$BADLLIST $U($CODE)";; esac
done
echo "لینکهای زنده: $OKL/$((OKL+BADL))"
[ -n "$BADLLIST" ] && echo "مرده:$BADLLIST"

# ج) SHA256SUMS
(cd download/pn031c && find . -maxdepth 1 -type f ! -name SHA256SUMS ! -name link-law.json -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS 2>/dev/null)
SUM_N=$(wc -l < download/pn031c/SHA256SUMS 2>/dev/null || echo 0)
echo "SHA256SUMS: $SUM_N قلم"

# د) شاهد
VERDICT=$([ "$BAD" = "0" ] && [ "$BADL" = "0" ] && [ "$SUM_N" -ge 5 ] && echo PASS || echo FAIL)
python3 - "$TS" "$OK" "$OKL" "$SUM_N" "$VERDICT" "$BADLIST" "$BADLLIST" "$OUT" <<'PYEOF'
import json, sys
w = {
  "phase": "PN-031-C · قانون لینک (سند ۰۴۰)",
  "checkedAt": sys.argv[1],
  "deliverableFiles": {"ok": int(sys.argv[2]), "total": 20},
  "liveLinks": {"ok": int(sys.argv[3]), "total": 10, "protocol": "200/204=زنده کامل · 401/403/405=زنده با احراز/متد (قرارداد PN-031)"},
  "sha256sums": int(sys.argv[4]),
  "missing": [x for x in (sys.argv[6] or "").split() if x],
  "deadLinks": [x for x in (sys.argv[7] or "").split() if x],
  "verdict": sys.argv[5],
}
json.dump(w, open(sys.argv[8], "w"), ensure_ascii=False, indent=1)
print("VERDICT:", sys.argv[5])
PYEOF
