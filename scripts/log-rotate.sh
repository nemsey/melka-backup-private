#!/bin/bash
# ============================================================
# log-rotate.sh — چرخش لاگ‌های ملکا (ملکا-شورا-ن۰۰۶ BLOCK 7.2)
# اگر فایلی از لاگ‌های زیر ۱۰MB گذشت: بایگانی فشرده + نگهداری ۳ نسل
# لاگ‌ها: dev.log · server.log · ram-monitoring.log
# بدون دیمن جدید — از حلقهٔ پایشگر RAM موجود (هر ۶۰ ثانیه) فراخوانی می‌شود.
# ============================================================
cd /home/z/my-project
LIMIT_KB=$((10 * 1024))
KEEP=3

for f in dev.log server.log download/pn005/ram-monitoring.log; do
  [ -f "$f" ] || continue
  SIZE=$(stat -c %s "$f" 2>/dev/null || echo 0)
  if [ "$SIZE" -gt "$LIMIT_KB" ]; then
    TS=$(date -u +%Y%m%dT%H%M%SZ)
    gzip -c "$f" > "${f}.${TS}.gz" && : > "$f"
    echo "[log-rotate] $(date -u +%FT%TZ) ${f} (${SIZE}KB) → ${f}.${TS}.gz"
    # نگهداری فقط ۳ نسل آخر
    ls -t ${f}.*.gz 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do rm -f "$old"; done
  fi
done
