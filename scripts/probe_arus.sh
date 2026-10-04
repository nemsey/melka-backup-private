#!/bin/bash
# Systematically probe arus-api endpoints with retries
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"
probe() {
  local url="$1" label="$2" method="${3:-GET}" data="$4"
  for i in 1 2 3; do
    if [ -n "$data" ]; then
      R=$(curl -sS --max-time 25 --connect-timeout 15 -A "$UA" -X "$method" -H "Content-Type: application/json" -d "$data" -w $'\n@@%{http_code}' "$url" 2>&1)
    else
      R=$(curl -sS --max-time 25 --connect-timeout 15 -A "$UA" -X "$method" -w $'\n@@%{http_code}' "$url" 2>&1)
    fi
    CODE=$(echo "$R" | tail -1 | tr -d '@')
    BODY=$(echo "$R" | head -n -1)
    if [ "$CODE" != "000" ] && [ -n "$CODE" ]; then
      echo "[$label] HTTP $CODE"
      echo "$BODY" | head -c 900
      echo
      return 0
    fi
    sleep 2
  done
  echo "[$label] FAILED (timeout x3)"
}

echo "########## arus-api root ##########"
probe "https://arus-api.melketabriz.ir/" "root"
echo "########## public statics ##########"
probe "https://arus-api.melketabriz.ir/api/public/statics/enums-persian" "public enums"
echo "########## apm statics ##########"
probe "https://arus-api.melketabriz.ir/api/apm/statics/enums-persian" "apm enums"
echo "########## apm global-settings ##########"
probe "https://arus-api.melketabriz.ir/api/apm/global-settings" "global-settings"
echo "########## apm otp request (fake code) ##########"
probe "https://arus-api.melketabriz.ir/api/apm/authentication/otp/99999999" "otp fake"
echo "########## apm otp login (fake) ##########"
probe "https://arus-api.melketabriz.ir/api/apm/authentication/otp/login" "otp login fake" POST '{"code":"99999999","otpCode":"000000"}'
