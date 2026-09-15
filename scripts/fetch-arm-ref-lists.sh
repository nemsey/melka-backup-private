#!/bin/bash
# دریافت فهرست‌های مرجع درخواست از سامانه ARM با retry (میزبان ایرانی ناپایدار)
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0"
BASE="https://arus-api.melketabriz.ir/api/apm"

fetch() {
  local path="$1" out="$2"
  for t in 1 2 3 4; do
    curl -sS --max-time 70 --connect-timeout 25 -A "$UA" "$BASE/$path" -o "$out" 2>/dev/null && [ -s "$out" ] && return 0
    sleep 4
  done
  return 1
}

mkdir -p /tmp/armref
fetch "trade-types/list" /tmp/armref/trade-types.json && echo "trade-types OK"
fetch "building-types/list" /tmp/armref/building-types.json && echo "building-types OK"
fetch "user-payment-methods/list" /tmp/armref/payment-methods.json && echo "payment-methods OK"
fetch "user-seriousness/list" /tmp/armref/seriousness.json && echo "seriousness OK"

# property-types برای هر نوع کاربری
if [ -s /tmp/armref/building-types.json ]; then
  for bt in $(node -e 'const d=require("/tmp/armref/building-types.json");console.log(d.data.list.map(b=>b._id).join(" "))'); do
    out="/tmp/armref/pt-$bt.json"
    [ -s "$out" ] || { fetch "property-types/list?buildingType=$bt" "$out" && echo "pt $bt OK"; }
  done
fi
echo DONE
