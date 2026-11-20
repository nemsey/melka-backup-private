#!/usr/bin/env bash
# ============================================================================
# disk-governor.sh — DIR-PN080-001 · حاکم دیسک (پیشگیرانه + درمانی)
# ----------------------------------------------------------------------------
# ریشه‌یابی حادثهٔ ۲۰۲۶-۱۱-۲۰ شب (سقوط زنجیره‌ای قلاب طلایی):
#   بادکنک RelayQueue (۶۹۲MB) → DB=۱GB → هر اسنپ‌شات ~۱GB →
#   پنج بکاپ لوکال backups/ (۴.۱GB روی rootfs ۹.۹GB) → دیسک ۱۰۰٪ →
#   ossfs (stage روی rootfs) ناکام → کیپر حلقهٔ خطا → رستاخیز ENOSPC →
#   سرو کهنه + سواپ بدون ری‌استارت → client-side exception.
# این حاکم تضمین می‌کند rootfs هرگز به سقف نزدیک نشود.
#
# سطوح:
#   --check    : فقط سنجش و گزارش (خروجی ۰ = سالم · ۱ = نیازمند پاکسازی)
#   --enforce  : پاکسازی درمانی وقتی مصرف از آستانه بگذرد
# آستانه‌ها:   ACT_PCT=۸۵٪ (پاکسازی سبک) · CRIT_PCT=۹۲٪ (تهاجمی)
#
# فراخوان‌ها: کیپر (هر چرخهٔ ۶۰ث، سبک) · boot-recovery.sh (پیش از رستاخیز)
#             · resurrect-ultimate.sh (پیش‌پرواز) · دستی
# شاهد: upload/.runtime/disk-governor.log (منطقهٔ پایدار)
#
# قوانین: دادهٔ مقدس — هر حذفِ لایهٔ بکاپ فقط پس از اثباتِ وجودِ لایهٔ
# جدیدترِ سالم در قلعهٔ پایدار (upload/.data)؛ هرگز حذف کور.
# ============================================================================
set -u

REPO="/home/z/my-project"
STORE="/home/z/melka-store"
LOG_DIR="$REPO/upload/.runtime"
LOG="$LOG_DIR/disk-governor.log"
MOUNT="/"

ACT_PCT=85
CRIT_PCT=92
# حداقل فضای مطلق (MB) — زیر آن حتی اگر درصد خوش‌نما بود، پاکسازی
MIN_FREE_MB=1200

MODE="${1:--check}"
mkdir -p "$LOG_DIR" 2>/dev/null || true
ts() { date -u +%FT%TZ; }
note() { printf '[governor %s] %s\n' "$(ts)" "$*" | tee -a "$LOG" 2>/dev/null || printf '[governor %s] %s\n' "$(ts)" "$*"; }

usage_pct() {
  df -Pm "$MOUNT" 2>/dev/null | awk 'NR==2 {gsub("%","",$5); print $5; exit}'
}
free_mb() {
  df -Pm "$MOUNT" 2>/dev/null | awk 'NR==2 {print $4; exit}'
}

PCT="$(usage_pct)"; FREE="$(free_mb)"
[ -z "$PCT" ] || [ -z "$FREE" ] && { note "ERR: df ناکام"; exit 0; }

# ── سطح سوءاستفاده: ۰=سالم · ۱=سبک(ACT) · ۲=تهاجمی(CRIT یا زیر حداقل) ──
LEVEL=0
[ "$PCT" -ge "$ACT_PCT" ] && LEVEL=1
[ "$PCT" -ge "$CRIT_PCT" ] && LEVEL=2
[ "$FREE" -lt "$MIN_FREE_MB" ] && LEVEL=2

if [ "$MODE" = "--check" ]; then
  if [ "$LEVEL" -eq 0 ]; then
    # سالم — بی‌صدا (ضد تورم لاگ؛ فقط هر ~۱ ساعت یک شاهد سالم)
    LAST_OK=$(stat -c %Y "$LOG_DIR/disk-governor.heartbeat" 2>/dev/null || echo 0)
    NOW=$(date +%s)
    if [ $((NOW - LAST_OK)) -ge 3600 ]; then
      touch "$LOG_DIR/disk-governor.heartbeat"
      note "OK — مصرف ${PCT}٪ · آزاد ${FREE}MB"
    fi
    exit 0
  fi
  note "نیازمند پاکسازی — مصرف ${PCT}٪ · آزاد ${FREE}MB · سطح $LEVEL"
  exit 1
fi

# ─────────────────────────── --enforce ───────────────────────────
note "=== enforce شروع — مصرف ${PCT}٪ · آزاد ${FREE}MB · سطح $LEVEL ==="

# ── L1: پاکسازی سبک (همیشه در enforce) ──

