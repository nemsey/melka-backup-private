#!/usr/bin/env bash
# نگهبان سرور production — داشبورد هوشمند ملک تبریز
# سرور standalone را روی پورت ۳۰۰۰ اجرا می‌کند و در صورت کرش، بلافاصله دوباره بالا می‌آورد.
# فاصله حداقل بین ری‌استارت‌ها: ۵ ثانیه؛ توقف فقط با کشتن این پروسه یا فایل فلگ.
#
# رازهای اجرایی (MASTER_ACCESS_CODE / MELK_TOKEN_KEY) از .env.local خوانده می‌شوند
# (gitignored) — هرگز در سورس یا این اسکریپت قرار نمی‌گیرند (SEC-1/SEC-2).
#
# ═══ PN-012-B (بحران ششم): قلاب escrow در هر اسپاون سرور ═══
# ریست‌های محیط پلتفرم MELK_TOKEN_KEY را از .env.local پاک می‌کنند → fail-fast → 500.
# از این پس پیش از هر اسپاون، escrow-manager کلید غایب را از زنجیرهٔ سه‌مکانی
# (db/.runtime → upload/.runtime → env.escrow.enc رمزنگاری‌شده) بازیابی می‌کند و
# سپس .env.local دوباره source می‌شود. اگر هیچ escrow زنده نباشد، پیام BLOCKED
# ثبت می‌شود و fail-fast امنیتی (رفتار صحیح) باقی می‌ماند.

cd /home/z/my-project
STOP_FLAG="/home/z/my-project/.prod-stop"
LOG="/home/z/my-project/server.log"
ESCROW_CMD="bun /home/z/my-project/scripts/pn012/escrow-manager.ts restore"

echo "[watchdog] $(date '+%F %T') نگهبان سرور آغاز به کار کرد (PID $$)" >> "$LOG"

while true; do
  if [ -f "$STOP_FLAG" ]; then
    echo "[watchdog] $(date '+%F %T') فلگ توقف دیده شد — خروج" >> "$LOG"
    rm -f "$STOP_FLAG"
    exit 0
  fi

  # ─── PN-012-B: بازیابی راز از escrow پیش از اسپاون (idempotent · <۱s) ───
  if [ -f /home/z/my-project/scripts/pn012/escrow-manager.ts ]; then
    ESCROW_OUT=$($ESCROW_CMD 2>&1) || true
    echo "[escrow] $(date '+%F %T') $ESCROW_OUT" >> "$LOG"
  fi

  # بارگذاری رازها از .env.local — «هر بار» داخل حلقه (پس از احتمال بازیابی)
  set -a
  [ -f .env.local ] && . ./.env.local
  set +a

  PORT=3000 HOSTNAME=0.0.0.0 NODE_ENV=production \
    DATABASE_URL="file:/home/z/my-project/db/custom.db" \
    bun /home/z/my-project/.next/standalone/server.js >> "$LOG" 2>&1
  CODE=$?
  echo "[watchdog] $(date '+%F %T') سرور با کد $CODE متوقف شد — ری‌استارت پس از ۵ ثانیه" >> "$LOG"
  sleep 5
done
