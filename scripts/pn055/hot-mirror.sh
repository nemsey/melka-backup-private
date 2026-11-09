#!/usr/bin/env bash
# ============================================================================
# hot-mirror.sh — آینهٔ داغ صفر-اتلاف (PN-055 · پاسخ پرسش ۱ و ۴ حکم شورا)
# ============================================================================
# دکترین (DIR-PN055-QUERY · قانون دادهٔ مقدس):
#   هر چرخه = اسنپ‌شات سازگار (backup API — هرگز cp روی DB زنده با WAL نیست)
#            → وارسی سلامت (quick_check) → گارد یکنوایی (سموم = رد)
#            → جای‌گذاری اتمی (tmp + rename در همان پوشه)
#
# دو لایه:
#   محلی  db/.mirror/custom-hot.db      — هر INTERVAL ثانیه (پیش‌فرض ۳۰)
#          ارزش: وقتی ossfs بیمار است (درس PN-041-R) + مقصد نجات سریع
#   پایدار upload/.data/mirror/custom-hot.db — هر OSS_EVERY چرخه (پیش‌فرض ~۶۰ث)
#          ارزش: بقا در برابر پاک‌شدن ریشهٔ کانتینر (منطقهٔ پایدار ossfs)
#
# RPO (پنجرهٔ بیشینهٔ اتلاف):
#   مرگِ فرایندها (ریست معمول)   = ۰ — WAL روی دیسک + «نجات نفس آخر» در رستاخیز
#   پاک‌شدن ریشهٔ کانتینر        = ≤ فاصلهٔ چرخهٔ لایهٔ پایدار (پیش‌فرض ~۶۰ث)
#   توقف تمیز (TERM → trap)      = ۰ — فرودِ تمیز نگهبان یک چرخهٔ نهایی می‌زند
#
# شاهد (قانون لینک): HIGHWATER.json در لایهٔ پایدار — بیشینهٔ شمارش دیده‌شده
# + لاگ چرخه‌ای db/.mirror/hot-mirror.log (زمان‌دار UTC).
#
# گارد یکنوایی (درس ریست ۲۰۲۶-۱۱-۰۷ — «سنک وضعیت تهی»):
#   اسنپ‌شاتِ تهی هرگز پرتر را جایگزین نمی‌کند؛ کاهش غیرصفر = عبور + شاهد
#   (پالایش عمدیِ مالک مشروع است — فقط تهی‌شدگی مطلق رد می‌شود).
#
# اجرا:
#   دیمن:   hot-mirror.sh            (توسط prod-watchdog باب‌سیت می‌شود)
#   یک‌بار: hot-mirror.sh --once     (فرودِ تمیز نگهبان / تست)
# ============================================================================
set -uo pipefail

REPO="/home/z/my-project"
OPS="$REPO/scripts/pn055/mirror_ops.py"
LIVE="${MELKA_LIVE_DB:-$REPO/db/custom.db}"                 # اوراید فقط برای شبیه‌سازی
LOCAL_DIR="${MELKA_MIRROR_LOCAL_DIR:-$REPO/db/.mirror}"      # اوراید فقط برای شبیه‌سازی
LOCAL_HOT="$LOCAL_DIR/custom-hot.db"
OSS_DIR="${MELKA_MIRROR_OSS_DIR:-$REPO/upload/.data/mirror}"
OSS_HOT="$OSS_DIR/custom-hot.db"
LOCK="${MELKA_MIRROR_LOCK:-/tmp/melka-hot-mirror.lock}"
LOG="$LOCAL_DIR/hot-mirror.log"
WITNESS="$OSS_DIR/HIGHWATER.json"
INTERVAL="${MELKA_MIRROR_INTERVAL_S:-30}"
OSS_EVERY="${MELKA_MIRROR_OSS_EVERY:-2}"

ONCE=0
[ "${1:-}" = "--once" ] && ONCE=1
[ "${MELKA_MIRROR_DISABLED:-0}" = "1" ] && exit 0

log() { echo "[$(date -u +%FT%TZ)] $*" >>"$LOG"; }
counts() { python3 "$OPS" counts "$1" 2>/dev/null || echo "-1 -1"; }

free_root_mb() { df -Pm / 2>/dev/null | awk 'NR==2{print $4}'; }

prune_log() {
  [ -f "$LOG" ] || return 0
  local n
  n=$(wc -l <"$LOG" 2>/dev/null || echo 0)
  if [ "$n" -gt 900 ]; then
    tail -400 "$LOG" >"$LOG.tmp" && mv -f "$LOG.tmp" "$LOG"
  fi
}

