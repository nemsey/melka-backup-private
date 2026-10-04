#!/bin/bash
# Download key arm.melketabriz.ir chunks and extract API call patterns
BASE="https://arm.melketabriz.ir/assets"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"
CHUNKS=(
  "TradedStatisticsPage-Biq3JFyx.js"
  "dashboard-page-BbAuC-qN.js"
  "users-list-page-DvMNADhz.js"
  "RealtorPropertyStatisticsPage-0_UTk6Nq.js"
  "RealtorRequestStatisticsPage-6Rv9TgEr.js"
  "customer-club-page-CEcC5FrU.js"
  "realtor-interactions-page-BaAOESpk.js"
)
mkdir -p /tmp/arm-chunks
for c in "${CHUNKS[@]}"; do
  for i in 1 2 3; do
    if curl -sS --max-time 50 --connect-timeout 20 -A "$UA" "$BASE/$c" -o "/tmp/arm-chunks/$c" 2>/dev/null; then
      echo "OK  $c ($(wc -c < /tmp/arm-chunks/$c) bytes)"
      break
    else
      echo "retry $i $c"
      sleep 2
    fi
  done
done
echo "=== DONE ==="
ls -la /tmp/arm-chunks/ | head -20
