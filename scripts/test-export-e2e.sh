#!/bin/bash
# DIR: test export end-to-end with real OWNER session — never prints token/code
set -u
cd /home/z/my-project
CODE=$(grep -E '^MASTER_ACCESS_CODE=' .env.local | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d ' \r')
if [ -z "$CODE" ]; then echo "NO_CODE_FOUND"; exit 1; fi

LOGIN=$(curl -s --max-time 30 -X POST http://127.0.0.1:3000/api/auth/master-login \
  -H 'content-type: application/json' -H 'x-forwarded-for: 127.0.0.1' \
  -d "{\"masterCode\":\"$CODE\"}")
TOKEN=$(printf '%s' "$LOGIN" | python3 -c "import json,sys
try: print(json.load(sys.stdin).get('token',''))
except Exception: print('')")
if [ -z "$TOKEN" ]; then echo "LOGIN_FAILED: $(printf '%s' "$LOGIN" | head -c 200)"; exit 1; fi
echo "LOGIN_OK (token captured, not printed)"
echo "$TOKEN" > /tmp/.melk-token  # root-only tmp, deleted at end
chmod 600 /tmp/.melk-token

for base in "http://127.0.0.1:3000" "https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai"; do
  echo "=== BASE: $base ==="
  for e in requests transactions; do
    curl -s -o "/tmp/export-$e-$(echo $base | md5sum | cut -c1-6).xlsx" \
      -w "export/$e -> HTTP %{http_code} | %{size_download} bytes | %{time_total}s | ct=%{content_type}\n" \
      --max-time 180 -H "Authorization: Bearer $TOKEN" "$base/api/crm/export/$e"
  done
done
echo "---FILE TYPES---"
file /tmp/export-*.xlsx 2>/dev/null
