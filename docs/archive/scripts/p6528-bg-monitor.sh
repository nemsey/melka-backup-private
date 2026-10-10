#!/bin/bash
# p6528-bg-monitor.sh — پایش پس‌زمینهٔ دامنهٔ publish + ظهور بستهٔ build جدید
LOG=/home/z/my-project/download/p6528-links/bg-monitor.log
DOMAIN="https://r1a5k87hzbg0-d.space-z.ai"
echo "=== bg monitor start $(date -u '+%F %T') ===" >> "$LOG"
for i in $(seq 1 120); do
  ts=$(date -u '+%H:%M:%S')
  code=$(curl -s -o /tmp/pub_bg.txt -w "%{http_code}" --max-time 15 "$DOMAIN/" 2>/dev/null)
  ver=$(curl -s --max-time 10 "$DOMAIN/api/version" 2>/dev/null | tr -d '\n' | head -c 130)
  pkg=$(ls -t /tmp/build_fullstack_*.tar.gz 2>/dev/null | head -1 | xargs -r basename)
  pkgtime=$(ls -t /tmp/build_fullstack_*.tar.gz 2>/dev/null | head -1 | xargs -r stat -c %y 2>/dev/null | cut -c12-16)
  echo "[$ts] #$i HTTP=$code pkg=$pkgtime($pkg) ver=${ver:0:110}" >> "$LOG"
  if [ "$code" = "200" ] && echo "$ver" | grep -q '"buildId"'; then
    echo "=== GREEN at $ts ===" >> "$LOG"
    echo "$ver" >> "$LOG"
    exit 0
  fi
  sleep 30
done
echo "=== 60min timeout $(date -u '+%T') ===" >> "$LOG"
