#!/usr/bin/env bash
# ============================================================
# start-prod.sh — راه‌اندازی دیمن production ملکا (PN-042 · جلسهٔ ۰۷۰)
# ------------------------------------------------------------
# فراخوان رسمی resurrect-ultimate.sh (گام ۶) و هر راه‌اندازی دستی.
# کار: فلگ توقف را پاک می‌کند + دیمن نگهبان را با double-fork استاندارد
# یونیکس بالا می‌آورد (start-prod-daemon.py). نگهبان خودش سرور
# standalone را روی پورت ۳۰۰۰ اجرا و در کرش هر ۵ ثانیه احیا می‌کند؛
# Worker را هم supervisor سرور (معماری 1-web-1-worker) اسپاون می‌کند.
# ============================================================
set -euo pipefail
cd /home/z/my-project
rm -f .prod-stop
python3 scripts/start-prod-daemon.py
echo "[start-prod] نگهبان production دیمن شد — سرور + ری‌استارت خودکار + Worker ✓"
