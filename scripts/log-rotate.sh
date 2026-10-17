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

# PN-031-I (جلسهٔ ۰۵۰ · درس race بیلد ۲۲:۳۹): چرخش/هرس لاگ هنگام بیلد ممنوع —
# outputFileTracing نکست فایلهای server.log.*.gz را ردیابی و کپی می‌کند؛ اگر
# چرخش هم‌زمان یکی را حذف کند بیلد با ENOENT copyfile می‌میرد (ریشهٔ
# بیلدهای «گذرا» شکست‌خوردهٔ گاردها). پرچم BUILD_RUNNING از اسکریپت build
# نوشته می‌شود؛ تا ۲۰ دقیقه تازه = بیلد فعال.
if [ -f upload/.runtime/BUILD_RUNNING ]; then
  NOW=$(date +%s)
  FLAG_TS=$(stat -c %Y upload/.runtime/BUILD_RUNNING 2>/dev/null || echo 0)
  AGE=$(( NOW - FLAG_TS ))
  if [ "$AGE" -lt 1200 ]; then
    echo "[log-rotate] $(date -u +%FT%TZ) بیلد فعال (BUILD_RUNNING ${AGE}s) — چرخش به دور بعد موکول شد"
    exit 0
  fi
fi

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
