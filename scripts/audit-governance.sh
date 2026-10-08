#!/usr/bin/env bash
# ============================================================
# audit-governance.sh — PN-019 فاز ۹: گارد حاکمیت ۱۵قاعده‌ای
# ------------------------------------------------------------
# وارسی‌ها (DES9 §۱۹):
#   ۱) آخرین GovernanceCheckRecord دارای دقیقاً ۱۵ نتیجه
#   ۲) هر بررسی اخیر با triggerSource معتبر (worker|manual)
#   ۳) GOV-DECISION-001: صفر autoExecute در DB (پیوند با گارد فاز ۸)
#   ۴) جستجوی کد: emptyGovernanceContext در مسیر تولیدی سرویس خوانده نشده
#   ۵) هر ارتقای مدل مهرشده با councilApproved (پیوند GOV-MODEL-001)
#   ۶) پنج قاعدهٔ critical مناطق عملیاتی حیاتی: نشست کهنه/توکن مشترک صفر
# خروج: ۰ = PASS · ۱ = FAIL
# ============================================================
set -uo pipefail
cd /home/z/my-project
DB="${MELKA_DB:-db/custom.db}"

FAILS=0

# ─── ۱) آخرین بررسی ۱۵نتیجه‌ای ───
V=$(python3 - "$DB" <<'PYEOF'
import sqlite3, sys, json
con = sqlite3.connect(sys.argv[1])
row = con.execute("SELECT resultsJson FROM GovernanceCheckRecord ORDER BY checkedAt DESC LIMIT 1").fetchone()
con.close()
if not row:
    print("NONE")
else:
    try:
        arr = json.loads(row[0] or "[]")
        print(len(arr))
    except Exception:
        print("PARSE")
PYEOF
)
if [ "$V" != "15" ]; then echo "  ✗ آخرین بررسی $V نتیجه دارد (انتظار: ۱۵)"; FAILS=1; fi

# ─── ۲) triggerSource معتبر ───
V=$(python3 - "$DB" <<'PYEOF'
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
n = con.execute("SELECT COUNT(*) FROM GovernanceCheckRecord WHERE triggerSource NOT IN ('worker','manual')").fetchone()[0]
con.close()
print(n)
PYEOF
)
if [ "$V" != "0" ]; then echo "  ✗ $V بررسی با منبع نامعتبر"; FAILS=1; fi

# ─── ۳) صفر autoExecute (GOV-DECISION-001) ───
V=$(python3 - "$DB" <<'PYEOF'
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
d = con.execute("SELECT COUNT(*) FROM DecisionRecord WHERE autoExecute=1").fetchone()[0]
a = con.execute("SELECT COUNT(*) FROM ActionPlanRecord WHERE autoExecute=1").fetchone()[0]
con.close()
print(d + a)
PYEOF
)
if [ "$V" != "0" ]; then echo "  ✗ $V نقض GOV-DECISION-001"; FAILS=1; fi

# ─── ۴) emptyGovernanceContext فقط در پیمایش ساختاری مجاز است، نه منبع نهایی زمینه ───
if rg -n "return emptyGovernanceContext\(\)" src/lib/services/governance-service.ts >/dev/null 2>&1; then
  echo "  ✗ زمینهٔ حاکمیت از پیش‌فرض خالی برمی‌گردد — نقض G-GOV-01"; FAILS=1
fi

# ─── ۵) ارتقاهای مهرشده دارای تأیید شورا (GOV-MODEL-001) ───
V=$(python3 - "$DB" <<'PYEOF'
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
n = con.execute("SELECT COUNT(*) FROM ModelVersion WHERE promotedAt IS NOT NULL AND councilApproved=0").fetchone()[0]
con.close()
print(n)
PYEOF
)
if [ "$V" != "0" ]; then echo "  ✗ $V ارتقای بدون شورا (GOV-MODEL-001)"; FAILS=1; fi

# ─── ۶) نشست کهنهٔ فعال / توکن مشترک (GOV-ACCESS-001/004) ───
V=$(python3 - "$DB" <<'PYEOF'
import sqlite3, sys, time
con = sqlite3.connect(sys.argv[1])
now = int(time.time() * 1000)
old = con.execute("SELECT COUNT(*) FROM UserSession WHERE isActive=1 AND createdAt < ?", (now - 30*86400000,)).fetchone()[0]
dup = con.execute("SELECT COUNT(*) FROM (SELECT tokenHash FROM UserSession WHERE isActive=1 GROUP BY tokenHash HAVING COUNT(*)>1)").fetchone()[0]
con.close()
print(old + dup)
PYEOF
)
if [ "$V" != "0" ]; then echo "  ✗ $V نقض دسترسی (نشست کهنه/توکن مشترک)"; FAILS=1; fi

echo "======================================================================="
if [ "$FAILS" != "0" ]; then
  echo "FAIL: گارد حاکمیت نقض دارد"
  exit 1
fi
echo "PASS: حاکمیت ۱۵قاعده‌ای برقرار — زمینهٔ زنده · دروازهٔ شورا · قواعد دسترسی"
exit 0
