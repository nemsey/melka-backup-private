#!/usr/bin/env bash
# p6515-filter-verify2.sh — BLOCK D/F (ملکا-شورا-۱۴۰۵-۰۱۸) — موارد تکمیلی
set -u
BASE="http://localhost:3000"
LOGIN=$(curl -s --max-time 10 -X POST "$BASE/api/auth/master-login" -H "Content-Type: application/json" -d '{"masterCode":"00000000"}')
TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))")
[ -z "$TOKEN" ] && { echo "LOGIN FAILED"; exit 1; }
auth() { curl -s --max-time 20 -H "Authorization: Bearer $TOKEN" "$BASE$1"; }
count() { python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('total','ERR'))" 2>/dev/null; }

# --- نیم‌فاصله (فرم جلسه ۰۱۸) — با percent-encoding صحیح از python ---
ZWNJ_SALE=$(python3 -c "from urllib.parse import quote; print(quote('مبایعه‌نامه'))")
ZWNJ_PRE=$(python3 -c "from urllib.parse import quote; print(quote('پیش‌فروش'))")
ZWNJ_RENT=$(python3 -c "from urllib.parse import quote; print(quote('اجاره'))")
ZWNJ_EXT=$(python3 -c "from urllib.parse import quote; print(quote('تمدید اجاره'))")
SPACE_PRE=$(python3 -c "from urllib.parse import quote; print(quote('پیش فروش'))")

echo "مبایعه‌نامه (نیم‌فاصله، انتظار 522): $(auth "/api/crm/transactions?limit=5000&contractType=$ZWNJ_SALE" | count)"
echo "پیش‌فروش (نیم‌فاصله، انتظار 33):   $(auth "/api/crm/transactions?limit=5000&contractType=$ZWNJ_PRE" | count)"
echo "پیش فروش (فاصله، انتظار 33):       $(auth "/api/crm/transactions?limit=5000&contractType=$SPACE_PRE" | count)"
echo "اجاره (انتظار 170):                $(auth "/api/crm/transactions?limit=5000&contractType=$ZWNJ_RENT" | count)"
echo "تمدید اجاره (انتظار 14):           $(auth "/api/crm/transactions?limit=5000&contractType=$ZWNJ_EXT" | count)"
echo ""
echo "--- D.۱ چندانتخابی ---"
echo "مبایعه‌نامه+پیش‌فروش (انتظار 555): $(auth "/api/crm/transactions?limit=5000&contractType=$ZWNJ_SALE&contractType=$ZWNJ_PRE" | count)"
echo "اجاره+تمدید (انتظار 184):          $(auth "/api/crm/transactions?limit=5000&contractType=$ZWNJ_RENT&contractType=$ZWNJ_EXT" | count)"
echo "هر ۵ گزینه (انتظار 739):           $(auth "/api/crm/transactions?limit=5000&contractType=$ZWNJ_SALE&contractType=$ZWNJ_PRE&contractType=$ZWNJ_RENT&contractType=$ZWNJ_EXT&contractType=none" | count)"
echo "مبایعه‌نامه+none (انتظار 522):     $(auth "/api/crm/transactions?limit=5000&contractType=$ZWNJ_SALE&contractType=none" | count)"
echo ""
echo "--- F2: مقدار ناشناخته ⇒ 400 (نه بی‌اثر) ---"
BAD=$(python3 -c "from urllib.parse import quote; print(quote('قرارداد عجیب'))")
auth "/api/crm/transactions?limit=5000&contractType=$BAD" | head -c 220; echo ""
echo ""
echo "--- ترکیبی: نوع + نام کارشناس ---"
ENC=$(python3 -c "from urllib.parse import quote; print(quote('وحید حیدری'))")
echo "مبایعه‌نامه + وحید حیدری: $(auth "/api/crm/transactions?limit=5000&contractType=$ZWNJ_SALE&expertName=$ENC" | count)"
