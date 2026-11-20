#!/usr/bin/env bash
# DIR-FF-CAP-502 — دیپلوی Blue/Green صفر‌قطعی + شاهد پیوستهٔ سلامت (قانون بقا)
set -u
cd /home/z/my-project
PREV="https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai"
LOG=/tmp/deploy-502-witness.log
: > "$LOG"

# شاهد پیوسته — هر ۳۰۰ms از خود لینک preview (نه سرور محلی)
( for i in $(seq 1 400); do
    TS=$(date +%s.%3N)
    CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$PREV/api/health" 2>/dev/null)
    echo "$TS $CODE" >> "$LOG"
    case "$CODE" in 200|000) ;; *) ;; esac
    sleep 0.3
  done ) &
POLLER=$!

BEFORE_PID=$(ss -tlnp 2>/dev/null | grep -oE "pid=[0-9]+.*310[01]" | head -2 | tr '\n' ' ')
echo "before: $BEFORE_PID"
date +%s > upload/.runtime/pn054-cmd.marker
echo '{"cmd":"restart"}' > upload/.runtime/pn054-cmd
echo "deploy cmd sent — waiting…"

for i in $(seq 1 60); do
  sleep 1
  if [ -f upload/.runtime/pn054-deploy-done ]; then
    DONE_AT=$(stat -c %Y upload/.runtime/pn054-deploy-done)
    NOW=$(date +%s)
    # فقط اگر مارکر تازه است (نه دیپلوی قبلی)
    if [ $((NOW - DONE_AT)) -lt 45 ]; then
      echo "deploy-done marker fresh (age=$((NOW - DONE_AT))s)"
      break
    fi
  fi
done
sleep 2
kill $POLLER 2>/dev/null
AFTER_PID=$(ss -tlnp 2>/dev/null | grep -oE "pid=[0-9]+.*310[01]" | head -2 | tr '\n' ' ')
echo "after: $AFTER_PID"
echo "=== شاهد پیوسته (preview /api/health) ==="
TOTAL=$(wc -l < "$LOG")
OK200=$(grep -c " 200$" "$LOG" || true)
NON200=$(grep -v " 200$" "$LOG" | head -5)
echo "total=$TOTAL ok200=$OK200"
[ -n "$NON200" ] && echo "non-200 samples:" && echo "$NON200"
cat upload/.runtime/pn054-deploy-done 2>/dev/null
echo
curl -s "$PREV/api/version" --max-time 15 | python3 -c "import json,sys; d=json.load(sys.stdin); print('edge buildId:',d['buildId'],'| gitSha:',d['gitSha'],'| drift.match:',d['drift']['match'])"
