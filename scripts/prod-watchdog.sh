#!/usr/bin/env bash
# نگهبان سرور production — داشبورد هوشمند ملک تبریز
# سرور standalone را روی پورت ۳۰۰۰ اجرا می‌کند و در صورت کرش، بلافاصله دوباره بالا می‌آورد.
# فاصله حداقل بین ری‌استارت‌ها: ۵ ثانیه؛ توقف فقط با کشتن این پروسه یا فایل فلگ.
#
# رازهای اجرایی (MASTER_ACCESS_CODE / MELK_TOKEN_KEY) از .env.local خوانده می‌شوند
# (gitignored) — هرگز در سورس یا این اسکریپت قرار نمی‌گیرند (SEC-1/SEC-2).

cd /home/z/my-project
STOP_FLAG="/home/z/my-project/.prod-stop"
LOG="/home/z/my-project/server.log"

# بارگذاری رازها از .env.local (در صورت نبود، خالی می‌ماند و سرور fail-fast می‌شود)
set -a
[ -f .env.local ] && . ./.env.local
set +a

echo "[watchdog] $(date '+%F %T') نگهبان سرور آغاز به کار کرد (PID $$)" >> "$LOG"

while true; do
  if [ -f "$STOP_FLAG" ]; then
    echo "[watchdog] $(date '+%F %T') فلگ توقف دیده شد — خروج" >> "$LOG"
    rm -f "$STOP_FLAG"
    exit 0
  fi

  PORT=3000 HOSTNAME=0.0.0.0 NODE_ENV=production \
    DATABASE_URL="file:/home/z/my-project/db/custom.db" \
    bun /home/z/my-project/.next/standalone/server.js >> "$LOG" 2>&1
  CODE=$?
  echo "[watchdog] $(date '+%F %T') سرور با کد $CODE متوقف شد — ری‌استارت پس از ۵ ثانیه" >> "$LOG"
  sleep 5
done
