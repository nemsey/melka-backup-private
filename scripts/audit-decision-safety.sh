#!/usr/bin/env bash
# ============================================================
# audit-decision-safety.sh — PN-019 فاز ۸: گارد ایمنی چرخهٔ تصمیم
# ------------------------------------------------------------
# وارسی‌ها (DES8 §۲۱):
#   ۱) هیچ DecisionRecord/ActionPlanRecord با autoExecute=1
#   ۲) هیچ SafetyCheckRecord با passed=1 و blockedBy غیرخالی
#   ۳) هیچ ShadowDecisionRun با executedSteps≠0 (گارانتی صفر-اجرا)
#   ۴) هر ActionPlanRecord دارای rollbackPlan غیرخالی
#   ۵) هر DecisionRecord دارای ≥۳ گزینهٔ رتبه‌بندی‌شده
#   ۶) جستجوی کد: هیچ مسیر اجرای برنامهٔ اقدام در سرویس وجود ندارد
#   ۷) تصمیم active با expiresAt گذشته باید جاروب شده باشد (هشدار)
# خروج: ۰ = PASS · ۱ = FAIL
# ============================================================
set -uo pipefail
cd /home/z/my-project
DB="${MELKA_DB:-db/custom.db}"

FAILS=0

# ─── ۱) صفر autoExecute (GOV-DECISION-001 — قید سازنده) ───
V=$(python3 - "$DB" <<'PYEOF'
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
d = con.execute("SELECT COUNT(*) FROM DecisionRecord WHERE autoExecute=1").fetchone()[0]
a = con.execute("SELECT COUNT(*) FROM ActionPlanRecord WHERE autoExecute=1").fetchone()[0]
con.close()
print(d + a)
PYEOF
)
if [ "$V" != "0" ]; then echo "  ✗ $V ردیف با autoExecute=1 — نقض قید سازنده"; FAILS=1; fi

# ─── ۲) شاهد ایمنی سازگار ───
V=$(python3 - "$DB" <<'PYEOF'
import sqlite3, sys, json
con = sqlite3.connect(sys.argv[1])
rows = con.execute("SELECT passed, blockedByJson FROM SafetyCheckRecord").fetchall()
bad = 0
for passed, blocked in rows:
    try:
        bl = json.loads(blocked or "[]")
    except Exception:
        bl = ["PARSE"]
    if passed == 1 and bl:
        bad += 1
con.close()
print(bad)
PYEOF
)
if [ "$V" != "0" ]; then echo "  ✗ $V شاهد ایمنی ناسازگار (passed + blocked)"; FAILS=1; fi

# ─── ۳) گارانتی صفر-اجرای سایه ───
V=$(python3 - "$DB" <<'PYEOF'
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
n = con.execute("SELECT COUNT(*) FROM ShadowDecisionRun WHERE executedSteps != 0").fetchone()[0]
con.close()
print(n)
PYEOF
)
if [ "$V" != "0" ]; then echo "  ✗ $V اجرای سایه با executedSteps≠0 — نقض مطلق"; FAILS=1; fi

# ─── ۴) rollback کامل ───
V=$(python3 - "$DB" <<'PYEOF'
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
n = con.execute("SELECT COUNT(*) FROM ActionPlanRecord WHERE rollbackPlan IS NULL OR TRIM(rollbackPlan)=''").fetchone()[0]
con.close()
print(n)
PYEOF
)
if [ "$V" != "0" ]; then echo "  ✗ $V برنامهٔ اقدام بدون rollbackPlan"; FAILS=1; fi

# ─── ۵) حداقل سه بدیل ───
V=$(python3 - "$DB" <<'PYEOF'
import sqlite3, sys, json
con = sqlite3.connect(sys.argv[1])
rows = con.execute("SELECT id, alternativesJson FROM DecisionRecord").fetchall()
bad = []
for rid, alt in rows:
    try:
        arr = json.loads(alt or "[]")
    except Exception:
        arr = []
    if len(arr) < 3:
        bad.append(rid)
con.close()
print(len(bad))
PYEOF
)
if [ "$V" != "0" ]; then echo "  ✗ $V تصمیم با بدیل کمتر از ۳"; FAILS=1; fi

# ─── ۶) هیچ مسیر اجرا در سرویس تصمیم (جستجوی کد) ───
if rg -n "executePlan|runAction|dispatchAction" src/lib/services/decision-service.ts src/lib/services/governance-service.ts >/dev/null 2>&1; then
  echo "  ✗ مسیر اجرای اقدام در سرویس یافت شد — ممنوع مطلق"; FAILS=1
fi

# ─── ۷) تصمیم سرسشدهٔ جاروب‌نشده (هشدار — نه شکست، مگر گذشتهٔ دور) ───
V=$(python3 - "$DB" <<'PYEOF'
import sqlite3, sys, time
con = sqlite3.connect(sys.argv[1])
now = int(time.time() * 1000)
# بیش از ۲ ساعت گذشته و هنوز active = جاروب جامانده
n = con.execute("SELECT COUNT(*) FROM DecisionRecord WHERE status='active' AND expiresAt < ?", (now - 2*3600*1000,)).fetchone()[0]
con.close()
print(n)
PYEOF
)
if [ "$V" != "0" ]; then echo "  ✗ $V تصمیم منقضی جامانده از جاروب (>۲ ساعت)"; FAILS=1; fi

echo "======================================================================="
if [ "$FAILS" != "0" ]; then
  echo "FAIL: گارد ایمنی تصمیم نقض دارد"
  exit 1
fi
echo "PASS: ایمنی چرخهٔ تصمیم برقرار — صفر autoExecute · صفر اجرای سایه · rollback کامل · ≥۳ بدیل"
exit 0
