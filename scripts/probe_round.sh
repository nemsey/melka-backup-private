#!/bin/bash
# Repeated probe over time to determine which endpoints consistently respond
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"
t() { # t <url> <label>
  local code
  for i in 1 2 3; do
    code=$(curl -sS --max-time 20 --connect-timeout 12 -A "$UA" -o /tmp/probe-body.txt -w '%{http_code}' "$1" 2>/dev/null)
    if [ -n "$code" ] && [ "$code" != "000" ]; then
      local body
      body=$(head -c 220 /tmp/probe-body.txt | tr '\n' ' ')
      echo "[$2] HTTP $code :: $body"
      return
    fi
    sleep 2
  done
  echo "[$2] TIMEOUT x3"
}

echo "== round $(date +%H:%M:%S) =="
t "https://arus-api.melketabriz.ir/api/apm/authentication/otp/410031320" "arm OTP"
t "https://arus-api.melketabriz.ir/api/public/statics/enums-persian" "arm public enums"
t "https://pm-api.melketabriz.ir/api/public/portalInfo" "pm portalInfo"
t "https://pm-api.melketabriz.ir/api/authentication/otp/410031320" "pm OTP"
