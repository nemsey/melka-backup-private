#!/usr/bin/env bash
# LAW-RUN-20261117-J — live API stats check (M1/M2 catalog + agent panels)
# Read-only verification against local live server (port 3000).
set -uo pipefail
BASE="${1:-http://localhost:3000}"
CODE=""
[ -f .env.local ] && CODE=$(grep -m1 '^MASTER_ACCESS_CODE=' .env.local 2>/dev/null | cut -d= -f2- | tr -d "\"'" || true)
[ -z "$CODE" ] && [ -f upload/.runtime/boot-secrets.json ] && CODE=$(jq -r '.MASTER_ACCESS_CODE // empty' upload/.runtime/boot-secrets.json 2>/dev/null || true)
[ -z "$CODE" ] && { echo "ERR no master code"; exit 1; }

LOGIN=$(curl -sS -m 20 -H 'Content-Type: application/json' -X POST "$BASE/api/auth/master-login" --data "{\"masterCode\":\"$CODE\"}" 2>/dev/null || echo '{}')
TOKEN=$(echo "$LOGIN" | jq -r '.token // empty' 2>/dev/null)
ROLE=$(echo "$LOGIN" | jq -r '.user.role // empty' 2>/dev/null)
echo "login: role=$ROLE token_len=${#TOKEN}"

for EP in "/api/listings?page=1&pageSize=1" "/api/requests?page=1&pageSize=1"; do
  echo "--- $EP ---"
  curl -sS -m 30 -H "Authorization: Bearer $TOKEN" "$BASE$EP" 2>/dev/null | head -c 500
  echo
done

for TILE in arm-listings arm-requests; do
  echo "--- /api/agent/$TILE/stats ---"
  curl -sS -m 20 -H "Authorization: Bearer $TOKEN" "$BASE/api/agent/$TILE/stats" 2>/dev/null | head -c 300
  echo
done