# ─── یک چرخهٔ آینه (نیازمند قفل) ───
CYCLE_N=0
run_cycle() {
  local ts t0 t1 dur cnt_new cnt_old ok_q fm pr_new pr_old
  ts=$(date -u +%FT%TZ)
  CYCLE_N=$((CYCLE_N + 1))

  if [ ! -s "$LIVE" ] || [ "$(head -c 15 "$LIVE" 2>/dev/null)" != "SQLite format 3" ]; then
    log "live نامعتبر/غایب — skip صادقانه (رستاخیز در جریان؟)"
    return 1
  fi
  mkdir -p "$LOCAL_DIR" "$OSS_DIR"

  # شیر دیسک ریشه — آینهٔ محلی ~۵۸۰MB روی ریشه می‌نویسد (آستانهٔ بکاپ چرخشی + حاشیه)
  fm=$(free_root_mb)
  if [ -z "$fm" ] || [ "$fm" -lt 1500 ]; then
    log "⚠️ فضای ریشهٔ کم (${fm:-?}MB) — skip صادقانه (چرخهٔ بعد)"
    return 1
  fi

  t0=$(date +%s%N)
  rm -f "$LOCAL_DIR/custom-hot.db.tmp"

  # اسنپ‌شات سازگار — backup API (منبع فقط-خواندنی؛ WAL را می‌خواند)
  if ! timeout 150 python3 "$OPS" backup "$LIVE" "$LOCAL_DIR/custom-hot.db.tmp" 2>>"$LOG"; then
    log "backup ناموفق — skip صادقانه"
    rm -f "$LOCAL_DIR/custom-hot.db.tmp"
    return 1
  fi

  # وارسی سلامت اسنپ‌شات تازه
  ok_q=$(python3 "$OPS" quickcheck "$LOCAL_DIR/custom-hot.db.tmp" 2>/dev/null)
  if [ "$ok_q" != "ok" ]; then
    log "❌ quick_check اسنپ‌شات تازه ناموفق ($ok_q) — رد (خط قرمز سلامت)"
    rm -f "$LOCAL_DIR/custom-hot.db.tmp"
    return 1
  fi

  # گارد یکنوایی — درس سم ۲۰۲۶-۱۱-۰۷: تهی هرگز پرتر را جایگزین نمی‌کند
  cnt_new=$(counts "$LOCAL_DIR/custom-hot.db.tmp")
  cnt_old=$(counts "$LOCAL_HOT")
  pr_new=$(echo "$cnt_new" | awk '{print $1}')
  pr_old=$(echo "$cnt_old" | awk '{print $1}')
  if [ "$pr_new" = "-1" ]; then
    log "❌ شمارش اسنپ‌شات تازه ناموفق — رد"
    rm -f "$LOCAL_DIR/custom-hot.db.tmp"
    return 1
  fi
  if [ "$pr_old" != "-1" ] && [ "$pr_old" -gt 0 ] && [ "$pr_new" -eq 0 ]; then
    log "🚨 گارد یکنوایی: اسنپ‌شات تهی ($pr_new) در برابر آینهٔ پر ($pr_old) — رد + پارک شاهد"
    mv -f "$LOCAL_DIR/custom-hot.db.tmp" "$LOCAL_DIR/poison-witness-$(date -u +%Y%m%dT%H%M%SZ).db" 2>/dev/null || true
    rm -f "$LOCAL_DIR/custom-hot.db.tmp-shm" "$LOCAL_DIR/custom-hot.db.tmp-wal" "$LOCAL_DIR/poison-witness-"*.db-shm "$LOCAL_DIR/poison-witness-"*.db-wal 2>/dev/null || true
    return 1
  fi
  if [ "$pr_old" != "-1" ] && [ "$pr_new" -lt "$pr_old" ]; then
    log "⚠️ کاهش شمارش ($pr_old → $pr_new) — عبور با شاهد (پالایش عمدی؟ بررسی شود)"
  fi

  # جای‌گذاری اتمی لایهٔ محلی + پاکسازی sidecarهای یتیم مقصد (WAL-flag از منبع می‌آید)
  mv -f "$LOCAL_DIR/custom-hot.db.tmp" "$LOCAL_HOT"
  rm -f "$LOCAL_DIR/custom-hot.db.tmp-shm" "$LOCAL_DIR/custom-hot.db.tmp-wal" 2>/dev/null || true
  t1=$(date +%s%N)
  dur=$(( (t1 - t0) / 1000000 ))

  # لایهٔ پایدار (هر OSS_EVERY چرخهٔ موفق؛ در --once همیشه — فرودِ تمیز باید برسد)
  local oss_note="skip"
  if [ $((CYCLE_N % OSS_EVERY)) -eq 0 ] || [ "$ONCE" = "1" ]; then
    local t2 t3 odur
    t2=$(date +%s%N)
    rm -f "$OSS_DIR/custom-hot.db.tmp"
    if cp -f "$LOCAL_HOT" "$OSS_DIR/custom-hot.db.tmp" 2>>"$LOG"; then
      mv -f "$OSS_DIR/custom-hot.db.tmp" "$OSS_HOT"
      python3 "$OPS" witness "$WITNESS" $(echo "$cnt_new") oss-push >/dev/null 2>&1 || true
      t3=$(date +%s%N)
      odur=$(( (t3 - t2) / 1000000 ))
      oss_note="push=${odur}ms"
    else
      rm -f "$OSS_DIR/custom-hot.db.tmp" 2>/dev/null || true
      oss_note="push-failed(ossfs-بیمار؟)"
    fi
  fi

  log "✓ چرخه #$CYCLE_N: local=${dur}ms · شاهد PR/RQ=$cnt_new · oss=$oss_note"
  prune_log
  return 0
}

acquire_and_cycle() {
  exec 9>"$LOCK"
  if flock -w 40 9; then
    run_cycle
    flock -u 9
  else
    log "قفل آینه مشغول (چرخهٔ همزمان) — skip"
  fi
}

# ─── ورودی ───
if [ "$ONCE" = "1" ]; then
  acquire_and_cycle
  exit $?
fi

# دیمن: چرخه + خواب — نگهبان (prod-watchdog) باب‌سیت می‌کند
log "🥚 دیمن آینهٔ داغ آغاز به کار کرد (بازه=${INTERVAL}s · هر ${OSS_EVERY} چرخه → پایدار)"
while true; do
  acquire_and_cycle
  sleep "$INTERVAL"
done
