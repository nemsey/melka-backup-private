#!/bin/bash
# P6545/گام۱ (BLOCK 1.6) — اسکنر پایدارسازی وضعیت کار
# بررسی: رکوردهای SyncJobState سازگارند (resumedFrom = lastCompletedPage+1 · progress ≤ ۱۰۰)
set -u
cd /home/z/my-project
export DATABASE_URL="${DATABASE_URL:-file:/home/z/my-project/db/custom.db}"
bun -e '
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();
(async () => {
  const jobs = await db.syncJobState.findMany();
  const inconsistent = jobs.filter(j => j.resumedFrom !== j.lastCompletedPage + 1 || j.progressPercent > 100 || j.progressPercent < 0);
  console.log(JSON.stringify({ total: jobs.length, inconsistent: inconsistent.length, sample: jobs.slice(0, 3).map(j => ({ jobId: j.jobId, status: j.status, lastCompletedPage: j.lastCompletedPage, resumedFrom: j.resumedFrom, progress: j.progressPercent })) }));
  await db.$disconnect();
})();
' 2>/dev/null | tail -1 | python3 -c "
import json, sys
d = json.load(sys.stdin)
ok = d['inconsistent'] == 0
print(f\"کارها: {d['total']} · ناسازگار: {d['inconsistent']} · نمونه: {json.dumps(d['sample'], ensure_ascii=False)[:200]}\")
print('JOB-STATE:', 'PASS' if ok else 'FAIL')
sys.exit(0 if ok else 1)
"
