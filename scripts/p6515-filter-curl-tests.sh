#!/usr/bin/env bash
# p6515-filter-curl-tests.sh — BLOCK 0.2 (ملکا-شورا-۱۴۰۵-۰۱۸)
# آزمون مستقیم API هر فیلتر با curl — مقایسه با نتایج انتظاری از DB
set -u
BASE="http://localhost:3000"

echo "=== ورود مدیر ==="
LOGIN=$(curl -s --max-time 10 -X POST "$BASE/api/auth/master-login" -H "Content-Type: application/json" -d '{"masterCode":"41372895"}')
TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)
if [ -z "$TOKEN" ]; then echo "LOGIN FAILED:"; echo "$LOGIN" | head -3; exit 1; fi
echo "login OK (token ${#TOKEN} chars)"

auth() { curl -s --max-time 20 -H "Authorization: Bearer $TOKEN" "$BASE$1"; }
count() { python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('total','ERR'), len(d.get('rows',[])) if isinstance(d.get('rows'),list) else 'ERR')" 2>/dev/null; }

echo ""
echo "=== ماتریس آزمون فیلترها (total | rows) ==="
echo "--- ۰. بدون فیلتر (انتظار: 739) ---"
echo "no-filter:        $(auth "/api/crm/transactions?limit=5000&offset=0" | count)"

echo "--- ۱. کد ملک (انتظار: 2 با کد 41122) ---"
echo "propertyCode=41122 (لاتین):   $(auth "/api/crm/transactions?limit=5000&propertyCode=41122" | count)"
echo "propertyCode=۴۱۱۲۲ (فارسی):  $(auth "/api/crm/transactions?limit=5000&propertyCode=%D9%A4%DB%B1%DB%B1%DB%B2%DB%B2" | count)"
echo "propertyCode=99999999 (ناموجود، انتظار: 0): $(auth "/api/crm/transactions?limit=5000&propertyCode=99999999" | count)"

echo "--- ۲. کد درخواست (انتظار: 2 با کد 31842 · 1 با کد 32482) ---"
echo "requestCode=31842:   $(auth "/api/crm/transactions?limit=5000&requestCode=31842" | count)"
echo "requestCode=32482:   $(auth "/api/crm/transactions?limit=5000&requestCode=32482" | count)"
echo "requestCode=88888 (ناموجود، انتظار: 0): $(auth "/api/crm/transactions?limit=5000&requestCode=88888" | count)"

echo "--- ۳. هولوگرام (انتظار: 1) ---"
echo "contractHolo=140303771800000267: $(auth "/api/crm/transactions?limit=5000&contractHolo=140303771800000267" | count)"

echo "--- ۴. نام کارشناس (انتظار: 249 با «وحید حیدری» · 1 با «امیرمحمد احمدی») ---"
ENC=$(python3 -c "from urllib.parse import quote; print(quote('وحید حیدری'))")
ENC2=$(python3 -c "from urllib.parse import quote; print(quote('امیرمحمد احمدی'))")
ENC3=$(python3 -c "from urllib.parse import quote; print(quote('بابایان'))")
echo "expertName=وحید حیدری:     $(auth "/api/crm/transactions?limit=5000&expertName=$ENC" | count)"
echo "expertName=امیرمحمد احمدی: $(auth "/api/crm/transactions?limit=5000&expertName=$ENC2" | count)"
echo "expertName=بابایان (انتظار 0 — فقط نام سهم‌ها): $(auth "/api/crm/transactions?limit=5000&expertName=$ENC3" | count)"

echo "--- ۵. کد پرسنلی (انتظار: 2 با 410031310) ---"
echo "personnelCode=410031310: $(auth "/api/crm/transactions?limit=5000&personnelCode=410031310" | count)"
echo "personnelCode=999999999 (ناموجود، انتظار: 0): $(auth "/api/crm/transactions?limit=5000&personnelCode=999999999" | count)"
echo "expertCode=410031310 (پارامتر فرضی دستور — انتظار: نادیده=739 اگر پشتیبانی نشود): $(auth "/api/crm/transactions?limit=5000&expertCode=410031310" | count)"

echo "--- ۶. نوع قرارداد ---"
ENC_SALE=$(python3 -c "from urllib.parse import quote; print(quote('مبایعه نامه'))")
ENC_SALE_ZWNJ=$(python3 -c "from urllib.parse import quote; print('مبایعه\u200cنامه')")
ENC_RENT=$(python3 -c "from urllib.parse import quote; print(quote('اجاره نامه'))")
ENC_NONE=$(python3 -c "from urllib.parse import quote; print(quote('نامشخص'))")
echo "contractType=«مبایعه نامه» با فاصله (مقدار فعلی UI — انتظار: 522): $(auth "/api/crm/transactions?limit=5000&contractType=$ENC_SALE" | count)"
echo "contractType=«مبایعه‌نامه» با نیم‌فاصله (فرم دستور ۰۱۸ — انتظار اگر پشتیبانی نشود: 739 بی‌اثر): $(auth "/api/crm/transactions?limit=5000&contractType=$ENC_SALE_ZWNJ" | count)"
echo "contractType=«اجاره نامه» (مقدار UI — انتظار: 170+14=184): $(auth "/api/crm/transactions?limit=5000&contractType=$ENC_RENT" | count)"
echo "contractType=«نامشخص» (مقدار UI — انتظار: 0): $(auth "/api/crm/transactions?limit=5000&contractType=$ENC_NONE" | count)"
echo "contractType=none (فرم دستور ۰۱۸ — انتظار: نادیده یا خطا): $(auth "/api/crm/transactions?limit=5000&contractType=none" | count)"

echo "--- ۷. بازه تاریخ (ماه پر: 2025-12 → انتظار: 81) ---"
echo "dateFrom=2025-12-01&dateTo=2025-12-31: $(auth "/api/crm/transactions?limit=5000&dateFrom=2025-12-01&dateTo=2025-12-31" | count)"
echo "dateFrom=2025-12-01 (بدون dateTo):      $(auth "/api/crm/transactions?limit=5000&dateFrom=2025-12-01" | count)"

echo "--- ۸. ترکیبی ---"
echo "کد ملک + نوع: $(auth "/api/crm/transactions?limit=5000&propertyCode=41122&contractType=$ENC_SALE" | count)"
echo "نام کارشناس + بازه خالی (انتظار: 249): $(auth "/api/crm/transactions?limit=5000&expertName=$ENC&dateFrom=&dateTo=" | count)"
