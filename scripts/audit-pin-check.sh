#!/usr/bin/env bash
# ============================================================================
# audit-pin-check.sh — گارد pin جلسهٔ ۰۳۴ (قاعدهٔ ۱۲: برای هر خطر جدید، یک گارد)
# ============================================================================
# ریشه: یافتهٔ امنیتی بُعد ۳ PN-026 — کد واقعی مالک (۸۰۲۱۱۱۸۶) در تست‌ها pin
# شده بود؛ PN-027 · ۵-الف-۳ با ۹۹۹۹۹۹۹۹ جایگزین شد. این گارد بازگشت آن را
# برای همیشه قرمز می‌کند — در tests/ و src/ هیچ کدی که در محیط واقعی اجرا
# می‌شود نباید کد واقعی مالک را literal داشته باشد.
#
# دامنه:
#   ۱) ۸۰۲۱۱۱۸۶ (کد واقعی مستند) در src/ و tests/ — صفر تحمل
#   ۲) ارقام مجاور آن (۸۰۲۲۱۱۱۸۶/۸۰۲۱۱۱۸۹ و ۷ رقم پیشوند) — صفر تحمل در
#      src/ (در tests/ فقط مقدار رگرسیونی مستندِ KNOWN_TYPO_CODE مجاز است)
#   ۳) MASTER_ACCESS_CODE= با مقدار عددی literal در src/ و tests/ — ممنوع
#      (الگو: env-first · PUBLIC_TEST_CODE = "0".repeat(8) مجاز است)
# خروجی: ۰ = PASS · ۱ = FAIL
# ============================================================================
set -uo pipefail
cd "$(dirname "$0")/.."

FAIL=0
ck() { # $1=پیام $2=وضعیت (1=سبز)
  if [ "$2" = "1" ]; then echo "  ✓ $1"; else echo "  ✗ $1"; FAIL=1; fi
}

echo "── audit-pin-check (جلسهٔ ۰۳۴ · قاعدهٔ ۱۲) ──"

# ۱) کد واقعی در src/ — صفر تحمل
SRC_REAL=$(grep -rF "80211186" src/ --include='*.ts' --include='*.tsx' 2>/dev/null | wc -l | tr -d ' ')
ck "کد واقعی ۸۰۲۱۱۱۸۶ در src/: $SRC_REAL مورد (انتظار ۰)" "$([ "$SRC_REAL" = "0" ] && echo 1 || echo 0)"

# ۲) کد واقعی در tests/ — فقط مجاز در کامنت سند مستند (pn003 header)
TEST_REAL=$(grep -rF "80211186" tests/ --include='*.ts' --include='*.tsx' 2>/dev/null | wc -l | tr -d ' ')
ck "کد واقعی ۸۰۲۱۱۱۸۶ در tests/: $TEST_REAL مورد (انتظار ۰)" "$([ "$TEST_REAL" = "0" ] && echo 1 || echo 0)"

# ۳) ارقام مجاور (near-neighbors) در src/ — صفر تحمل
SRC_NEAR=$(grep -rE "802[0-9]1186|80211[0-9]86" src/ --include='*.ts' --include='*.tsx' 2>/dev/null | wc -l | tr -d ' ')
ck "ارقام مجاور کد در src/: $SRC_NEAR مورد (انتظار ۰)" "$([ "$SRC_NEAR" = "0" ] && echo 1 || echo 0)"

# ۴) نمونهٔ آزمایشی ۹۹۹۹۹۹۹۹ (تست pn003) باید موجود بماند — رگرسیون مثبت
TEST_DUMMY=$(grep -rF "99999999" tests/pn003-master-code.test.ts 2>/dev/null | wc -l | tr -d ' ')
ck "نمونهٔ آزمایشی ۹۹۹۹۹۹۹۹ در تست pn003: $TEST_DUMMY مورد (انتظار ≥۴)" "$([ "$TEST_DUMMY" -ge 4 ] && echo 1 || echo 0)"

# ۵) env-first در تست بوت — رگرسیون الگو
ENVFIRST=$(grep -rF 'process.env.MASTER_ACCESS_CODE || "99999999"' tests/ 2>/dev/null | wc -l | tr -d ' ')
ck "الگوی env-first در تست‌ها: $ENVFIRST مورد (انتظار ≥۱)" "$([ "$ENVFIRST" -ge 1 ] && echo 1 || echo 0)"

# ۶) MASTER_ACCESS_CODE با literal عددی در src/ (غیر از تعریف type/parse)
SRC_ASSIGN=$(grep -rE 'MASTER_ACCESS_CODE\s*=\s*"[0-9]{8}"' src/ --include='*.ts' 2>/dev/null | wc -l | tr -d ' ')
ck "تخصیص literal کد در src/: $SRC_ASSIGN مورد (انتظار ۰)" "$([ "$SRC_ASSIGN" = "0" ] && echo 1 || echo 0)"

# ۷) اسکریپت‌های آرشیوشده (docs/archive) خارج از مسیر اجرا هستند — نباید شمرده شوند (خود-آزمون)
ARCHIVED=$(grep -rF "80211186" docs/archive/ 2>/dev/null | wc -l | tr -d ' ')
ck "آرشیو تاریخی شامل کد است ولی خارج از مسیر اجرا: $ARCHIVED فایل (مجاز — سند ممیزی)" "1"

if [ "$FAIL" = "0" ]; then
  echo "PASS: صفر pin کد واقعی در کد زنده (تست‌ها و منبع)."
  exit 0
else
  echo "FAIL: pin کد واقعی شناسایی شد — رفع پیش از کامیت الزامی است."
  exit 1
fi
