#!/usr/bin/env bash
# ============================================================================
# boot-recovery.sh — دروازه‌بان رستاخیز اتوماتیک (PN-056 · دستور ۲)
# ----------------------------------------------------------------------------
# قلاب‌های فراخوانی:
#   ۱) .zscripts/dev.sh — اجراشده توسط /start.sh پلتفرم در «هر بوت کانتینر»
#      (شاهد: /tmp/boot-timeline.log → step="custom dev script")
#   ۲) پروتکل GLM — اولین فرمان پس از هر ریست (GLM-BOOT-PROTOCOL.md)
#
# قوانین حاکم (بخش ۴ دستور DIR-PN056-AUTO-RESURRECT):
#   • قانون بقا: اگر نگهبان production زنده است، هرگز مداخله نمی‌کنیم —
#     واچ‌داگ خودش در حلقهٔ خودش احیا می‌کند. قفل flock ضد هم‌زمانی.
#   • قانون تثبیت: صفر تغییر اپ/TS/React — فقط همین لایهٔ شل.
#   • قانون لینک: هر تصمیم در لاگ شاهد ثبت می‌شود
#     (upload/.runtime/pn056/boot-recovery.log — مانتِ پایدار).
#
# گیت‌ها (به‌ترتیب):
#   ۱) سلامت: healthz روی 3100 یا 3101 (پینگ‌پنگ Blue/Green) → خروج بی‌صدا
#   ۲) بقا: نگهبان زنده → مداخله ممنوع
#   ۳) ارادهٔ اپراتور: فلگ .prod-stop (توقف عمدی یا رستاخیز در جریان)
#   ۴) تک‌نمونه: رستاخیزِ واقعاً زندهٔ دیگر (تشخیص argv — همان منطق خودش)
#   ۵) قفل انحصاری flock (با مرگ فرایند خودکار رها می‌شود)
# سپس: setsid resurrect-ultimate.sh (نشست جدا — درس قانون ۱۱-ب: مصون از
# کشته‌شدن گروهِ فرایندِ شلِ مرگ‌پذیر) + شاهد زمان آمادگی.
#
# خروجی: ۰ = نیازی نبود / اسپاون موفق · ۱ = سرور در سقف زمان آماده نشد
# آرگومان: --no-wait = بدون پایش آمادگی (فقط اسپاون)
# ============================================================================
set -u

REPO="/home/z/my-project"
LOG_DIR="$REPO/upload/.runtime/pn056"
LOG="$LOG_DIR/boot-recovery.log"
RESURRECT="$REPO/resurrect-ultimate.sh"
STOP_FLAG="$REPO/.prod-stop"
RAW_URL="https://raw.githubusercontent.com/nemsey/melka-backup-private/main/resurrect-ultimate.sh"
# پورت‌های سلامت — پینگ‌پنگ Blue/Green (scripts/pn054/socket-master.py)
HEALTH_PORTS="3100 3101"
READY_TIMEOUT_S=180

mkdir -p "$LOG_DIR" 2>/dev/null || true
ts() { date -u +%FT%TZ; }
note() { printf '[boot-recovery %s] %s\n' "$(ts)" "$*" | tee -a "$LOG"; }

healthy() {
  local P
  for P in $HEALTH_PORTS; do
    curl -fsS -m 3 "http://127.0.0.1:$P/healthz" >/dev/null 2>&1 && return 0
  done
  return 1
}

# ── گیت ۱: سلامت — سریع و بی‌صدا (ضد تورم لاگ در هر شل تعاملی) ──
healthy && exit 0
note "healthz (3100/3101) بی‌پاسخ — ارزیابی شرایط رستاخیز…"

# ── گیت ۲: قانون بقا — نگهبان زنده است؟ مداخله ممنوع ──
if pgrep -f "prod-watchdog\.sh" >/dev/null 2>&1; then
  note "نگهبان production زنده است — طبق قانون بقا مداخله نمی‌کنم (واچ‌داگ خودش احیا می‌کند)"
  exit 0
fi

