#!/usr/bin/env bash
# PN-055 — بیلد + استقرار پس از کامیت (الگوی رسمی)
set -uo pipefail
cd /home/z/my-project
bun run build 2>&1 | tail -5
__rc=$?
if [ $__rc -ne 0 ]; then echo "BUILD-FAIL rc=$__rc"; exit 1; fi
bun run scripts/fingerprint.ts --write-next 2>&1 | tail -2
# ری‌استارت تمیز: توقف نگهبان/سرور → شروع رسمی
touch .prod-stop
sleep 2
pkill -f prod-watchdog.sh 2>/dev/null
sleep 1
pkill -f "standalone/server.js" 2>/dev/null
pkill -f "scripts/runtime/worker.ts" 2>/dev/null
sleep 2
rm -f .prod-stop
bash scripts/start-prod.sh
sleep 6
curl -s http://localhost:3000/api/version | head -c 160
echo ""
echo "DEPLOY-DONE"
