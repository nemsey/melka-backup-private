#!/bin/bash
# PN-044 Phase 0.3 — Deep recon of melketun.app CRM (6 tests)
# Law: never print password in any log. Only YES/NO.
# Timeout: each curl max 30s.
set -uo pipefail
cd /home/z/my-project
LOG=download/pn044/recon.log
: > "$LOG"

# ── 0.3.1 — Login page form analysis ──────────────────────────────
echo "=== 0.3.1: Login page form analysis ===" | tee -a "$LOG"
curl -sSL "https://melketun.app/login" -c /tmp/melketun-cookies.txt -o /tmp/melketun-login.html --max-time 30 2>&1 | tee -a "$LOG"

echo "--- Forms ---" | tee -a "$LOG"
grep -oE '<form[^>]*action="[^"]*"' /tmp/melketun-login.html 2>/dev/null | head -5 | tee -a "$LOG"
echo "--- Input names ---" | tee -a "$LOG"
grep -oE 'name="[a-zA-Z_]+"' /tmp/melketun-login.html 2>/dev/null | sort -u | head -10 | tee -a "$LOG"
echo "--- CSRF token present? ---" | tee -a "$LOG"
grep -iE 'csrf|_token|authenticity' /tmp/melketun-login.html 2>/dev/null | head -3 | tee -a "$LOG"
echo "--- Framework signature ---" | tee -a "$LOG"
grep -oiE '(laravel|django|rails|next|react|vue|php|drupal|wordpress)' /tmp/melketun-login.html 2>/dev/null | sort -u | head -5 | tee -a "$LOG"
echo "--- Page size: $(wc -c < /tmp/melketun-login.html 2>/dev/null) bytes ---" | tee -a "$LOG"

# ── 0.3.2 — Common API path probe ─────────────────────────────────
echo "=== 0.3.2: Common API path probe ===" | tee -a "$LOG"
for EP in "/api/v1/auth" "/api/v1/login" "/api/auth/login" "/api/login" "/auth/login" \
          "/api/v1/listings" "/api/listings" "/api/v1/properties" "/api/properties" \
          "/api/v1/requests" "/api/requests" \
          "/api/v1/transactions" "/api/transactions" \
          "/api/v1/experts" "/api/experts" \
          "/ajax/login" "/json/login" "/graphql" "/api/graphql" \
          "/api/health" "/api/v1/health" "/api/version"; do
  CODE=$(curl -sS -o /dev/null -w "%{http_code}" "https://melketun.app${EP}" --max-time 10 2>/dev/null || echo "000")
  echo "melketun.app${EP} → ${CODE}" | tee -a "$LOG"
done

# REST validation (honest check): same-line path+200 AND body is JSON
echo "--- JSON body validation for 200 API hits ---" | tee -a "$LOG"
while IFS= read -r line; do
  EP=$(echo "$line" | grep -oE '/api/[^ ]*|/auth/[^ ]*|/ajax/[^ ]*|/json/[^ ]*|/graphql' | head -1)
  CODE=$(echo "$line" | grep -oE '→ [0-9]+' | grep -oE '[0-9]+')
  if [ "${CODE:-000}" = "200" ] && [ -n "${EP:-}" ]; then
    BODY=$(curl -sS "https://melketun.app${EP}" --max-time 15 2>/dev/null | head -c 200)
    FIRST=$(echo "$BODY" | head -c 1)
    if [ "$FIRST" = "{" ] || [ "$FIRST" = "[" ]; then
      echo "melketun.app${EP} → 200 + JSON ✅ (body starts: ${FIRST}…)" | tee -a "$LOG"
    else
      echo "melketun.app${EP} → 200 but NOT JSON (HTML?) — body: $(echo "$BODY" | head -c 80)" | tee -a "$LOG"
    fi
  fi
done < <(grep -E '→ (200|000)' "$LOG" | grep -E '/api/|/auth/|/ajax/|/json/|/graphql')

