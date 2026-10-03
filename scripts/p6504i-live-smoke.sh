#!/bin/bash
# شاهد زندهٔ P6.5-04-i: ورود مدیر → خواندن ۷ موجودیت → رد owner.read
set -e
BASE="http://localhost:3000"
TOKEN=$(curl -s -X POST "$BASE/api/auth/master-login" -H "Content-Type: application/json" -d '{"masterCode":"80211186"}' | python3 -c "import json,sys; print(json.load(sys.stdin).get('token',''))")
if [ -z "$TOKEN" ]; then echo "LOGIN FAILED"; exit 1; fi
echo "✓ master login OK"
AUTH="Authorization: Bearer $TOKEN"
echo "--- transactions:"; curl -s "$BASE/api/crm/transactions?limit=5" -H "$AUTH" | python3 -c "import json,sys; d=json.load(sys.stdin); print('total:', d.get('total'), '| rows:', len(d.get('rows',[])), '| summary:', d.get('summary',{}).get('totalCount'))"
echo "--- experts:"; curl -s "$BASE/api/crm/experts?limit=5" -H "$AUTH" | python3 -c "import json,sys; d=json.load(sys.stdin); print('total:', d.get('total'))"
echo "--- contracts:"; curl -s "$BASE/api/crm/contracts" -H "$AUTH" | python3 -c "import json,sys; d=json.load(sys.stdin); print('total:', d.get('total'))"
echo "--- interactions:"; curl -s "$BASE/api/crm/interactions" -H "$AUTH" | python3 -c "import json,sys; d=json.load(sys.stdin); print('total:', d.get('total'))"
echo "--- visits:"; curl -s "$BASE/api/crm/visits?limit=5" -H "$AUTH" | python3 -c "import json,sys; d=json.load(sys.stdin); print('total:', d.get('total'))"
echo "--- listings:"; curl -s "$BASE/api/listings" -H "$AUTH" | python3 -c "import json,sys; d=json.load(sys.stdin); print('rows:', len(d.get('rows',[])), '| stats.total:', d.get('stats',{}).get('total'))"
echo "--- requests:"; curl -s "$BASE/api/requests" -H "$AUTH" | python3 -c "import json,sys; d=json.load(sys.stdin); print('rows:', len(d.get('rows',[])), '| stats.total:', d.get('stats',{}).get('total'))"
