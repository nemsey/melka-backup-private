#!/bin/bash
# تست دید مالک (کدمستر) روی فهرست‌های ملکتون — گام دوم
cd /home/z/my-project
MASTER=$(grep -E "^MASTER_ACCESS_CODE=" .env.local | head -1 | cut -d'=' -f2- | tr -d '"' | sed 's/\r$//')
curl -s -o /tmp/ml.json -X POST http://localhost:3000/api/auth/master-login -H "Content-Type: application/json" -d "{\"masterCode\": \"$MASTER\"}"
TOKEN=$(jq -r '.token // empty' /tmp/ml.json)

echo "═══ M7 آگهی ملکتون — نمای مالک ═══"
curl -s -m 60 -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/crm/arm-catalog/listings?tenantId=melketun" -o /tmp/m7-owner.json
python3 -c "
import json
d = json.load(open('/tmp/m7-owner.json'))
rows = d.get('rows') or d.get('data') or (d if isinstance(d, list) else [])
if isinstance(d, dict) and not rows:
    print('keys:', list(d.keys())[:12])
else:
    total = d.get('total') or d.get('count') or len(rows)
    print('total:', total, '· rows returned:', len(rows))
    if rows:
        r0 = rows[0]
        print('fields:', sorted(r0.keys()))
        # شمارش ستون مالک در نمای API
        n_owner = sum(1 for r in rows if str(r.get('rawOwnerName') or r.get('ownerName') or '').strip())
        n_mobile = sum(1 for r in rows if str(r.get('ownerMobile') or '').strip())
        print(f'ردیف‌های این صفحه با مالک واقعی: {n_owner}/{len(rows)} · با موبایل: {n_mobile}')
"

echo ""
echo "═══ M8 درخواست ملکتون — نمای مالک ═══"
curl -s -m 60 -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/crm/arm-catalog/requests?tenantId=melketun" -o /tmp/m8-owner.json
python3 -c "
import json
d = json.load(open('/tmp/m8-owner.json'))
rows = d.get('rows') or d.get('data') or (d if isinstance(d, list) else [])
if isinstance(d, dict) and not rows:
    print('keys:', list(d.keys())[:12])
else:
    total = d.get('total') or d.get('count') or len(rows)
    print('total:', total, '· rows returned:', len(rows))
    if rows:
        r0 = rows[0]
        print('fields:', sorted(r0.keys()))
        n_cust = sum(1 for r in rows if str(r.get('customerName') or '').strip())
        n_mob = sum(1 for r in rows if str(r.get('customerMobile') or '').strip())
        print(f'ردیف‌های این صفحه با متقاضی: {n_cust}/{len(rows)} · با موبایل: {n_mob}')
"
