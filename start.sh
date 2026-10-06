#!/usr/bin/env bash
# ============================================================
# start.sh — بوت رسمی ملکا (جلسهٔ فوق‌العاده ۰۰۵ · BLOCK 3)
# مسیر پایدار: گارد بازیابی → بیلد در صورت نبود → سرور production
# جایگزین رسمی «bun run dev» — برای پنل پلتفرم پیشنهاد شود:
#   دستور اجرا:  bash start.sh     (به‌جای bun run dev)
# ============================================================
set -uo pipefail
cd /home/z/my-project
mkdir -p upload/.survival

echo "[start.sh] بوت رسمی ملکا — $(date -u +%FT%TZ)"

# ۱) گارد بازیابی محیط (در صورت تخریب: DB/env از بستهٔ بقا برمی‌گردد)
#    بی‌اثر و بدون ریسک اگر محیط سالم باشد.
if [[ -f scripts/pn005c/recovery-guard.sh ]]; then
  bash scripts/pn005c/recovery-guard.sh || true
fi

# ۲) سرور production با نگهبان خود-راه‌انداز
#    (بیلد در صورت نبود داخل گارد/دیمن انجام می‌شود؛ دوباره چک می‌کنیم)
if [[ ! -f .next/standalone/server.js ]]; then
  echo "[start.sh] بیلد production…"
  if ! bun run build; then
    echo "[start.sh] بیلد شکست خورد — fallback به dev"
    exec bun run dev
  fi
fi

# ۳) راه‌اندازی دیمن نگهبان (double-fork → مقاوم در برابر پاک‌سازی)
exec python3 scripts/start-prod-daemon.py
