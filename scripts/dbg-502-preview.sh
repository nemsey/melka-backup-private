#!/usr/bin/env bash
# DIR-FF-502-001 — همان آزمون از مسیر عمومی preview (پروکسی space-z.ai)
set -u
cd /home/z/my-project
PREV="https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai"
MASTER=$(grep '^MASTER_ACCESS_CODE=' .env.local | cut -d= -f2- | tr -d '"')

echo "== 1) master-login via preview =="
LOGIN=$(curl -s -w "\n%{http_code}" -X POST "$PREV/api/auth/master-login" \
  -H 'Content-Type: application/json' -H 'x-request-id: dbg-502-prev-1' \
  --data "{\"masterCode\":\"$MASTER\"}" --max-time 60)
CODE=$(echo "$LOGIN" | tail -1); BODY=$(echo "$LOGIN" | head -n -1)
echo "status=$CODE"
TOKEN=$(echo "$BODY" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("token") or (d.get("session") or {}).get("token") or "")' 2>/dev/null)
echo "token_len=${#TOKEN}"
[ -z "$TOKEN" ] && { echo "BODY: $BODY"; exit 1; }

echo "== 2) POST /api/changes/session begin via preview =="
curl -s -o /tmp/prev_begin.json -D /tmp/prev_begin.hdr -w "status=%{http_code} time=%{time_total}s\n" -X POST "$PREV/api/changes/session" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" -H 'x-request-id: dbg-502-prev-2' \
  --data '{"action":"begin"}' --max-time 60
echo "--- headers ---"; head -20 /tmp/prev_begin.hdr; echo "--- body (600b) ---"; head -c 600 /tmp/prev_begin.json; echo

echo "== 3) POST end via preview (پاکسازی) =="
curl -s -o /tmp/prev_end.json -w "status=%{http_code} time=%{time_total}s\n" -X POST "$PREV/api/changes/session" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" -H 'x-request-id: dbg-502-prev-3' \
  --data '{"action":"end"}' --max-time 60
head -c 300 /tmp/prev_end.json; echo
