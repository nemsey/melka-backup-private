#!/usr/bin/env bash
# تلهٔ پاک‌کنندهٔ .next — هر ۲ ثانیه پایش؛ در لحظهٔ حذف، اسنپ‌شات فرایندها
LOG=/tmp/next-killer-trap.txt
cd /home/z/my-project
echo "trap armed $(date -u)" > "$LOG"
while true; do
  if [ ! -d .next/static ]; then
    echo "=== .next/static DISAPPEARED at $(date -u) ===" >> "$LOG"
    date -u >> "$LOG"
    ps auxf >> "$LOG" 2>&1
    ls -la .next >> "$LOG" 2>&1
    ls -la upload/.runtime/ | tail -30 >> "$LOG" 2>&1
    break
  fi
  sleep 2
done
