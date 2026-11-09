#!/usr/bin/env bash
# ============================================================================
# deploy-zero-dt.sh — دیپلوی بدون قطعی (PN-054 · دستور ۱)
# ----------------------------------------------------------------------------
# مسیر رسمی انتشار بیلد تازه از این پس این فایل است (جایگزین «کشتن و بالا
# آوردن مجدد»):
#   ۱) گیت‌های یکپارچگی (chunk + build=HEAD) — در صورت ناقص بودن، بیلد
#      پس‌زمینه با nice؛ سرور فعلی در تمام مدت سرو می‌دهد.
#   ۲) دستور deploy به socket-master → فرزند سبز کنار آبی بالا می‌آید
#      (همان fd) → health چک → SIGTERM آبی → drain بدون خطا.
#   ۳) تایید نهایی: /api/version روی پورت ۳۰۰۰ با buildId تازه.
#
# استفاده:  bash scripts/pn054/deploy-zero-dt.sh
# ============================================================================
set -uo pipefail
cd /home/z/my-project

RUNTIME_DIR="upload/.runtime"
CMD_FILE="$RUNTIME_DIR/pn054-cmd"
DONE_FILE="$RUNTIME_DIR/pn054-deploy-done"
LOG="server.log"
T0=$(date +%s)

say() { echo "[deploy-zdt] $*"; echo "[deploy-zdt] $(date '+%F %T') $*" >> "$LOG"; }

# ۰) socket-master زنده است؟
if ! pgrep -f "pn054/socket-master.py" >/dev/null 2>&1; then
  say "❌ socket-master اجرا نیست — دیپلوی بدون قطعی ممکن نیست (اول بوت رسمی: bash scripts/start-prod.sh)"
  exit 1
fi

OLD_BUILD=$(curl -s --max-time 5 http://localhost:3000/api/version | python3 -c "import json,sys;print(json.load(sys.stdin).get('buildId','?'))" 2>/dev/null || echo "?")
say "بیلد فعلی: $OLD_BUILD"

# ۱) گیت یکپارچگی chunk (همان گیت واچ‌داگ)
if [ -x scripts/audit-chunk-integrity.sh ]; then
  if ! bash scripts/audit-chunk-integrity.sh --root /home/z/my-project \
       --witness "$RUNTIME_DIR/chunk-audit.json" --quiet >> "$LOG" 2>&1; then
    say "بیلد ناقص — بازسازی پس‌زمینه (nice)؛ سرور فعلی سرو می‌دهد…"
    nice -n 19 bun run build >> "$LOG" 2>&1 || { say "❌ بیلد شکست خورد — دیپلوی لغو شد (سرور فعلی دست‌نخورده)"; exit 1; }
  fi
fi

# ۲) گیت بیلد=HEAD (G3)
if [ -x scripts/pn048/build-head-gate.sh ]; then
  if ! bash scripts/pn048/build-head-gate.sh --watchdog >> "$LOG" 2>&1; then
    say "بیلد ≠ HEAD — بازسازی پس‌زمینه (nice)…"
    nice -n 19 bun run build >> "$LOG" 2>&1 || { say "❌ بیلد شکست خورد — دیپلوی لغو شد"; exit 1; }
    bash scripts/pn048/build-head-gate.sh --watchdog >> "$LOG" 2>&1 || say "⚠️ هنوز ناهمخوان — ادامهٔ بهترین-تلاش"
  fi
fi

# ۳) دستور Blue/Green
rm -f "$DONE_FILE"
mkdir -p "$RUNTIME_DIR"
echo '{"cmd":"deploy"}' > "$CMD_FILE"
say "دستور deploy صادر شد — انتظار برای چرخهٔ Blue/Green…"

# ۴) انتظار برای مارکر پایان (حداکثر ۴۵ ثانیه)
for _ in $(seq 1 90); do
  [ -f "$DONE_FILE" ] && break
  sleep 0.5
done
if [ ! -f "$DONE_FILE" ]; then
  say "❌ چرخهٔ Blue/Green در مهلت ۴۵ ثانیه کامل نشد — وضعیت را در server.log ببینید"
  exit 1
fi

# ۵) تایید نهایی روی پورت اصلی
NEW_BUILD=$(curl -s --max-time 5 http://localhost:3000/api/version | python3 -c "import json,sys;print(json.load(sys.stdin).get('buildId','?'))" 2>/dev/null || echo "?")
ELAPSED=$(( $(date +%s) - T0 ))
say "✅ دیپلوی کامل شد در ${ELAPSED}s — بیلد: $OLD_BUILD → $NEW_BUILD (صفر قطعی سرویس)"
echo "$NEW_BUILD"
