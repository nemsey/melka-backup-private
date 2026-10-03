#!/bin/bash
# Fetch a URL with retries (Iranian hosting is slow/flaky)
# usage: fetch.sh <url> <output-file> [max-tries]
URL="$1"; OUT="$2"; TRIES="${3:-4}"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
for i in $(seq 1 "$TRIES"); do
  echo "[try $i] $URL" >&2
  if curl -sS --max-time 55 --connect-timeout 25 -A "$UA" -L "$URL" -o "$OUT" 2>/tmp/fetch-err.txt; then
    echo "OK size=$(wc -c < "$OUT")" >&2
    exit 0
  fi
  echo "  failed: $(cat /tmp/fetch-err.txt)" >&2
  sleep 3
done
echo "GIVE-UP" >&2
exit 1