# ── 0.3.3 — robots.txt + sitemap ───────────────────────────────────
echo "=== 0.3.3: robots.txt + sitemap ===" | tee -a "$LOG"
curl -sS "https://melketun.app/robots.txt" --max-time 15 2>&1 | head -30 | tee -a "$LOG"
echo "--- sitemap ---" | tee -a "$LOG"
curl -sS "https://melketun.app/sitemap.xml" --max-time 15 2>&1 | head -20 | tee -a "$LOG"

# ── 0.3.4 — Real login attempt (session hypothesis) ───────────────
echo "=== 0.3.4: Real login attempt (session hypothesis) ===" | tee -a "$LOG"

FORM_ACTION=$(grep -oE '<form[^>]*action="[^"]*"' /tmp/melketun-login.html 2>/dev/null | head -1 | grep -oE 'action="[^"]*"' | sed 's/action="//;s/"//')
FORM_ACTION="${FORM_ACTION:-/login}"
echo "Form action: ${FORM_ACTION}" | tee -a "$LOG"

CSRF=$(grep -oE 'name="_token"[^>]*value="[^"]*"' /tmp/melketun-login.html 2>/dev/null | head -1 | grep -oE 'value="[^"]*"' | sed 's/value="//;s/"//')
echo "CSRF token found: $([ -n "$CSRF" ] && echo 'YES' || echo 'NO')" | tee -a "$LOG"

USERNAME_FIELD="username"
PASSWORD_FIELD="password"
grep -qE 'name="email"' /tmp/melketun-login.html && USERNAME_FIELD="email"

echo "Username field: $USERNAME_FIELD" | tee -a "$LOG"
echo "Password field: $PASSWORD_FIELD" | tee -a "$LOG"

MELKETUN_USER=$(jq -r '.crm.username' upload/.runtime/melketun-secrets.json 2>/dev/null || echo "")
MELKETUN_PASS=$(jq -r '.crm.password' upload/.runtime/melketun-secrets.json 2>/dev/null || echo "")

if [ -z "$MELKETUN_PASS" ]; then
  echo "❌ MISSING: upload/.runtime/melketun-secrets.json not found or corrupted" | tee -a "$LOG"
else
  LOGIN_CODE=$(curl -sS -o /tmp/melketun-login-resp.html -w "%{http_code}" \
    -b /tmp/melketun-cookies.txt -c /tmp/melketun-cookies.txt \
    -X POST "https://melketun.app${FORM_ACTION}" \
    --data-urlencode "${USERNAME_FIELD}=${MELKETUN_USER}" \
    --data-urlencode "${PASSWORD_FIELD}=${MELKETUN_PASS}" \
    ${CSRF:+--data-urlencode "_token=${CSRF}"} \
    -L --max-time 30 2>&1)
  echo "Login POST → HTTP ${LOGIN_CODE}" | tee -a "$LOG"

  echo "--- Cookies after login (names only) ---" | tee -a "$LOG"
  cat /tmp/melketun-cookies.txt 2>/dev/null | grep -v "^#" | awk '{print $6}' | sort -u | tee -a "$LOG"

  FINAL_URL=$(curl -sS -o /dev/null -w "%{url_effective}" -b /tmp/melketun-cookies.txt "https://melketun.app/" --max-time 15 2>&1)
  echo "Final URL after login + visit /: ${FINAL_URL}" | tee -a "$LOG"

  curl -sSL -b /tmp/melketun-cookies.txt "https://melketun.app/" --max-time 15 2>/dev/null > /tmp/melketun-after-login.html
  echo "--- Login success markers ---" | tee -a "$LOG"
  grep -oE '(logout|خروج|dashboard|پنل|Sarmasti)' /tmp/melketun-after-login.html 2>/dev/null | sort -u | head -10 | tee -a "$LOG"

  # Save sanitized HTML (scrub password if echoed back by form refill)
  if [ -s /tmp/melketun-after-login.html ]; then
    python3 - "$MELKETUN_PASS" <<'PYEOF'
