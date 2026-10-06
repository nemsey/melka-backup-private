#!/bin/bash
# پایشگر RAM سرور production — جلسهٔ ۰۰۵ BLOCK 3
# هر ۶۰ ثانیه: RSS سرور + کل سیستم → لاگ پایدار
# توقف: فایل .ram-stop
cd /home/z/my-project
LOG="download/pn005/ram-monitoring.log"
echo "# prod RAM monitor started $(date -u +%FT%TZ)" >> "$LOG"
while true; do
  [ -f .ram-stop ] && { echo "# stopped $(date -u +%FT%TZ)" >> "$LOG"; exit 0; }
  SRV=$(ps aux | grep 'standalone/server.js' | grep -v grep | awk '{print int($6/1024)}' | head -1)
  TOT=$(free -m | awk '/^Mem:/{print $3}')
  echo "$(date -u +%FT%TZ) serverRSS=${SRV:-0}MB systemUsed=${TOT}MB" >> "$LOG"
  # PN-006 BLOCK 7.2 — چرخش لاگ (بدون دیمن جدید، همان حلقهٔ دقیقه‌ای)
  bash scripts/log-rotate.sh >> "$LOG" 2>/dev/null || true
  sleep 60
done
