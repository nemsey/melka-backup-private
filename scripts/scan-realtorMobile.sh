#!/usr/bin/env bash
# scan-realtorMobile.sh — جستجوی ستون realtorMobile در همهٔ لایه‌های بازیابی (پس از prisma db push)
# هدف: قانون دادهٔ مقدس — اگر مقادیر ۱۲۲۳گانه هنوز در لایه‌ای زنده‌اند، آرشیو شوند.
set -uo pipefail
cd /home/z/my-project
CANDIDATES=$(ls -t \
  upload/.survival/P*/db/custom.db \
  upload/.survival/P*/custom.db \
  upload/dataset-backups/*.db \
  backups/*.db \
  db/*.db \
  2>/dev/null)
FOUND=0
for f in $CANDIDATES; do
  python3 - "$f" <<'PYEOF' || true
import sqlite3, sys
path = sys.argv[1]
try:
    c = sqlite3.connect(f'file:{path}?mode=ro', uri=True)
    cols = [r[1] for r in c.execute('PRAGMA table_info(PropertyRecord)')]
    if 'realtorMobile' in cols:
        n = c.execute("SELECT COUNT(*) FROM PropertyRecord WHERE realtorMobile IS NOT NULL AND realtorMobile != ''").fetchone()[0]
        total = c.execute('SELECT COUNT(*) FROM PropertyRecord').fetchone()[0]
        print(f'FOUND {path} | realtorMobile filled={n} | total={total}')
    c.close()
except Exception as e:
    pass
PYEOF
done
echo "SCAN DONE"
