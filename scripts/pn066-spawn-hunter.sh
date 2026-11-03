#!/usr/bin/env bash
# شکار مولدِ نگهبان — نمونه‌برداری ps هر ۰.۵ ثانیه به مدت ۴۵ ثانیه
cd /home/z/my-project
declare -A SEEN
END=$(( $(date +%s) + 45 ))
while [ "$(date +%s)" -lt "$END" ]; do
  while IFS= read -r line; do
    pid=$(echo "$line" | awk '{print $1}')
    [ -z "$pid" ] && continue
    if [ -z "${SEEN[$pid]:-}" ]; then
      SEEN[$pid]=1
      # فقط فرایندهای تازه که bash/python/bun/su هستند
      if echo "$line" | rg -q "bash|python|bun |su |start-prod|watchdog|dev.sh|npm|node"; then
        if ! echo "$line" | rg -q "spawn-hunter|rg "; then
          echo "[$(date '+%T')] $line"
        fi
      fi
    fi
  done < <(ps -eo pid,ppid,user,lstart,cmd --no-headers 2>/dev/null)
  sleep 0.5
done
echo "=== HUNT DONE ==="
