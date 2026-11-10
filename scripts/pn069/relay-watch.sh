#!/bin/bash
# PN-069 · مانیتور رلهٔ موبایل — اگر گوشی آنلاین شود، غنی‌سازی ۲۰۵ رکورد را فعال کن
LOG=/home/z/my-project/scripts/pn069/relay-watch.log
echo "[$(date +%H:%M:%S)] relay-watch start — polling every 20s for online device (window 240s)" >> "$LOG"
for i in $(seq 1 40); do
  ONLINE=$(python3 - <<'PY'
import sqlite3, time
con = sqlite3.connect('file:/home/z/my-project/db/custom.db?mode=ro', uri=True)
cur = con.cursor()
since = (time.time()*1000) - 240000
row = cur.execute('SELECT deviceId, lastSeenAt FROM RelayDevice WHERE lastSeenAt >= ? AND revokedAt IS NULL ORDER BY lastSeenAt DESC LIMIT 1', (since,)).fetchone()
pend = cur.execute('SELECT COUNT(*) FROM PropertyRecord WHERE extractionBatchId IS NULL').fetchone()[0]
con.close()
print(f"{'ONLINE:'+row[0] if row else 'offline'} pending={pend}")
PY
)
  echo "[$(date +%H:%M:%S)] $ONLINE" >> "$LOG"
  if [[ "$ONLINE" == ONLINE:* ]]; then
    echo "[$(date +%H:%M:%S)] RELAY ONLINE — daemon will drain pending automatically (120 rows/tick)" >> "$LOG"
    exit 0
  fi
  sleep 20
done
echo "[$(date +%H:%M:%S)] relay-watch end — phone stayed offline for full window" >> "$LOG"
exit 1
