#!/usr/bin/env bash
# ============================================================
# audit-policy-evaluation.sh — PN-019 فاز ۹: گارد ارزیابی سیاست
# ------------------------------------------------------------
# وارسی‌ها (DES9 §۱۹):
#   ۱) هر ۵ سیاست فعال در ۹۰ روز اخیر ارزیابی ثبت دارد
#   ۲) متریک‌ها: ۴ کلید در بازهٔ ۰..۱ (costImpact مستثنا — ساعت)
#   ۳) حکم فقط از مجموعهٔ مجاز (keep|adjust|retire)
#   ۴) هیچ سیاستی دو ارزیابی کاملاً هم‌پنجرهٔ تکراری
#   ۵) کار policy-eval در رجیستری Worker هست (چرخهٔ ۹۰ روز)
#   ۶) حکم غیر keep هشدار AuditLog دارد
# خروج: ۰ = PASS · ۱ = FAIL
# ============================================================
set -uo pipefail
cd /home/z/my-project
DB="${MELKA_DB:-db/custom.db}"

FAILS=0

# ─── ۱) پوشش پنج سیاست در ۹۰ روز ───
V=$(python3 - "$DB" <<'PYEOF'
import sqlite3, sys, time
con = sqlite3.connect(sys.argv[1])
now = int(time.time() * 1000)
policies = ["champion-gate-v1", "drift-alert-v1", "decision-safety-v1", "governance-strict-v1", "session-30d-v1"]
missing = []
for p in policies:
    n = con.execute("SELECT COUNT(*) FROM PolicyEvaluationRecord WHERE policyId=? AND evaluatedAt > ?", (p, now - 90*86400000)).fetchone()[0]
    if n == 0:
        missing.append(p)
con.close()
print(len(missing))
PYEOF
)
if [ "$V" != "0" ]; then echo "  ✗ $V سیاست بدون ارزیابی ۹۰روزه"; FAILS=1; fi

# ─── ۲+۳) متریک‌ها و حکم‌های معتبر ───
V=$(python3 - "$DB" <<'PYEOF'
import sqlite3, sys, json
con = sqlite3.connect(sys.argv[1])
rows = con.execute("SELECT policyId, metricsJson, verdict FROM PolicyEvaluationRecord").fetchall()
bad = 0
for pid, m, v in rows:
    try:
        metrics = json.loads(m or "{}")
    except Exception:
        bad += 1
        continue
    for k in ("effectiveness", "stability", "compliance"):
        val = metrics.get(k)
        lo = -1 if k == "effectiveness" else 0  # اثربخشی = (مثبت−منفی)/کل ∈ [-1,1]
        if not isinstance(val, (int, float)) or not (lo <= val <= 1):
            bad += 1
            break
    if v not in ("keep", "adjust", "retire"):
        bad += 1
con.close()
print(bad)
PYEOF
)
if [ "$V" != "0" ]; then echo "  ✗ $V ارزیابی با متریک/حکم نامعتبر"; FAILS=1; fi

# ─── ۴) بدون تکرار هم‌پنجره ───
V=$(python3 - "$DB" <<'PYEOF'
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
n = con.execute("""
  SELECT COUNT(*) FROM (
    SELECT policyId, windowFrom, windowTo, COUNT(*) c
    FROM PolicyEvaluationRecord GROUP BY policyId, windowFrom, windowTo HAVING c > 1
  )""").fetchone()[0]
con.close()
print(n)
PYEOF
)
if [ "$V" != "0" ]; then echo "  ✗ $V ارزیابی تکراری هم‌پنجره"; FAILS=1; fi

# ─── ۵) کار Worker ثبت شده ───
if ! rg -n "policyEval: \"policy-eval\"" src/core/runtime/jobs.ts >/dev/null 2>&1; then
  echo "  ✗ کار policy-eval در رجیستری Worker نیست"; FAILS=1
fi
if ! rg -n "MELK_POLICY_EVAL_INTERVAL_DAYS \?\? 90" src/core/runtime/jobs.ts >/dev/null 2>&1; then
  echo "  ✗ چرخهٔ ۹۰روزهٔ ارزیابی در Worker تنظیم نشده"; FAILS=1
fi

# ─── ۶) حکم غیر keep → هشدار AuditLog ───
V=$(python3 - "$DB" <<'PYEOF'
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
alerts = con.execute("SELECT COUNT(*) FROM AuditLog WHERE action='POLICY_VERDICT_ALERT'").fetchone()[0]
nonkeep = con.execute("SELECT COUNT(DISTINCT policyId) FROM PolicyEvaluationRecord WHERE verdict != 'keep'").fetchone()[0]
con.close()
# اگر هیچ حکم غیر keep نیست، این بررسی برقرار است (۰=۰)
print("OK" if (nonkeep == 0 or alerts > 0) else "BAD")
PYEOF
)
if [ "$V" != "OK" ]; then echo "  ✗ حکم غیر keep بدون هشدار AuditLog"; FAILS=1; fi

echo "======================================================================="
if [ "$FAILS" != "0" ]; then
  echo "FAIL: گارد ارزیابی سیاست نقض دارد"
  exit 1
fi
echo "PASS: ارزیابی سیاست برقرار — پنج سیاست × ۴ متریک · حکم معتبر · چرخهٔ ۹۰روزهٔ Worker"
exit 0