import sys
pw = sys.argv[1] if len(sys.argv) > 1 else ''
html = open('/tmp/melketun-after-login.html', encoding='utf-8', errors='replace').read()
if pw and len(pw) > 2 and pw in html:
    html = html.replace(pw, '***REMOVED***')
    print('NOTE: password string found in HTML — scrubbed before saving')
open('download/pn044/after-login-page.html', 'w', encoding='utf-8').write(html)
PYEOF
    echo "after-login-page.html saved ($(wc -c < download/pn044/after-login-page.html) bytes)" | tee -a "$LOG"
  fi
fi

# ── 0.3.5 — Data pages probe (with session) ────────────────────────
echo "=== 0.3.5: Data pages probe (with session) ===" | tee -a "$LOG"
for PAGE in "/dashboard" "/panel" "/listings" "/properties" "/requests" "/transactions" "/experts" "/agents" "/melk" "/agahi"; do
  CODE=$(curl -sS -o /dev/null -w "%{http_code}" -b /tmp/melketun-cookies.txt "https://melketun.app${PAGE}" --max-time 10 2>/dev/null || echo "000")
  echo "melketun.app${PAGE} → ${CODE}" | tee -a "$LOG"
done

# ── 0.3.6 — VERDICT ────────────────────────────────────────────────
echo "=== 0.3.6: VERDICT ===" | tee -a "$LOG"

REST_API_FOUND=0
HTML_FOUND=0
SESSION_AUTH=0
LOGIN_SUCCESS=0

# REST API: SAME LINE has api-path + 200, and JSON validation passed
if grep -qE '/api/(v1/)?(listings|properties|requests|transactions|experts)[^ ]* → 200' "$LOG" && grep -q 'JSON ✅' "$LOG"; then
  REST_API_FOUND=1
fi

# HTML: data pages with 200 on same line
if grep -qE '/(listings|properties|requests|transactions|experts) → 200' "$LOG"; then
  HTML_FOUND=1
fi

# Session: auth-looking cookies
if grep -qiE '(session|auth|token|laravel|wordpress_logged)' /tmp/melketun-cookies.txt 2>/dev/null; then
  SESSION_AUTH=1
fi

# Login: markers in after-login page
if grep -qE '(logout|خروج|dashboard|پنل)' /tmp/melketun-after-login.html 2>/dev/null; then
  LOGIN_SUCCESS=1
fi

cat >> "$LOG" <<EOF

=== FINAL VERDICT ===
REST_API_FOUND: ${REST_API_FOUND}
HTML_FOUND: ${HTML_FOUND}
SESSION_AUTH: ${SESSION_AUTH}
LOGIN_SUCCESS: ${LOGIN_SUCCESS}

RECOMMENDATION:
EOF

if [ "$LOGIN_SUCCESS" -eq 0 ]; then
  echo "🔴 LOGIN FAILED — credentials or form structure incorrect. STOP." | tee -a "$LOG"
  echo "PATH: STOP_PN044 — waiting for owner decision" | tee -a "$LOG"
elif [ "$REST_API_FOUND" -eq 1 ]; then
  echo "🟢 REST API FOUND — proceed with adapter (like ARM)" | tee -a "$LOG"
  echo "PATH: REST_ADAPTER" | tee -a "$LOG"
elif [ "$HTML_FOUND" -eq 1 ] && [ "$LOGIN_SUCCESS" -eq 1 ]; then
  echo "🟡 HTML SCRAPING — build cheerio scraper" | tee -a "$LOG"
  echo "PATH: HTML_SCRAPER" | tee -a "$LOG"
else
  echo "⚠️ UNCLEAR — manual inspection needed" | tee -a "$LOG"
  echo "PATH: UNCLEAR_STOP" | tee -a "$LOG"
fi

cp /tmp/melketun-cookies.txt /tmp/melketun-session-cookies.txt 2>/dev/null || true
echo "Cookies saved to /tmp/melketun-session-cookies.txt" | tee -a "$LOG"
echo "RECON DONE"
