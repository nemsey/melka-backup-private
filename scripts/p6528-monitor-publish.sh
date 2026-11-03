#!/bin/bash
# p6528-monitor-publish.sh — پایش دامنهٔ publish تا سبز شدن (روی الگوی مستند P6521-P6527)
DOMAIN="https://r1a5k87hzbg0-d.space-z.ai"
OUT="/home/z/my-project/download/p6528-links/publish-probes.txt"
echo "=== P6528 publish monitor — $(date -u '+%Y-%m-%d %H:%M:%SZ') ===" > "$OUT"
for i in $(seq 1 24); do
  code=$(curl -s -o /tmp/pub_body.txt -w "%{http_code}" --max-time 20 "$DOMAIN/" 2>/dev/null)
  ver=$(curl -s --max-time 20 "$DOMAIN/api/version" 2>/dev/null | head -c 220)
  ts=$(date -u '+%H:%M:%S')
  echo "[$i/$ts] / -> HTTP $code | /api/version -> $ver" >> "$OUT"
  echo "[$i/$ts] HTTP $code | $ver"
  if [ "$code" = "200" ] && echo "$ver" | grep -q '"buildId"'; then
    echo "=== GREEN at probe $i ===" >> "$OUT"
    echo "GREEN"
    exit 0
  fi
  sleep 20
done
echo "=== still not green after 24 probes (8 min) ===" >> "$OUT"
echo "TIMEOUT"
exit 1
