#!/bin/bash
# PN-057 — راستی‌آزمایی کامل نکتهٔ ۱: مالک با کدمستر هر ۸ فهرست را با تمام ستون‌ها می‌بیند
# ۸ فهرست: آگهی/درخواست/کارشناسان/معاملات × (تبریز + ملکتون) + قیف M9 ملکتون
cd /home/z/my-project
MASTER=$(grep -E "^MASTER_ACCESS_CODE=" .env.local | head -1 | cut -d'=' -f2- | tr -d '"' | sed 's/\r$//')
curl -s -o /tmp/ml.json -X POST http://localhost:3000/api/auth/master-login -H "Content-Type: application/json" -d "{\"masterCode\": \"$MASTER\"}"
TOKEN=$(jq -r '.token // empty' /tmp/ml.json)
if [ -z "$TOKEN" ]; then echo "❌ ورود کدمستر شکست خورد"; exit 1; fi

report() {
  # $1=file $2=فیلدهای حساس (کماجدا)
  python3 -c "
import json, sys
d = json.load(open('$1'))
rows = d.get('rows') or d.get('data') or (d if isinstance(d, list) else [])
if isinstance(d, dict) and not rows:
    print('  keys:', list(d.keys())[:12]); sys.exit(0)
total = (d.get('total') or d.get('count') or len(rows)) if isinstance(d, dict) else len(rows)
n = len(rows)
if not rows:
    print(f'  total: {total} · rows: 0 — خالی'); sys.exit(0)
r0 = rows[0]
print(f'  total: {total} · rows: {n} · ستون‌ها: {len(r0.keys())}')
sens = '$2'.split(',')
for s in sens:
    if not s: continue
    c = sum(1 for r in rows if str(r.get(s) or '').strip())
    print(f'  {s}: {c}/{n}')
"
}

echo "═══ [1/8] آگهی تبریز — نمای مالک (کدمستر) ═══"
curl -s -m 90 -H "Authorization: Bearer $TOKEN" "http://localhost:3000/api/crm/arm-catalog/listings?tenantId=melk-tabriz" -o /tmp/p1.json
report /tmp/p1.json "rawOwnerName,ownerMobile,realtorName"

echo "═══ [2/8] آگهی ملکتون — نمای مالک (کدمستر) ═══"
curl -s -m 90 -H "Authorization: Bearer $TOKEN" "http://localhost:3000/api/crm/arm-catalog/listings?tenantId=melketun" -o /tmp/p2.json
report /tmp/p2.json "rawOwnerName,ownerMobile,realtorName"

echo "═══ [3/8] درخواست تبریز — نمای مالک (کدمستر) ═══"
curl -s -m 90 -H "Authorization: Bearer $TOKEN" "http://localhost:3000/api/crm/arm-catalog/requests?tenantId=melk-tabriz" -o /tmp/p3.json
report /tmp/p3.json "customerName,customerMobile"

echo "═══ [4/8] درخواست ملکتون — نمای مالک (کدمستر) ═══"
curl -s -m 90 -H "Authorization: Bearer $TOKEN" "http://localhost:3000/api/crm/arm-catalog/requests?tenantId=melketun" -o /tmp/p4.json
report /tmp/p4.json "customerName,customerMobile"

echo "═══ [5/8] کارشناسان تبریز — نمای مالک (کدمستر) ═══"
curl -s -m 60 -H "Authorization: Bearer $TOKEN" "http://localhost:3000/api/experts?tenantId=melk-tabriz" -o /tmp/p5.json
report /tmp/p5.json "fullName,mobile"

echo "═══ [6/8] کارشناسان ملکتون — نمای مالک (کدمستر) ═══"
curl -s -m 60 -H "Authorization: Bearer $TOKEN" "http://localhost:3000/api/experts?tenantId=melketun" -o /tmp/p6.json
report /tmp/p6.json "fullName,mobile"

echo "═══ [7/8] معاملات تبریز — نمای مالک (کدمستر) ═══"
curl -s -m 60 -H "Authorization: Bearer $TOKEN" "http://localhost:3000/api/crm/transactions?tenantId=melk-tabriz" -o /tmp/p7.json
report /tmp/p7.json ""

echo "═══ [8/8] معاملات/قیف M9 ملکتون — نمای مالک (کدمستر) ═══"
curl -s -m 60 -H "Authorization: Bearer $TOKEN" "http://localhost:3000/api/crm/transactions?tenantId=melketun" -o /tmp/p8a.json
report /tmp/p8a.json ""
curl -s -m 60 -H "Authorization: Bearer $TOKEN" "http://localhost:3000/api/crm/melketun/funnel" -o /tmp/p8b.json
python3 -c "
import json
try:
    d = json.load(open('/tmp/p8b.json'))
    ks = list(d.keys()) if isinstance(d, dict) else ['آرایه', len(d)]
    print('  قیف M9 زنده ✓ کلیدها:', ks[:10])
except Exception as e:
    print('  قیف M9:', e)
"
echo "═══ پایان راستی‌آزمایی ۸ فهرست ═══"
