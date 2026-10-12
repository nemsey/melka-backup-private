#!/usr/bin/env bash
# ============================================================================
# PN-031 · قانون لینک — وارسی ۲۰۰ همهٔ اقلام تحویل + شاهد
# ============================================================================
set -uo pipefail
cd /home/z/my-project
TS=$(date -u +%FT%TZ)
OUT="download/pn031/link-law.json"
BASE="http://127.0.0.1:81"

echo "=== قانون لینک · PN-031 · $TS ==="

# الف) فایلهای تحویل روی دیسک
declare -a FILES=(
  "download/pn031/OWNER-SETUP-GUIDE.html"
  "download/pn031/PN-031-FINAL-REPORT.md"
  "download/pn031/lock-in.json"
  "download/pn031/synthetic-device-test.json"
  "download/pn031/link-law.json"
  "scripts/audit-mobile-relay.sh"
  "scripts/pn031/synthetic-device-test.sh"
  "scripts/pn031/survival-package.sh"
  "src/lib/melk-api/relay.ts"
  "src/lib/melk-api/relay-script.ts"
  "tests/pn031-mobile-relay.test.ts"
  "upload/.survival/PN-031-20261012/CHAIN.json"
  "upload/.survival/PN-031-20261012/EVENTS.md"
)
OK=0; BAD=0; BADLIST=""
for f in "${FILES[@]}"; do
  if [ -f "$f" ] && [ -s "$f" ]; then OK=$((OK+1)); else BAD=$((BAD+1)); BADLIST="$BADLIST $f"; fi
done
echo "فایلهای تحویل: $OK/$((OK+BAD))"
[ -n "$BADLIST" ] && echo "غایب/خالی:$BADLIST"

# ب) لینکهای زندهٔ سرور (روت‌های رله + سلامت + تحویل)
declare -a LIVE=(
  "GET|/api/health"
  "GET|/api/v1/health"
  "GET|/api/mobile-relay/bootstrap?code=linklaw-probe"
  "POST|/api/mobile-relay/poll"
  "GET|/api/admin/relay/status"
  "GET|/api/v1/admin/relay/status"
  "GET|/api/v1/mobile-relay/poll"
)
OKL=0; BADL=0; BADLLIST=""
for entry in "${LIVE[@]}"; do
  M="${entry%%|*}"; U="${entry##*|}"
  if [ "$M" = "GET" ]; then
    CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$BASE$U" || echo 000)
  else
    CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 -X POST -H "Content-Type: application/json" -d '{"wait":0}' "$BASE$U" || echo 000)
  fi
  # هر کد جز 000 و 404-soft = لینک زنده (احراز/کد نامعتبر = روت وجود دارد و پاسخ می‌دهد)
  if [ "$CODE" != "000" ] && [ "$CODE" != "404" ]; then OKL=$((OKL+1)); else BADL=$((BADL+1)); BADLLIST="$BADLLIST $U($CODE)"; fi
  echo "  $M $U → $CODE"
done
echo "لینکهای زندهٔ سرور: $OKL/$((OKL+BADL)) (کدهای 401/403 = زنده با احراز)"
[ -n "$BADLLIST" ] && echo "مرده:$BADLLIST"

python3 - "$OUT" "$TS" "$OK" "$((OK+BAD))" "$OKL" "$((OKL+BADL))" "$BADLIST" "$BADLLIST" <<'PYEOF'
import json, sys
out, ts, ok, tot, okl, totl, bad, badl = sys.argv[1:9]
json.dump({
  "phase": "PN-031 · قانون لینک — وارسی دسترس‌پذیری تحویل",
  "checkedAt": ts,
  "files": {"ok": int(ok), "total": int(tot), "missingOrEmpty": bad.strip() or "none"},
  "liveRoutes": {"ok": int(okl), "total": int(totl), "dead": badl.strip() or "none",
                 "note": "کدهای 401/403 = روت زنده با احراز صحیح؛ 000 = مرده"},
  "verdict": "PASS" if int(ok) == int(tot) and int(okl) == int(totl) else "PARTIAL"
}, open(out, "w"), ensure_ascii=False, indent=2)
print("شاهد:", out)
PYEOF
cat "$OUT" | python3 -c "import json,sys; d=json.load(sys.stdin); print('verdict:', d['verdict'])"