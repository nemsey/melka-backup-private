#!/bin/bash
# ============================================================================
# dev.sh — قلاب بوت کانتینر (PN-056 · DIR-PN056-AUTO-RESURRECT · دستور ۲)
# ============================================================================
# این فایل توسط /start.sh پلتفرم در «هر بوت کانتینر» اجرا می‌شود:
#     sudo -u z bash /home/z/my-project/.zscripts/dev.sh        (پس‌زمینه)
# شاهد زنده: /tmp/boot-timeline.log → step="custom dev script"
# (بوت ۲۰۲۶-11-09T03:16:18Z · uptime=31.83s — شاهد کشف DIR-PN056)
#
# PN-056: جریان توسعهٔ پیشینِ قالبِ پلتفرم (bun install + db:push
# --accept-data-loss + bun run dev روی :3000) برای این میزبانِ production
# خطرناک بود: تداخل پورت با socket-master و دستکاری اسکیما روی دادهٔ زندهٔ
# مقدس. طبق دستور شورا، این قلاب اکنون «دروازه‌بان رستاخیز اتوماتیک»
# (boot-recovery.sh) را در نشستی جدا (setsid) اجرا می‌کند و خودش بی‌درنگ
# خارج می‌شود — بوت کانتینر هرگز بلوکه نمی‌شود (بودجهٔ سلامت FC: 120s).
#
# زنجیرهٔ گیت‌ها (داخل boot-recovery.sh):
#   سلامت (healthz 3100/3101) → بقا (نگهبان زنده؟ مداخله ممنوع)
#   → ارادهٔ اپراتور (.prod-stop) → تک‌نمونه → قفل flock
#   → setsid resurrect-ultimate.sh (صفر اتلاف · قانون ۱۱)
#
# بازیابی الگوی توسعهٔ قدیمی: git revert کامیت PN-056 (نسخهٔ قالبِ
# پلتفرم در تاریخچهٔ گیت محفوظ است).
# ============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$PROJECT_DIR/upload/.runtime/pn056"

echo "[DEV] [$(date -u +%FT%TZ)] PN-056 boot hook — رستاخیز اتوماتیک production"
mkdir -p "$LOG_DIR" 2>/dev/null || true

if [ -f "$PROJECT_DIR/boot-recovery.sh" ]; then
  # setsid: نشست جدا — مصون از کشته‌شدن گروه فرایند (درس قانون ۱۱-ب)؛
  # boot-recovery خودش مسئول گیت‌ها/قفل‌هاست و لاگ شاهد خودش را می‌نویسد.
  setsid nohup bash "$PROJECT_DIR/boot-recovery.sh" \
    </dev/null >>"$LOG_DIR/boot-hook.log" 2>&1 &
  disown 2>/dev/null || true
  echo "[DEV] boot-recovery.sh در نشست جدا اجرا شد — شاهد: $LOG_DIR/boot-recovery.log"
elif [ -f "$PROJECT_DIR/resurrect-ultimate.sh" ]; then
  # افتادگی ایمن: دروازه‌بان غایب است (نابودی عجیب؟) — مستقیم رستاخیز
  setsid nohup bash "$PROJECT_DIR/resurrect-ultimate.sh" \
    </dev/null >>"$PROJECT_DIR/resurrect-daemon.log" 2>&1 &
  disown 2>/dev/null || true
  echo "[DEV] boot-recovery.sh غایب — مستقیم resurrect-ultimate.sh اجرا شد"
else
  echo "[DEV] ERROR: نه boot-recovery.sh یافت شد و نه resurrect-ultimate.sh — بوت دستی لازم است"
fi

exit 0
