#!/bin/bash
# PN-044 Phase 0.3.4c — Login with EXACT field names (Username/Password — from 422 validation errors)
set -uo pipefail
cd /home/z/my-project
LOG=download/pn044/recon.log
echo "" | tee -a "$LOG"
echo "=== 0.3.4c: Login with exact field names Username/Password ===" | tee -a "$LOG"

MELKETUN_USER=$(jq -r '.crm.username' upload/.runtime/melketun-secrets.json)
MELKETUN_PASS=$(jq -r '.crm.password' upload/.runtime/melketun-secrets.json)

rm -f /tmp/melketun-cookies.txt
curl -sS -c /tmp/melketun-cookies.txt -o /dev/null -w "GET /login → HTTP %{http_code}\n" "https://melketun.app/login" --max-time 30 2>&1 | tee -a "$LOG"

XSRF_COOKIE=$(grep -E 'XSRF-TOKEN' /tmp/melketun-cookies.txt 2>/dev/null | awk '{print $NF}' | head -1)
XSRF_DECODED=$(python3 -c "import urllib.parse,sys; print(urllib.parse.unquote(sys.argv[1]))" "$XSRF_COOKIE" 2>/dev/null)

CODE=$(curl -sS -o /tmp/mk-login-a3.html -w "%{http_code}" \
  -b /tmp/melketun-cookies.txt -c /tmp/melketun-cookies.txt \
  -X POST "https://melketun.app/login-store" \
  -H "X-XSRF-TOKEN: ${XSRF_DECODED}" \
  -H "Accept: application/json" \
  --data-urlencode "Username=${MELKETUN_USER}" \
  --data-urlencode "Password=${MELKETUN_PASS}" \
  --max-time 30 2>/dev/null || echo "000")
echo "Attempt 3 (Username/Password exact) → HTTP ${CODE}" | tee -a "$LOG"
if [ "$CODE" = "422" ] || [ "$CODE" = "401" ]; then
  head -c 400 /tmp/mk-login-a3.html | tee -a "$LOG"; echo "" | tee -a "$LOG"
fi

# Real auth check
DASH_CODE=$(curl -sS -o /tmp/mk-dashboard.html -w "%{http_code}" -b /tmp/melketun-cookies.txt -L --max-time 30 "https://melketun.app/dashboard" 2>/dev/null || echo "000")
DASH_CODE_NOFOLLOW=$(curl -sS -o /dev/null -w "%{http_code}" -b /tmp/melketun-cookies.txt --max-time 30 "https://melketun.app/dashboard" 2>/dev/null || echo "000")
echo "GET /dashboard (no-follow) → HTTP ${DASH_CODE_NOFOLLOW} $([ "$DASH_CODE_NOFOLLOW" = "200" ] && echo '← AUTHENTICATED ✅' || echo '← NOT authed ❌')" | tee -a "$LOG"

echo "--- Session cookies (names only) ---" | tee -a "$LOG"
grep -v "^#" /tmp/melketun-cookies.txt 2>/dev/null | awk '{print $6}' | sort -u | tee -a "$LOG"

if [ "$DASH_CODE_NOFOLLOW" = "200" ]; then
  echo "REAL_LOGIN_SUCCESS: 1 ✅" | tee -a "$LOG"
  echo "PATH: SESSION_HTML_ADAPTER — authed Inertia HTML pages, scrape with session" | tee -a "$LOG"
  python3 - "$MELKETUN_PASS" <<'PYEOF'
import sys
pw = sys.argv[1] if len(sys.argv) > 1 else ''
html = open('/tmp/mk-dashboard.html', encoding='utf-8', errors='replace').read()
if pw and len(pw) > 2 and pw in html:
    html = html.replace(pw, '***REMOVED***')
open('download/pn044/dashboard-authenticated.html', 'w', encoding='utf-8').write(html)
print('dashboard-authenticated.html saved:', len(html), 'bytes')
PYEOF
else
  echo "REAL_LOGIN_SUCCESS: 0 ❌" | tee -a "$LOG"
  head -c 600 /tmp/mk-login-a3.html | tee -a "$LOG"; echo "" | tee -a "$LOG"
fi
echo "0.3.4c DONE"
