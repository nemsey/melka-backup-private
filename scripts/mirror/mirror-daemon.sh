#!/usr/bin/env bash
# ============================================================
# mirror-daemon.sh — دیمن آینهٔ برون‌پلتفرمی ملکا (P6544/بند ل)
# ------------------------------------------------------------
# PN-010 (BLOCK 4): چرخهٔ واقعی در mirror-cycle.sh استخراج شد و در
# صف Worker (کار mirror-cycle هر ۶ ساعت) اجرا می‌شود — این دیمن دیگر
# مسیر تولیدی نیست و فقط برای کار دستی/اطمینان باقی مانده (پوشش‌دهنده).
# برای راه‌اندازی دستی: bash scripts/mirror/re-arm.sh
# ============================================================
set -u
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

MIRROR_DIR="upload/.mirror"
PID_FILE="$MIRROR_DIR/daemon.pid"
INTERVAL_SECONDS=21600   # ۶ ساعت

# --- گارد: تنها یک نمونه (وارسی هویت cmdline — P6549) ---
guard_pid() { cat "$PID_FILE" 2>/dev/null; }
is_our_daemon() {
  local p; p="$(guard_pid)"
  [[ -n "$p" ]] || return 1
  kill -0 "$p" 2>/dev/null || return 1
  grep -qa "mirror-daemon.sh" "/proc/$p/cmdline" 2>/dev/null
}
if is_our_daemon; then
  echo "daemon already running (pid $(guard_pid))" >&2
  exit 0
fi
echo $$ > "$PID_FILE"
trap 'rm -f "$PID_FILE"' EXIT

while true; do
  MIRROR_CALLER=daemon bash "$REPO_ROOT/scripts/mirror/mirror-cycle.sh" || true
  sleep "$INTERVAL_SECONDS"
done
