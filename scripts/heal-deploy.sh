#!/usr/bin/env bash
# ============================================================================
# heal-deploy.sh — DIR-STATIC-500-001 (۲۰۲۶-۱۱-۲۰)
# ترمیم/دیپلوی رسمی و اتمی: بیلد رسمی از HEAD (فضای کاری بیرونی) →
# جابه‌جایی اتمیک به فروشگاه → ری‌استارت pn054 (Blue/Green صفر‌قطعی) →
# راستی‌آزمایی سلامت سرو‌دهی (چانک ۲۰۰ + همگرایی buildId).
#
# ریشهٔ حادثه: بیلد مخربِ درجا از مسیر سیم‌لینک .next، درختِ زندهٔ سرور را
# جایگزین کرد → CWD سرور حذف → همهٔ چانک‌های ایستا ۵۰۰ →
# «Application error: a client-side exception» برای همهٔ بازدیدکنندگان.
# این اسکریپت یگانه نقطهٔ ورود رسمی ترمیم است (قفل flock = تک‌نمونه).
#
# استفاده: bash scripts/heal-deploy.sh [--reason "متن دلیل"]
# ============================================================================
set -u
REPO="/home/z/my-project"
STORE="/home/z/melka-store"
LOG="$STORE/heal-deploy.log"
LOCK="$STORE/heal-deploy.lock"
RUNTIME="$REPO/upload/.runtime"
EDGE="https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai"

log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; echo "[heal-deploy] $*"; }

REASON="${2:-manual}"
[ "${1:-}" = "--reason" ] && REASON="${2:-manual}"

# ─── قفل تک‌نمونه: اگر ترمیم دیگری در جریان است، بی‌صدا خارج شو ───
exec 9>"$LOCK"
if ! flock -n 9; then
  log "SKIP: ترمیم دیگری در جریان است (قفل فعال)"
  exit 0
fi
log "=== آغاز ترمیم رسمی (reason=$REASON pid=$$) ==="

# ─── گام ۱: بیلد رسمی از HEAD در فضای کاری بیرونی + جابه‌جایی اتمیک ───
# (پرچم BUILD_RUNNING توسط خود دیمن ست/پاک می‌شود — کیپر حین بیلد ساکت است)
nice -n 10 python3 "$REPO/scripts/ws-build-daemon.py" --foreground >> "$LOG" 2>&1
RC=$?
if [ $RC -ne 0 ]; then
  log "FAIL: بیلد رسمی ناموفق (exit=$RC) — درخت فعلی دست‌نخورده ماند اگر سواپ نشد"
  exit 1
fi

# ─── گام ۲: وارسی همگرایی بیلد با HEAD ───
BID="$(cat "$STORE/next/BUILD_ID" 2>/dev/null || echo '')"
HEAD_SHA="$(git -C "$REPO" rev-parse --short HEAD 2>/dev/null || echo '')"
if [ -z "$BID" ] || [ -z "$HEAD_SHA" ] || [[ "$BID" != "$HEAD_SHA"-* ]]; then
  log "FAIL: بیلد ($BID) با HEAD ($HEAD_SHA) همگرا نیست — HEAD حین بیلد حرکت کرده؟"
  exit 1
fi
log "بیلد رسمی سواپ شد: BUILD_ID=$BID (= HEAD $HEAD_SHA)"

# ─── گام ۳: ری‌استارت صفر‌قطعی از طریق socket-master (pn054) ───
date +%s > "$RUNTIME/pn054-cmd.marker"
echo '{"cmd":"restart"}' > "$RUNTIME/pn054-cmd"
DEPLOY_OK=0
for i in $(seq 1 75); do
  sleep 1
  if [ -f "$RUNTIME/pn054-deploy-done" ]; then
    DONE_AT=$(stat -c %Y "$RUNTIME/pn054-deploy-done")
    NOW=$(date +%s)
    if [ $((NOW - DONE_AT)) -lt 60 ]; then DEPLOY_OK=1; break; fi
  fi
done
if [ $DEPLOY_OK -ne 1 ]; then
  log "WARN: نشانگر deploy-done تازه در ۷۵ث نیامد — سرور ممکن است از درخت تازه بالا نیامده باشد (پروب کیپر پیگیری می‌کند)"
else
  log "ری‌استارت انجام شد (deploy-done تازه)"
fi

# ─── گام ۴: راستی‌آزمایی سلامت سرو‌دهی از سرور محلی ───
sleep 3
VER="$(curl -s -m 10 http://127.0.0.1:3000/api/version 2>/dev/null || echo '')"
LIVE_BID="$(echo "$VER" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("buildId",""))' 2>/dev/null || echo '')"
CHUNK_CODE=000
HTML="$(curl -s -m 10 http://127.0.0.1:3000/ 2>/dev/null || echo '')"
CHUNK_REF="$(echo "$HTML" | grep -o '/_next/static/chunks/[^"\\]*\.js' | head -1)"
[ -n "$CHUNK_REF" ] && CHUNK_CODE="$(curl -s -m 10 -o /dev/null -w '%{http_code}' "http://127.0.0.1:3000$CHUNK_REF")"
log "راستی‌آزمایی: live-buildId=$LIVE_BID chunk=$CHUNK_CODE"

if [[ "$LIVE_BID" == "$BID" && "$CHUNK_CODE" == "200" ]]; then
  log "=== ترمیم کامل: سرو‌دهی سالم، زنده = دیسک = HEAD ($BID) ==="
  exit 0
fi

log "FAIL: راستی‌آزمایی ناکام (live=$LIVE_BID disk=$BID chunk=$CHUNK_CODE) — کیپر در چرخهٔ بعدی دوباره ترمیم می‌کند"
exit 1