# ۱) بکاپ‌های لوکال روزِ ریست (backups/backup-*.db) — فقط وقتی لایهٔ جدیدترِ
#    سالم در قلعه هست (دادهٔ مقدس: حذفِ مشروط به اثبات، هرگز کور)
newest_local=$(ls -t "$REPO"/backups/backup-*.db 2>/dev/null | head -1)
if [ -n "$newest_local" ]; then
  NEWEST_LOCAL_MT=$(stat -c %Y "$newest_local" 2>/dev/null || echo 0)
  # تازه‌ترین لایهٔ قلعه (قلعه یا مقدس یا چرخشی) که سالم است
  FORTRESS_MT=$(stat -c %Y "$REPO/upload/.data/custom.db" 2>/dev/null || echo 0)
  [ "$FORTRESS_MT" -ge "$((NEWEST_LOCAL_MT - 600))" ] && FORTRESS_VALID=1 || FORTRESS_VALID=0
  if [ "$FORTRESS_VALID" = "1" ]; then
    # تازه‌ترین بکاپ لوکال را نگه دار (یک لایهٔ اضافی روی دیسک)، بقیه را ببر
    REMOVED=0
    for f in $(ls -t "$REPO"/backups/backup-*.db 2>/dev/null | tail -n +2); do
      SZ=$(du -m "$f" 2>/dev/null | cut -f1)
      rm -f -- "$f" && REMOVED=$((REMOVED+1)) && note "بکاپ لوکال حذف شد: $(basename "$f") (${SZ}MB — قلعهٔ جدیدتر سالم است)"
    done
    [ "$REMOVED" -gt 0 ] || note "بکاپ لوکال اضافی نیست (فقط تازه‌ترین می‌ماند)"
  else
    note "هشدار: قلعهٔ پایدار معتبر نیست — بکاپ‌های لوکال دست‌نخورده (دادهٔ مقدس)"
  fi
fi
rm -f "$REPO"/backups/*.db-journal 2>/dev/null || true

# ۲) خرده‌ریزهای /tmp (کپی تست قدیمی، لاگ‌های آزمون، رندر) — فقط >۳۰ دقیقه
find /tmp -maxdepth 1 -name "full-*.log" -mmin +30 -delete 2>/dev/null || true
[ -d /tmp/my-project ] && [ -z "$(ls -A /tmp/my-project 2>/dev/null | head -3)" ] && rm -rf /tmp/my-project 2>/dev/null || true
TM=$(stat -c %Y /tmp/my-project 2>/dev/null || echo 0); NOW=$(date +%s)
[ "$TM" -gt 0 ] && [ $((NOW-TM)) -gt 3600 ] && rm -rf /tmp/my-project 2>/dev/null && note "کپی تستی /tmp/my-project (قدیمی‌تر از ۱ ساعت) حذف شد"
rm -rf /tmp/render 2>/dev/null || true

# ۳) درخت قدیمی فروشگاه (next.old) — فقط وقتی درخت فعلی سالم است
if [ -d "$STORE/next.old" ]; then
  if [ -s "$STORE/next/BUILD_ID" ] && [ -f "$STORE/next/fingerprint.json" ]; then
    rm -rf "$STORE/next.old" && note "next.old حذف شد (درخت فعال سالم است)"
  fi
fi

# ۴) هرس لاگ‌های داغ — بیش از ۲۰MB → ۵۰۰۰ خط آخر
for L in "$STORE/keeper.log" "$STORE/heal-deploy.log" "$STORE/ws-build-daemon.log" "$REPO/resurrect-daemon.log"; do
  if [ -f "$L" ]; then
    SZ=$(du -m "$L" 2>/dev/null | cut -f1)
    if [ "${SZ:-0}" -gt 20 ]; then
      tail -n 5000 "$L" > "$L.trim" 2>/dev/null && mv "$L.trim" "$L" && note "لاگ هرس شد: $(basename "$L") (${SZ}MB → ~۵۰۰۰ خط)"
    fi
  fi
done

# ── L2: تهاجمی (فقط سطح ۲) ──
if [ "$LEVEL" -ge 2 ]; then
  note "سطح ۲ (تهاجمی) فعال"
  # ۵) فشرده‌سازی گیت (با سقف زمان — هرگز بوت را گره نزنیم)
  (cd "$REPO" && timeout 90 git gc --prune=now --quiet 2>/dev/null) && note "git gc (main repo) انجام شد" || true

  # ۶) لاگ‌های چرخیدهٔ سرور — فقط دو تازه‌ترین
  ls -t "$REPO"/server.log.*.gz 2>/dev/null | tail -n +3 | xargs -r rm -f --
  note "لاگ‌های چرخیدهٔ قدیمی حذف شدند (دو تازه‌ترین ماندند)"

  # ۷) بقایای بازسازی
  rm -rf "$REPO/node_modules.restore-tmp" 2>/dev/null || true
  rm -rf "$REPO/.build-parking"/* 2>/dev/null || true

  # ۸) آخرین راه دادهٔ مقدس: اگر هنوز بحرانی است، حتی تازه‌ترین بکاپ لوکال
  #    هم برود — اما فقط با دو شاهد پایدار (قلعه + مقدس/چرخشی)
  PCT2="$(usage_pct)"
  if [ "${PCT2:-0}" -ge "$CRIT_PCT" ]; then
    SACRED_NEWEST=$(ls -t "$REPO"/upload/.data/sacred/sacred-*.db 2>/dev/null | head -1)
    ROLLING_NEWEST=$(ls -t "$REPO"/upload/.data/rolling/live-*.db 2>/dev/null | head -1)
    FORTRESS_OK=0; [ -s "$REPO/upload/.data/custom.db" ] && FORTRESS_OK=1
    if [ -n "$SACRED_NEWEST" ] && [ -n "$ROLLING_NEWEST" ] && [ "$FORTRESS_OK" = "1" ]; then
      rm -f "$REPO"/backups/backup-*.db 2>/dev/null
      note "بحرانی: همهٔ بکاپ‌های لوکال حذف شدند (سه شاهد پایدار حاضرند: قلعه+مقدس+چرخشی)"
    fi
  fi
fi

PCT_AFTER="$(usage_pct)"; FREE_AFTER="$(free_mb)"
note "=== enforce پایان — مصرف ${PCT_AFTER}٪ · آزاد ${FREE_AFTER}MB (پیش: ${PCT}٪/${FREE}MB) ==="
exit 0
