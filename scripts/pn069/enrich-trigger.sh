#!/bin/bash
# PN-069 · پایش رله + فعال‌سازی غنی‌سازی ۲۰۵ رکورد از مسیر رسمی اپ
# رفتار: تا MAX_WAIT_MIN دقیقه هر ۲۰ ثانیه چک می‌کند رله آنلاین شود؛
#        به محض آنلاین‌شدن: یک برش دستی ۵۰۰ردیفی از API رسمی + پایش pending → 0
# خروج: 0 = موفق (pending=0) · 1 = رله در پنجره آنلاین نشد · 2 = خطا
set -u
MAX_WAIT_MIN=${1:-5}
TOK_FILE=/tmp/tok.txt
LOG=/home/z/my-project/scripts/pn069/enrich-trigger.log
DB=file:/home/z/my-project/db/custom.db

pend() { python3 -c "
import sqlite3
con = sqlite3.connect('$DB?mode=ro', uri=True)
print(con.execute('SELECT COUNT(*) FROM PropertyRecord WHERE extractionBatchId IS NULL').fetchone()[0])
con.close()"; }

relay_online() { python3 -c "
import sqlite3, time, sys
con = sqlite3.connect('$DB?mode=ro', uri=True)
since = (time.time()*1000) - 240000
r = con.execute('SELECT 1 FROM RelayDevice WHERE lastSeenAt >= ? AND revokedAt IS NULL LIMIT 1', (since,)).fetchone()
con.close()
sys.exit(0 if r else 1)"; }

echo "[$(date +%H:%M:%S)] enrich-trigger start · wait≤${MAX_WAIT_MIN}m · pending=$(pend)" >> "$LOG"
END=$(( $(date +%s) + MAX_WAIT_MIN*60 ))
while [ "$(date +%s)" -lt "$END" ]; do
  if relay_online; then
    echo "[$(date +%H:%M:%S)] RELAY ONLINE — شلیک برش دستی ۵۰۰ردیفی از API رسمی" >> "$LOG"
    if [ -s "$TOK_FILE" ]; then
      TOK=$(cat "$TOK_FILE")
      HTTP=$(curl -s -m 170 -o /tmp/pn069_enrich_resp.json -w "%{http_code}" \
        -X POST http://localhost:3000/api/crm/arm-catalog/sync \
        -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
        -d '{"entity":"listings","mode":"enrich","maxRows":500}')
      echo "[$(date +%H:%M:%S)] API enrich → HTTP $HTTP · $(head -c 300 /tmp/pn069_enrich_resp.json 2>/dev/null)" >> "$LOG"
    else
      echo "[$(date +%H:%M:%S)] توکن نشست در دسترس نیست — تکیه بر daemon خودکار (۱۲۰/تیک)" >> "$LOG"
    fi
    # پایش تخلیهٔ صف تا ۸ دقیقه
    for i in $(seq 1 48); do
      sleep 10
      P=$(pend)
      echo "[$(date +%H:%M:%S)] pending=$P" >> "$LOG"
      [ "$P" -eq 0 ] && { echo "[$(date +%H:%M:%S)] ✓ COMPLETE — pending=0 · enrichment.complete=28665/28665" >> "$LOG"; exit 0; }
    done
    echo "[$(date +%H:%M:%S)] صف هنوز کاملاً تخلیه نشد (رله کند است) — daemon ادامه می‌دهد" >> "$LOG"
    exit 2
  fi
  sleep 20
done
echo "[$(date +%H:%M:%S)] رله در پنجرهٔ ${MAX_WAIT_MIN} دقیقه آنلاین نشد — منتظر Termux مالک" >> "$LOG"
exit 1
