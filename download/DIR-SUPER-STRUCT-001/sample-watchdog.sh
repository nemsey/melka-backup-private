#!/usr/bin/env bash
# watchdog.sh — نسل Q (DIR-SUPER-STRUCT-001 · بخش ب-۲/ج-۱) — تولید توسط هستهٔ رله
# هر ۱۵ث: وارسی زنده‌بودن هسته (relay.pid) + بازآید خودکار · هر ۳۰ث: ضربان قلب
# امضاشده به /api/mobile-relay/heartbeat. سشن مستقل: کرش هسته، نگهبان را نمی‌کشد.
set -u
WD_DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd)"
if [ -r "$WD_DIR/device.env" ]; then . "$WD_DIR/device.env" 2>/dev/null; else exit 0; fi
if [ -z "${SERVER_URL:-}" ] || [ -z "${DEVICE_ID:-}" ] || [ -z "${DEVICE_SECRET:-}" ]; then exit 0; fi
RELAY_PID_FILE="$WD_DIR/relay.pid"
CORE_RELAY="$WD_DIR/core-relay.sh"
UA_W="${UA:-Mozilla/5.0}"
WD_RESTARTS=0
WD_ITER=0
CLOCK_OFFSET=0
WD_LAST_SYNC=0
log_w() { echo "[$(date '+%H:%M:%S')] [نگهبان] $*"; }
sha256hex_w() { openssl dgst -sha256 -hex 2>/dev/null | sed 's/^.*= //'; }
hmac_hex_w() { openssl dgst -sha256 -hmac "$DEVICE_SECRET" -hex 2>/dev/null | sed 's/^.*= //'; }
sync_clock_w() {
  local now hdr t se
  now=$(date +%s)
  [ $(( now - WD_LAST_SYNC )) -lt 900 ] && return 0
  WD_LAST_SYNC=$now
  hdr=$(mktemp)
  curl --http1.1 -A "$UA_W" -sSI --max-time 12 -D "$hdr" -o /dev/null "$SERVER_URL/api/health" 2>/dev/null || { rm -f "$hdr"; return 0; }
  t=$(awk 'tolower($1)=="date:"{$1="";sub(/^ /,"");sub(/\r$/,"");print;exit}' "$hdr")
  rm -f "$hdr"
  [ -z "$t" ] && return 0
  se=$(date -d "$t" +%s 2>/dev/null) || return 0
  CLOCK_OFFSET=$(( (se - $(date +%s)) * 1000 ))
  return 0
}
wd_heartbeat() {
  # $1 = زنده‌بودن هستهٔ رله (true/false) — بدنهٔ کوچک؛ خرج شبکه ~صفر
  local body ts digest sig
  body="{\"alive\":$1,\"restarts\":$WD_RESTARTS}"
  ts=$(( $(date +%s%3N) + CLOCK_OFFSET ))
  digest=$(printf '%s' "$body" | sha256hex_w)
  sig=$(printf 'POST\n/api/mobile-relay/heartbeat\n%s\n%s' "$digest" "$ts" | hmac_hex_w)
  [ -z "$ts" ] || [ -z "$sig" ] && return 0
  curl --http1.1 -A "$UA_W" -sS --max-time 12 "$SERVER_URL/api/mobile-relay/heartbeat" \
    -X POST -H "Content-Type: application/json" --data-binary "$body" \
    -H "X-Melka-Relay-Device: $DEVICE_ID" \
    -H "X-Melka-Timestamp: $ts" \
    -H "X-Melka-Signature: $sig" >/dev/null 2>&1 || true
}
log_w "نگهبان رلهٔ ملکا آغاز شد (نسل Q) — وارسی ۱۵ث · بازآید خودکار · ضربان قلب ۳۰ث"
while true; do
  WD_ITER=$((WD_ITER+1))
  sync_clock_w
  RP=""
  [ -r "$RELAY_PID_FILE" ] && RP=$(cat "$RELAY_PID_FILE" 2>/dev/null)
  ALIVE=false
  [ -n "$RP" ] && kill -0 "$RP" 2>/dev/null && ALIVE=true
  if [ "$ALIVE" != "true" ] && [ -f "$CORE_RELAY" ]; then
    WD_RESTARTS=$((WD_RESTARTS+1))
    log_w "هستهٔ رله زنده نیست — بازآید خودکار شمارهٔ $WD_RESTARTS …"
    ( cd "$WD_DIR" 2>/dev/null; setsid nohup bash "$CORE_RELAY" >> "$WD_DIR/relay-restarts.log" 2>&1 & ) >/dev/null 2>&1
    sleep 5
    continue
  fi
  # ضربان هر دو چرخه (۱۵ث × ۲ = ۳۰ث) — عین دستور مالک؛ پیام صرفاً «من زنده‌ام»
  [ $(( WD_ITER % 2 )) -eq 0 ] && wd_heartbeat "$ALIVE"
  sleep 15
done