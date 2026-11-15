#!/bin/bash
# watcher: catch whoever deletes node_modules/.bin/next
cd /home/z/my-project
LOG=/tmp/nm-watch.log
echo "[watch $(date '+%T')] start" >> $LOG
for i in $(seq 1 900); do
  if [ ! -e node_modules/.bin/next ] && [ -d node_modules ]; then
    echo "[watch $(date '+%T')] .bin/next MISSING (node_modules exists)" >> $LOG
    { date; ps aux --sort=-rss | head -15; } >> $LOG 2>&1
    ls -la node_modules/ 2>/dev/null | head -8 >> $LOG
    break
  fi
  if [ ! -d node_modules ]; then
    echo "[watch $(date '+%T')] ENTIRE node_modules MISSING" >> $LOG
    { date; ps aux --sort=-rss | head -15; } >> $LOG 2>&1
    break
  fi
  sleep 2
done
echo "[watch $(date '+%T')] end" >> $LOG
