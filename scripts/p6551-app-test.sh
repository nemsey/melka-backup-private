#!/usr/bin/env bash
# P6551 — تست تحویل اپلیکیشنی (BLOCK 2.3): لاگین مالک → فراداده → ۴ دانلود → md5 → گاردها
set -uo pipefail
cd /home/z/my-project
BASE="http://localhost:3000"
OUT="download/p6551/curl-test"
mkdir -p "$OUT"

echo "═══ ۱) لاگین مالک ═══"
LOGIN=$(curl -s --max-time 60 -X POST "$BASE/api/auth/master-login" -H 'content-type: application/json' -d '{"masterCode":"80211186"}')
TOKEN=$(echo "$LOGIN" | python3 -c "import json,sys; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)
if [ -z "$TOKEN" ]; then echo "LOGIN-FAIL: $LOGIN"; exit 1; fi
echo "LOGIN-OK (token ${#TOKEN} chars)"
echo "$LOGIN" | python3 -c "import json,sys; d=json.load(sys.stdin); print('user:', d['user']['displayName'], d['user']['role'])"

echo ""
echo "═══ ۲) فرادادهٔ بسته (بدون file) ═══"
curl -s --max-time 60 "$BASE/api/skeleton/download" -H "Authorization: Bearer $TOKEN" | tee "$OUT/meta.json" | python3 -m json.tool | head -30

echo ""
echo "═══ ۳) چهار دانلود + md5 + هدرها ═══"
declare -A EXPECTED=(
  [manifest]="1757c1e9f1316a39f9260921605325fc"
  [skeleton]="0d01f54fc39bc3910cb9a3a2ee6f617d"
  [source]="c505c50e9c22343cbcaa9c746a99405e"
  [letter]="c046e0e015042c7e19fd0f3c0ce304ca"
)
PASS=0; FAIL=0
for KEY in manifest skeleton source letter; do
  F="$OUT/$KEY.bin"
  HDR="$OUT/$KEY.headers"
  CODE=$(curl -s --max-time 120 -o "$F" -D "$HDR" -w "%{http_code}" "$BASE/api/skeleton/download?file=$KEY" -H "Authorization: Bearer $TOKEN")
  MD5=$(md5sum "$F" | cut -d' ' -f1)
  SIZE=$(stat -c%s "$F")
  CT=$(grep -i "^content-type" "$HDR" | tr -d '\r' | cut -d' ' -f2)
  CD=$(grep -i "^content-disposition" "$HDR" | tr -d '\r')
  XM=$(grep -i "^x-checksum-md5" "$HDR" | tr -d '\r' | awk '{print $2}')
  if [ "$CODE" = "200" ] && [ "$MD5" = "${EXPECTED[$KEY]}" ] && [ "$XM" = "${EXPECTED[$KEY]}" ]; then
    echo "  PASS $KEY — HTTP $CODE · $SIZE bytes · md5 OK · $CT"
    PASS=$((PASS+1))
  else
    echo "  FAIL $KEY — HTTP $CODE · md5=$MD5 (want ${EXPECTED[$KEY]}) · x-md5=$XM"
    FAIL=$((FAIL+1))
  fi
done
echo "دانلود: $PASS/4 PASS · $FAIL FAIL"

echo ""
echo "═══ ۴) گاردهای امنیتی ═══"
U=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "$BASE/api/skeleton/download?file=skeleton")
echo "  بدون توکن → $U (انتظار 401)"
B=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "$BASE/api/skeleton/download?file=../../db/custom.db" -H "Authorization: Bearer $TOKEN")
echo "  path-traversal → $B (انتظار 400)"
E=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "$BASE/api/skeleton/download?file=nope" -H "Authorization: Bearer $TOKEN")
echo "  کلید نامعتبر → $E (انتظار 400)"
if [ "$U" = "401" ] && [ "$B" = "400" ] && [ "$E" = "400" ]; then echo "  گاردها: PASS"; else echo "  گاردها: FAIL"; fi

echo ""
echo "═══ ۵) ثبت در AuditLog ═══"
bun -e "
import { getPrisma } from './src/lib/db';
const p = getPrisma();
const rows = await p.auditLog.findMany({ where: { event: 'SKELETON_DOWNLOAD' }, orderBy: { id: 'desc' }, take: 4 });
console.log('  SKELETON_DOWNLOAD ×', rows.length);
for (const r of rows) console.log('   ·', r.personnelCode, r.detail, r.createdAt?.toISOString());
await p.\$disconnect();
" 2>&1 | head -8

echo ""
echo "DONE — $PASS/4 downloads passed"
[ "$FAIL" = "0" ] || exit 1
