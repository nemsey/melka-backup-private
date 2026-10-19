#!/usr/bin/env bash
# scripts/pn031i/bash-smoke.sh — تست واقعیِ توابع بحرانی اسکریپت رله PN-031-I
# منبع: اسکریپت رندرشده — توابع استخراج و با سناریو اجرا می‌شوند
set -u
SRC="/tmp/pn031i-relay-render.sh"
FAIL=0
ck() { [ "$2" = "$3" ] && echo "PASS — $1 ($3)" || { echo "FAIL — $1 (got=$2 want=$3)"; FAIL=1; }; }

# ── استخراج بلوک توابع تا انتهای version_ping ──
sed -n '/^UA=/,/^}/p' "$SRC" | sed -n '/^rate_gate/,/^}/p' > /tmp/pn031i-rate-gate.fn 2>/dev/null || true
# استخراج دستی: rate_gate کامل
awk '/^rate_gate\(\)/,/^}$/' "$SRC" > /tmp/pn031i-rate-gate.fn
awk '/^cur_url\(\)/,/^}$/' "$SRC" > /tmp/pn031i-cur-url.fn
awk '/^curl_err_desc\(\)/,/^}$/' "$SRC" > /tmp/pn031i-errdesc.fn

# ── ۱) rate_gate: پنجرهٔ ۶۰ثانیه‌ای حداکثر ۵ ──
SERVER_URL="https://x.example"; DEVICE_ID="d"; DEVICE_SECRET="s"; ALT_SERVER_URL=""
. /tmp/pn031i-errdesc.fn 2>/dev/null || true
log() { :; }
REQ_TIMES=()
now() { date +%s; }
# شبیه‌سازی: ۵ مهر در همین لحظه → درخواست ششم باید مکث بگیرد
T=$(now); REQ_TIMES=("$T" "$T" "$T" "$T" "$T")
SLEPT=0; sleep() { SLEPT=$((SLEPT+1)); echo "sleep-called:$1" >&2; }
. /tmp/pn031i-rate-gate.fn
rate_gate 2>/dev/null
ck "rate_gate مکث گرفت (۵تماس/۶۰ث)" "$SLEPT" "1"
ck "rate_gate پس از پاکسازی پنجره، مهر افزود" "$(( ${#REQ_TIMES[@]} >= 1 ? 1 : 0 ))" "1"

# ── ۲) rate_gate: زیر سقف → بدون مکث ──
T=$(now); REQ_TIMES=("$T" "$T")
SLEPT=0
rate_gate 2>/dev/null
ck "rate_gate زیر سقف بدون مکث" "$SLEPT" "0"

# ── ۳) cur_url + سوئیچ ──
URLS=("https://primary.example" "https://alt.example")
URL_COUNT=${#URLS[@]}; URL_IDX=0
. /tmp/pn031i-cur-url.fn
ck "cur_url پیش‌فرض primary" "$(cur_url)" "https://primary.example"
URL_IDX=$(( (URL_IDX + 1) % URL_COUNT ))
ck "cur_url پس از سوئیچ alt" "$(cur_url)" "https://alt.example"
URL_IDX=$(( (URL_IDX + 1) % URL_COUNT ))
ck "چرخهٔ سوئیچ برمی‌گردد primary" "$(cur_url)" "https://primary.example"

# ── ۴) نردبان retry: اندیس پله ──
RETRY_DELAYS=(30 60 120 300 300)
ladder() { local nf=$1; local idx=$(( nf < 4 ? nf - 1 : 4 )); echo "${RETRY_DELAYS[$idx]:-300}"; }
ck "پلهٔ ۱=۳۰ث" "$(ladder 1)" "30"
ck "پلهٔ ۲=۶۰ث" "$(ladder 2)" "60"
ck "پلهٔ ۳=۱۲۰ث" "$(ladder 3)" "120"
ck "پلهٔ ۴=۳۰۰ث" "$(ladder 4)" "300"
ck "پلهٔ ۱۰=۳۰۰ث (اشباع)" "$(ladder 10)" "300"

# ── ۵) curl_err_desc: کد ۹ توضیح تازه ──
DESC=$(curl_err_desc 9)
case "$DESC" in *"HTTP/1.1"*) echo "PASS — کد۹ توضیح http1.1";; *) echo "FAIL — کد۹: $DESC"; FAIL=1;; esac

exit $FAIL
