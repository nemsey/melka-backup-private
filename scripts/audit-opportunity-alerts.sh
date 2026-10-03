#!/bin/bash
# P6545/گام۱ (BLOCK 1.6) — اسکنر هشدار فرصت
# بررسی: همهٔ هشدارها امتیاز ≥ ۰٫۷ · طرفین معتبر · صفر اجرای خودکار
set -u
cd /home/z/my-project
export DATABASE_URL="${DATABASE_URL:-file:/home/z/my-project/db/custom.db}"
bun -e '
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();
(async () => {
  const alerts = await db.opportunityAlert.findMany();
  const bad = alerts.filter(a => a.matchScore < 0.7);
  const noParty = alerts.filter(a => !a.listingCode && !a.requestId);
  const executed = alerts.filter(a => (a.status || "").startsWith("execut"));
  console.log(JSON.stringify({ total: alerts.length, belowThreshold: bad.length, noParty: noParty.length, executedLike: executed.length, statuses: [...new Set(alerts.map(a => a.status))] }));
  await db.$disconnect();
})();
' 2>/dev/null | tail -1 | python3 -c "
import json, sys
d = json.load(sys.stdin)
ok = d['belowThreshold'] == 0 and d['noParty'] == 0 and d['executedLike'] == 0
print(f\"هشدارها: {d['total']} · زیر آستانهٔ ۰٫۷: {d['belowThreshold']} · بدون طرفین: {d['noParty']} · شبیه-اجرا: {d['executedLike']} · وضعیت‌ها: {d['statuses']}\")
print('OPPORTUNITY-ALERTS:', 'PASS' if ok else 'FAIL')
sys.exit(0 if ok else 1)
"
