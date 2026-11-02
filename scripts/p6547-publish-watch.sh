#!/bin/bash
# پایش‌گر publish — P6547-cont (قانون لینک)
# هر ۵ دقیقه دامنهٔ publish را پروب می‌کند تا gitSha = HEAD محلی (7d70927) شود.
LOG=/tmp/publish-watch-p6547-cont.log
TARGET_SHA="7d70927"
URL="https://r1a5k87hzbg0-d.space-z.ai/api/version"
echo "[watch-p6547-cont] start $(date -u +%FT%TZ) — target gitSha=$TARGET_SHA" >> "$LOG"
for i in $(seq 1 240); do
  RESP=$(curl -s -m 20 -o /tmp/pub-body-cont.txt -w "%{http_code}" "$URL" 2>/dev/null)
  BODY=$(head -c 160 /tmp/pub-body-cont.txt 2>/dev/null)
  echo "probe[$i] $(date -u +%FT%TZ) http=$RESP body=$BODY" >> "$LOG"
  if echo "$BODY" | grep -q "\"gitSha\":\"$TARGET_SHA\""; then
    echo "GREEN-DETECTED $(date -u +%FT%TZ)" >> "$LOG"
    break
  fi
  sleep 300
done
echo "watch-end $(date -u +%FT%TZ)" >> "$LOG"