# ── گیت ۳: ارادهٔ اپراتور — فلگ توقف تمیز ──
# (.prod-stop هم توقف عمدی مالک را نشان می‌دهد، هم اینکه رستاخیزِ دیگری
#  در همین لحظه در حال کشتن/برپاکردن است — در هر دو حالت احترام می‌گذاریم)
if [ -f "$STOP_FLAG" ]; then
  note "فلگ .prod-stop حاضر است — توقف عمدی/رستاخیز در جریان؛ احترام می‌گذارم"
  exit 0
fi

# ── گیت ۴: تک‌نمونه — رستاخیز واقعاً زندهٔ دیگر؟ ──
# تشخیص دقیق مثل خود resurrect-ultimate (بخش قفل تک‌نمونه): argv[2] خودِ
# اسکریپت است، نه رشته‌ای در دستور والد — تفکیک فرایند رستاخیز از پوسته‌ای
# که فقط نامش را در خط فرمان دارد.
for _p in $(pgrep -f "resurrect-ultimate" 2>/dev/null); do
  [ "$_p" = "$$" ] && continue
  if tr '\0' '\n' </proc/"$_p"/cmdline 2>/dev/null | sed -n '2p' | grep -q "resurrect-ultimate"; then
    note "رستاخیز زندهٔ دیگر (PID $_p) — خروج (تک‌نمونه · PN-055)"
    exit 0
  fi
done

# ── گیت ۵: قفل انحصاری سطح-OS ──
exec 9>"$LOG_DIR/boot-recovery.lock"
flock -n 9 || { note "قفل در اختیار نمونهٔ دیگر است — خروج"; exit 0; }

# ── اسکریپت رستاخیز حاضر است؟ (git-tracked؛ بدترین حالت: از منبع حقیقت) ──
if [ ! -f "$RESURRECT" ]; then
  note "resurrect-ultimate.sh غایب — تلاش دانلود از منبع حقیقت…"
  TOK=""
  if [ -f "$REPO/upload/.mirror/credentials.env" ]; then
    TOK="$(set -a; . "$REPO/upload/.mirror/credentials.env" 2>/dev/null; set +a; \
           printf '%s' "${MIRROR_URL_AUTHED:-}" | sed -n 's#https://[^:]*:\([^@]*\)@.*#\1#p')"
  fi
  if [ -n "$TOK" ] && curl -fsSL -H "Authorization: token $TOK" \
      "${RAW_URL}?t=$(date +%s)" -o "$RESURRECT" 2>>"$LOG" && chmod +x "$RESURRECT"; then
    note "دانلود resurrect-ultimate.sh از منبع حقیقت موفق بود"
  else
    note "دانلود ناموفق — خروج با خطا (شاهد بالا)"
    exit 1
  fi
fi

note "همهٔ گیت‌ها سبز — اسپاون رستاخیز در نشست جدا (setsid)…"
RES_LOG="$LOG_DIR/resurrect-$(date -u +%Y%m%dT%H%M%S).log"
setsid nohup bash "$RESURRECT" </dev/null >>"$RES_LOG" 2>&1 &
RPID=$!
disown 2>/dev/null || true
note "resurrect-ultimate.sh اسپاون شد (PID $RPID · خروجی والد: $RES_LOG · لاگ اصلی: $REPO/resurrect-daemon.log)"

# هرس خودمان: ۱۰ لاگ رستاخیز آخر کافی است (ضد تورم مانت پایدار)
ls -t "$LOG_DIR"/resurrect-*.log 2>/dev/null | tail -n +11 | xargs -r rm -f --

# ── شاهد آمادگی: پایش تا سلامت کامل (سقف ۱۸۰ث) ──
if [ "${1:-}" != "--no-wait" ]; then
  T0=$(date +%s)
  while [ $(( $(date +%s) - T0 )) -lt "$READY_TIMEOUT_S" ]; do
    sleep 2
    if healthy; then
      note "READY — سرور آماده شد پس از $(( $(date +%s) - T0 )) ثانیه (شاهد زمان بوتِ خودکار)"
      exit 0
    fi
  done
  note "TIMEOUT — سرور ظرف ${READY_TIMEOUT_S}s آماده نشد؛ ادامهٔ رستاخیز در $RES_LOG و $REPO/resurrect-daemon.log"
  exit 1
fi
exit 0
