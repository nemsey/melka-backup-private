#!/usr/bin/env bash
# ============================================================
# بازنظام‌دهی آینهٔ برون‌پلتفرمی پس از ریست پلتفرم — قانون ۰۳۱ بند و (P6544)
# ------------------------------------------------------------
# سناریو: پلتفرم ریست شده و محیط از اسنپ‌شات کهنه بازیابی شده است.
# آنچه زنده مانده: upload/.mirror/credentials.env + لاگ‌ها (ذخیره‌ساز پایدار)
# آنچه مُرده: ریموت git در .git/config + فرایند دیمن + اسکریپت‌ها (اگر
#             اسنپ‌شات قدیمی‌تر از P6544 باشد)
# کاری که این اسکریپت می‌کند:
#   ۱) بازسازی ریموت از credentials.env
#   ۲) وارسی دسترسی (ls-remote) و گزارش فاصلهٔ محلی/ریموت
#   ۳) در صورت نبودِ اسکریپت‌ها، بازگردانی‌شان از upload/.mirror/tools
#   ۴) راه‌اندازی دیمن ۶ساعته
#   ۵) گزارش وضعیت (به عنوان ورودی وارسی آغاز جلسه)
# اجرای دستی: bash scripts/mirror/re-arm.sh
# ============================================================
set -u
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

MIRROR_DIR="upload/.mirror"
CRED_FILE="$MIRROR_DIR/credentials.env"
TOOLS_DIR="$MIRROR_DIR/tools"

echo "== بازنظام‌دهی آینهٔ ملکا — $(date -u +%Y-%m-%dT%H:%M:%SZ) =="

# ۱) اعتبارنامه
if [[ ! -f "$CRED_FILE" ]]; then
  echo "FAIL: credentials.env موجود نیست — اعتبارنامهٔ آینه از دست رفته است."
  echo "اقدام: از مالک توکن تازه بخواهید (روتیشن توکن GitHub)."
  exit 1
fi
# shellcheck disable=SC1090
source "$CRED_FILE"

# ۲) بازسازی ریموت
git remote remove mirror >/dev/null 2>&1
git remote add mirror "$MIRROR_URL_AUTHED"
echo "OK: ریموت mirror بازسازی شد (توکن از فایل پایدار)."

# ۳) بازگردانی اسکریپت‌ها در صورت نبود (اسنپ‌شات کهنه)
if [[ ! -f scripts/mirror/mirror-daemon.sh && -f "$TOOLS_DIR/mirror-daemon.sh" ]]; then
  mkdir -p scripts/mirror
  cp "$TOOLS_DIR/mirror-daemon.sh" "$TOOLS_DIR/re-arm.sh" scripts/mirror/
  echo "OK: اسکریپت‌های دیمن از ذخیره‌ساز پایدار بازگردانی شدند."
fi

# ۴) وارسی دسترسی و فاصله
LOCAL_HEAD="$(git rev-parse refs/heads/main 2>/dev/null || echo unknown)"
REMOTE_HEAD="$(timeout 60 git ls-remote "$MIRROR_URL_AUTHED" refs/heads/main 2>/dev/null | awk '{print $1}')"
echo "HEAD محلی:   $LOCAL_HEAD"
echo "HEAD ریموت:  ${REMOTE_HEAD:-ناموفق}"
if [[ -z "${REMOTE_HEAD:-}" ]]; then
  echo "FAIL: دسترسی به مخزن ریموت برقرار نشد (شبکه/توکن)."
  exit 1
elif [[ "$LOCAL_HEAD" == "$REMOTE_HEAD" ]]; then
  echo "MATCH: محلی و آینه هم‌نسخه‌اند."
else
  echo "DIVERGED: محلی و آینه متفاوت‌اند — اگر محلی عقب است، بازیابی از آینه ممکن است:"
  echo "  git fetch mirror main && git log --oneline mirror/main -5"
  echo "  (بازیابی کامل کد نیازمند دستور صریح مالک است — بند و)"
fi

# ۵) راه‌اندازی دیمن
if pgrep -f mirror-daemon.sh >/dev/null 2>&1; then
  echo "OK: دیمن آینه از قبل در حال اجراست."
else
  # P6547: الگوی double-fork — سندباکس فرزندانِ مستقیمِ پوستهٔ ابزار را با پایان
  # فراخوانی می‌کشد؛ یتیم‌سازی فوری (PPID=1 داخل setsid) بقا را تضمین می‌کند.
  ( setsid nohup bash scripts/mirror/mirror-daemon.sh >> "$MIRROR_DIR/daemon.out" 2>&1 </dev/null & )
  sleep 2
  if pgrep -f mirror-daemon.sh >/dev/null 2>&1; then
    echo "OK: دیمن ۶ساعته راه‌اندازی شد (pid: $(pgrep -f mirror-daemon.sh | head -1))."
  else
    echo "FAIL: دیمن راه‌اندازی نشد — لاگ: $MIRROR_DIR/daemon.out"
    exit 1
  fi
fi

echo "== بازنظام‌دهی کامل شد =="
