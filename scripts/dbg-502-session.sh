#!/usr/bin/env bash
# DIR-FF-502-001 — بازتولید زندهٔ خطای ۵۰۲ کلید «تمام ظرفیت»
set -u
cd /home/z/my-project
MASTER=$(grep '^MASTER_ACCESS_CODE=' .env.local | cut -d= -f2- | tr -d '"' )
echo "== 1) master-login =="
LOGIN=$(curl -s -w "\n%{http_code}" -X POST http://127.0.0.1:3000/api/auth/master-login \
  -H 'Content-Type: application/json' -H 'x-request-id: dbg-502-1' \
  --data "{\"masterCode\":\"$MASTER\"}")
CODE=$(echo "$LOGIN" | tail -1)
BODY=$(echo "$LOGIN" | head -n -1)
echo "status=$CODE"
TOKEN=$(echo "$BODY" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("token") or (d.get("session") or {}).get("token") or "")' 2>/dev/null)
echo "token_len=${#TOKEN}"
if [ -z "$TOKEN" ]; then echo "LOGIN BODY: $BODY"; exit 1; fi

echo "== 2) POST /api/changes/session action=begin (مستقیم، ۳۰ث) =="
curl -s -o /tmp/sess_begin.json -w "status=%{http_code} time=%{time_total}s\n" -X POST http://127.0.0.1:3000/api/changes/session \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" -H 'x-request-id: dbg-502-2' \
  --data '{"action":"begin"}' --max-time 40
head -c 600 /tmp/sess_begin.json; echo

echo "== 3) GET /api/changes (وضعیت) =="
curl -s -o /tmp/sess_status.json -w "status=%{http_code} time=%{time_total}s\n" http://127.0.0.1:3000/api/changes \
  -H "Authorization: Bearer $TOKEN" -H 'x-request-id: dbg-502-3' --max-time 40
head -c 400 /tmp/sess_status.json; echo

echo "== 4) POST action=end (بازگرداندن حالت) =="
curl -s -o /tmp/sess_end.json -w "status=%{http_code} time=%{time_total}s\n" -X POST http://127.0.0.1:3000/api/changes/session \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" -H 'x-request-id: dbg-502-4' \
  --data '{"action":"end"}' --max-time 40
head -c 400 /tmp/sess_end.json; echo
