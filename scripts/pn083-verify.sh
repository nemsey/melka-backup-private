#!/usr/bin/env bash
# PN-083 · راستی‌آزمایی E2E چهار فهرست — بدون چاپ هیچ رازی
# ورود با کد مدیر از .env.local (فقط در حافظهٔ پروسه) → GET / POST /api/sync/four-lists
set -uo pipefail
cd /home/z/my-project

CODE=$(grep -E '^MASTER_ACCESS_CODE=' .env.local | head -1 | cut -d= -f2 | tr -d '"' | tr -d "'")
if [ -z "$CODE" ]; then echo "❌ کد مدیر در .env.local نیست"; exit 1; fi

LOGIN=$(curl -s --max-time 15 -X POST http://127.0.0.1:3000/api/auth/master-login \
  -H 'Content-Type: application/json' \
  -d "{\"masterCode\":\"$CODE\"}")
TOKEN=$(echo "$LOGIN" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('token') or d.get('sessionToken') or (d.get('session') or {}).get('token') or '')" 2>/dev/null)
if [ -z "$TOKEN" ]; then echo "❌ ورود ناموفق — پاسخ:"; echo "$LOGIN" | head -c 300; exit 1; fi
echo "✓ ورود مالک موفق (توکن در حافظه — چاپ نمی‌شود)"

echo "════ GET /api/sync/four-lists:"
curl -s --max-time 20 http://127.0.0.1:3000/api/sync/four-lists \
  -H "Authorization: Bearer $TOKEN" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print('ok:', d.get('ok'), '| running:', d.get('running'))
for k in ['m1','m2','m3','m4']:
    l = (d.get('lists') or {}).get(k)
    if not l: print(f'{k}: ❌ غایب'); continue
    print(f\"{k}: {l['label']} | status={l['status']} | rows={l['rows']} | source={l.get('sourceLabel')} | lcppPhase={l.get('lcppPhase')} | nextCycle={'✓' if l.get('nextCycleAt') else '—'}\")
print('lcpp compat:', '✓' if d.get('lcpp') is not None else '✗')
"

echo "════ POST /api/sync/four-lists (درخواست فوری هر چهار فهرست):"
curl -s --max-time 20 -X POST http://127.0.0.1:3000/api/sync/four-lists \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"list":"all"}' | python3 -c "import json,sys; d=json.load(sys.stdin); print('ok:', d.get('ok'), '| message:', d.get('message'))"
