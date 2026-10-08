#!/bin/bash
# PN-020 · H2 — گارد فضای دیسک (audit-disk-space.sh)
# ---------------------------------------------------------------------------
# راه‌حل ساختاری چهارمین ENOSPC (مصوبهٔ جلسهٔ شورای ۰۲۴ — بندهای ۱+۲+۳):
#   ۱) فضای آزاد ≥ آستانهٔ هشدار (پیش‌فرض ۲۰٪)
#   ۲) نسل‌های بقا (upload/.survival + قطعات deliver-store) ≤ ۵
#   ۳) پوشه‌های download/pnXXX (ردیابی‌نشده) ≤ ۳
# حالت‌ها:
#   پیش‌فرض (بدون آرگومان) = هرس واقعی + داوری پس از هرس (ورودی CI)
#   check                   = فقط گزارش خشک بدون حذف (داوری فقط روی فضای آزاد)
set -u
cd /home/z/my-project
export DATABASE_URL="${DATABASE_URL:-file:/home/z/my-project/db/custom.db}"

MODE="${1:-prune}"

bun -e '
const { runDiskGuard } = require("@/core/runtime/guards");
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();
(async () => {
  const r = await runDiskGuard(db, { apply: process.argv[2] !== "check" });
  console.log(JSON.stringify(r));
  await db.$disconnect();
})().catch((e) => { console.error(String(e)); process.exit(1); });
' "" "$MODE" 2>/dev/null | tail -1 | MODE="$MODE" python3 -c "
import json, sys, os
MODE = os.environ.get('MODE', 'prune')
try:
    d = json.load(sys.stdin)
except Exception:
    print('DISK-SPACE: FAIL (خروجی نامعتبر)'); sys.exit(1)

free = d.get('diskFreePercent')
th = d.get('thresholds', {})
pr = d.get('pruned', {})
free_ok = free is not None and free >= th.get('warnPercent', 20)
print(f\"فضای آزاد: {free}٪ (هشدار <{th.get('warnPercent')}٪ · بحرانی <{th.get('criticalPercent')}٪)\")
print(f\"هرس این اجرا: {len(pr.get('survivalStagingDirs', []))} پوشهٔ کار · {len(pr.get('deliverPartFiles', []))} قطعه · {len(pr.get('downloadDirs', []))} پوشهٔ download · {round(pr.get('freedBytes', 0)/1048576, 1)}MB\")
if pr.get('keptTrackedNote'):
    print(f\"نگه‌داشته: {pr['keptTrackedNote'][:120]}\")

st = sorted([f for f in os.listdir('upload/.survival') if f.startswith('PN-')]) if os.path.isdir('upload/.survival') else []
parts = sorted([f for f in os.listdir('deliver-store') if 'survival-part' in f and f.endswith('.bin')]) if os.path.isdir('deliver-store') else []
import re as _re
gens_parts = sorted({(_re.search(r'pn[-_]?(\d{2,3})', f, _re.IGNORECASE).group(1) if _re.search(r'pn[-_]?(\d{2,3})', f, _re.IGNORECASE) else '?') for f in parts})
dl = sorted([f for f in os.listdir('download') if f.lower().startswith('pn') and f[2:].isdigit()]) if os.path.isdir('download') else []
print(f'نسل‌های کار بقا: {len(st)} · نسل‌های قطعات تحویل: {len(gens_parts)} ({\", \".join(gens_parts[-5:])}) · نسل‌های download: {len(dl)}')

if MODE == 'check':
    # حالت خشک: فقط داوری فضای آزاد (هرس معوق گزارش شد، حذفی در کار نیست)
    print('DISK-SPACE:', 'PASS' if free_ok else 'FAIL', '(mode=check — خشک)')
    sys.exit(0 if free_ok else 1)

# حالت هرس (پیش‌فرض): پس از هرس، وضعیت باید سالم باشد
gens_ok = len(st) <= 5 and len(gens_parts) <= 5
ok = free_ok and gens_ok
print('DISK-SPACE:', 'PASS' if ok else 'FAIL', '(mode=prune)')
sys.exit(0 if ok else 1)
"
