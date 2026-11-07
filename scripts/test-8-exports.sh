#!/bin/bash
# Test all 8 Excel exports as OWNER (master session) — code never printed (Law 18)
cd /home/z/my-project

# Load master code from server env (never echo)
MASTER=$(grep -E "^MASTER_ACCESS_CODE=" .env.local 2>/dev/null | head -1 | cut -d'=' -f2- | tr -d '"' | tr -d "'" | sed 's/\r$//')
if [ -z "$MASTER" ]; then
  echo "❌ MASTER_ACCESS_CODE not found in .env.local"
  exit 1
fi
echo "✓ master code loaded (hidden)"

# Login → Bearer token (session mechanism: Authorization header)
HTTP=$(curl -s -o /tmp/master-login-resp.json -w "%{http_code}" -X POST http://localhost:3000/api/auth/master-login \
  -H "Content-Type: application/json" \
  -d "{\"masterCode\": \"$MASTER\"}")
echo "login HTTP=$HTTP"
TOKEN=$(jq -r '.token // empty' /tmp/master-login-resp.json 2>/dev/null)
OWNER_NAME=$(jq -r '.user.displayName // empty' /tmp/master-login-resp.json 2>/dev/null)
ROLE=$(jq -r '.user.role // empty' /tmp/master-login-resp.json 2>/dev/null)
echo "session: owner=$OWNER_NAME role=$ROLE token=${TOKEN:0:8}…(hidden)"

if [ "$HTTP" != "200" ] || [ -z "$TOKEN" ]; then
  echo "❌ login failed — aborting export tests"
  cat /tmp/master-login-resp.json | head -c 300
  exit 1
fi

echo ""
echo "═══ ۸ خروجی اکسل (۴ موجودیت × ۲ tenant) ═══"
PASS=0; FAIL=0
for TENANT in melk-tabriz melketun; do
  for ENTITY in listings requests transactions experts; do
    OUT="/tmp/export-${TENANT}-${ENTITY}.xlsx"
    CODE=$(curl -s -o "$OUT" -w "%{http_code}" -m 120 \
      -H "Authorization: Bearer $TOKEN" \
      "http://localhost:3000/api/crm/export/${ENTITY}?tenantId=${TENANT}")
    SIZE=$(stat -c%s "$OUT" 2>/dev/null || echo 0)
    # xlsx magic: PK zip header
    MAGIC=$(head -c2 "$OUT" 2>/dev/null)
    if [ "$CODE" = "200" ] && [ "$MAGIC" = "PK" ] && [ "$SIZE" -gt 1000 ]; then
      SHEETS=$(python3 -c "
import zipfile, re
try:
    z = zipfile.ZipFile('$OUT')
    wb = z.read('xl/workbook.xml').decode('utf-8', 'ignore')
    names = re.findall(r'name=\"([^\"]+)\"', wb)
    print([n for n in names if 'heet' in ''.join(names)][:1] or names[:2])
except Exception as e: print('?')
" 2>/dev/null)
      echo "✓ ${TENANT}/${ENTITY}: HTTP $CODE · ${SIZE} bytes · sheet=$SHEETS"
      PASS=$((PASS+1))
    else
      echo "✗ ${TENANT}/${ENTITY}: HTTP $CODE · ${SIZE} bytes · magic=${MAGIC}"
      head -c 200 "$OUT" | tr '\n' ' '; echo ""
      FAIL=$((FAIL+1))
    fi
  done
done
echo ""
echo "RESULT: $PASS pass / $FAIL fail"
