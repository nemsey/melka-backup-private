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

# ═══ PN-008 اولاً: ارتقای منابع در حد امکان کانتینر ═══
ulimit -n 100000 2>/dev/null || true          # فایل‌های باز هم‌زمان: 1024 → 100000
export UV_THREADPOOL_SIZE="${UV_THREADPOOL_SIZE:-4}"  # ThreadPool I/O (کریپتو نشست/فایل)
bun scripts/pn008/ensure-wal.ts 2>/dev/null || true  # SQLite WAL — هم‌زمانی بهتر روی ۲ vCPU


# ۱) گارد بازیابی محیط (در صورت تخریب: DB/env از بستهٔ بقا برمی‌گردد)
#    بی‌اثر و بدون ریسک اگر محیط سالم باشد.
if [[ -f scripts/pn005c/recovery-guard.sh ]]; then
  bash scripts/pn005c/recovery-guard.sh || true
fi

# ═══ PN-012-B (بحران ششم): بازیابی راز بوت از escrow سه‌مکانی ═══
# .env.local → db/.runtime → upload/.runtime → env.escrow.enc (رمزنگاری‌شدهٔ گیت)
if [[ -f scripts/pn012/escrow-manager.ts ]]; then
  bun scripts/pn012/escrow-manager.ts restore 2>&1 || true
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
