#!/bin/bash
# PN-044 Phase 0.3.4b — Retry login with DISCOVERED endpoint (login-store, from Ziggy route map)
# Laravel Inertia: CSRF via X-XSRF-TOKEN header (from XSRF-TOKEN cookie) or _token field
# Law: never print password. Only YES/NO / HTTP codes.
set -uo pipefail
cd /home/z/my-project
LOG=download/pn044/recon.log
echo "" | tee -a "$LOG"
echo "=== 0.3.4b: Login retry with discovered endpoint POST /login-store ===" | tee -a "$LOG"

MELKETUN_USER=$(jq -r '.crm.username' upload/.runtime/melketun-secrets.json)
MELKETUN_PASS=$(jq -r '.crm.password' upload/.runtime/melketun-secrets.json)

# Fresh session: GET /login → collect XSRF-TOKEN + session cookies
rm -f /tmp/melketun-cookies.txt
curl -sS -c /tmp/melketun-cookies.txt -o /tmp/melketun-login2.html -w "GET /login → HTTP %{http_code}\n" "https://melketun.app/login" --max-time 30 2>&1 | tee -a "$LOG"

# CSRF token extraction
CSRF_META=$(grep -oE '<meta[^>]*name="csrf-token"[^>]*content="[^"]*"' /tmp/melketun-login2.html 2>/dev/null | grep -oE 'content="[^"]*"' | sed 's/content="//;s/"//' | head -1)
XSRF_COOKIE=$(grep -E 'XSRF-TOKEN' /tmp/melketun-cookies.txt 2>/dev/null | awk '{print $NF}' | head -1)
echo "csrf-token meta found: $([ -n "$CSRF_META" ] && echo 'YES' || echo 'NO')" | tee -a "$LOG"
echo "XSRF-TOKEN cookie found: $([ -n "$XSRF_COOKIE" ] && echo 'YES' || echo 'NO')" | tee -a "$LOG"

# Laravel expects X-XSRF-TOKEN header = URL-DECODED cookie value
XSRF_DECODED=$(python3 -c "import urllib.parse,sys; print(urllib.parse.unquote(sys.argv[1]))" "$XSRF_COOKIE" 2>/dev/null)

# Attempt 1: email + password (Laravel default) with X-XSRF-TOKEN header
CODE1=$(curl -sS -o /tmp/mk-login-a1.html -w "%{http_code}" \
  -b /tmp/melketun-cookies.txt -c /tmp/melketun-cookies.txt \
  -X POST "https://melketun.app/login-store" \
  -H "X-XSRF-TOKEN: ${XSRF_DECODED}" \
  -H "Accept: application/json" \
  -H "X-Requested-With: XMLHttpRequest" \
  --data-urlencode "email=${MELKETUN_USER}" \
  --data-urlencode "password=${MELKETUN_PASS}" \
  --max-time 30 2>/dev/null || echo "000")
echo "Attempt 1 (email+password, X-XSRF-TOKEN) → HTTP ${CODE1}" | tee -a "$LOG"
grep -oE '"(message|errors?)"[^}]*' /tmp/mk-login-a1.html 2>/dev/null | head -5 | sed 's/"/\"/g' | tee -a "$LOG"

# Attempt 2: username + password (if attempt 1 indicates wrong fields — 422 shows required fields)
if [ "${CODE1:-000}" = "422" ]; then
  echo "--- 422 body (validation hints) ---" | tee -a "$LOG"
  head -c 500 /tmp/mk-login-a1.html | tee -a "$LOG"; echo "" | tee -a "$LOG"
  CODE2=$(curl -sS -o /tmp/mk-login-a2.html -w "%{http_code}" \
    -b /tmp/melketun-cookies.txt -c /tmp/melketun-cookies.txt \
    -X POST "https://melketun.app/login-store" \
    -H "X-XSRF-TOKEN: ${XSRF_DECODED}" \
    -H "Accept: application/json" \
    --data-urlencode "username=${MELKETUN_USER}" \
    --data-urlencode "password=${MELKETUN_PASS}" \
    --max-time 30 2>/dev/null || echo "000")
  echo "Attempt 2 (username+password) → HTTP ${CODE2}" | tee -a "$LOG"
fi

# ── Verification: real auth check = GET /dashboard (302=not authed, 200=authed) ──
echo "--- Real auth verification ---" | tee -a "$LOG"
DASH_CODE=$(curl -sS -o /tmp/mk-dashboard.html -w "%{http_code}" -b /tmp/melketun-cookies.txt "https://melketun.app/dashboard" --max-time 30 2>/dev/null || echo "000")
echo "GET /dashboard with session → HTTP ${DASH_CODE} $([ "$DASH_CODE" = "200" ] && echo '← AUTHENTICATED ✅' || echo '← NOT authenticated ❌')" | tee -a "$LOG"

# Cookie names (not values)
echo "--- Session cookies now (names only) ---" | tee -a "$LOG"
grep -v "^#" /tmp/melketun-cookies.txt 2>/dev/null | awk '{print $6}' | sort -u | tee -a "$LOG"

# Final honest verdict update
echo "" | tee -a "$LOG"
echo "=== VERDICT UPDATE (0.3.4b) ===" | tee -a "$LOG"
echo "LOGIN_ENDPOINT: POST /login-store (Laravel Inertia — discovered via Ziggy route map)" | tee -a "$LOG"
echo "REAL_LOGIN_SUCCESS: $([ "$DASH_CODE" = "200" ] && echo 1 || echo 0)  # dashboard 200 = truly authed (302 redirect = not)" | tee -a "$LOG"
echo "FRAMEWORK: Laravel + Inertia (Vue) — MELKETUN_CRM" | tee -a "$LOG"
echo "REST_PUBLIC_API: 0  # all /api/* probes 404 (only api/mobile-app/version exists)" | tee -a "$LOG"
echo "SESSION_AUTH: 1  # XSRF-TOKEN/session cookies" | tee -a "$LOG"
if [ "$DASH_CODE" = "200" ]; then
  echo "PATH: SESSION_HTML_ADAPTER  # authed HTML pages (Inertia) — scrape data pages with session cookie" | tee -a "$LOG"
else
  echo "PATH: STOP_PN044  # login failed — owner decision needed" | tee -a "$LOG"
fi

# Save authenticated dashboard sample (sanitized) for evidence
if [ "$DASH_CODE" = "200" ] && [ -s /tmp/mk-dashboard.html ]; then
  python3 - "$MELKETUN_PASS" <<'PYEOF'
import sys
pw = sys.argv[1] if len(sys.argv) > 1 else ''
html = open('/tmp/mk-dashboard.html', encoding='utf-8', errors='replace').read()
if pw and len(pw) > 2 and pw in html:
    html = html.replace(pw, '***REMOVED***')
open('download/pn044/dashboard-authenticated.html', 'w', encoding='utf-8').write(html)
print('dashboard-authenticated.html saved:', len(html), 'bytes')
PYEOF
fi
echo "0.3.4b DONE"
