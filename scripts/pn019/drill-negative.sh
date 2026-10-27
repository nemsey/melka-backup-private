#!/usr/bin/env bash
# ============================================================
# drill-negative.sh — PN-019: دریل منفی سه گارد تازه
# کاشت نقض عمدی → گارد باید قرمز شود → پاکسازی → گارد دوباره سبز
# خروج: ۰ = هر سه دریل موفق · ۱ = شکست دریل
# ============================================================
set -uo pipefail
cd /home/z/my-project
DB="${MELKA_DB:-db/custom.db}"

echo "═══ دریل ۱: نقض autoExecute در DecisionRecord ═══"
python3 - "$DB" <<'PYEOF'
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
con.execute("""INSERT INTO DecisionRecord (id, predictionId, decisionType, proposedAction, confidence, rationale, expectedImpact, alternativesJson, requiredResourcesJson, safetyReportJson, status, expiresAt, createdAt, tierAtCreation, requiresApproval, autoExecute)
VALUES ('drill-neg-1', 'drill-pred', 'wait', 'دریل منفی', 0.5, 'دریل', '{}', '[]', '[]', '{}', 'active', strftime('%Y-%m-%dT%H:%M:%fZ','now','+7 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), 0, 1, 1)""")
con.commit(); con.close()
print("  کاشته شد: autoExecute=1")
PYEOF
bash scripts/audit-decision-safety.sh >/tmp/pn019-drill1.log 2>&1
if [ $? -eq 0 ]; then echo "  ✗ دریل ۱ شکست — گارد نقض را ندید"; DRILL_FAIL=1; else echo "  ✓ گارد قرمز شد (انتظار برقرار)"; fi
python3 - "$DB" <<'PYEOF'
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
con.execute("DELETE FROM DecisionRecord WHERE id='drill-neg-1'")
con.commit(); con.close()
print("  پاکسازی شد")
PYEOF
bash scripts/audit-decision-safety.sh >/dev/null 2>&1 && echo "  ✓ گارد دوباره سبز" || { echo "  ✗ پاکسازی ناموفق"; DRILL_FAIL=1; }

echo "═══ دریل ۲: بررسی حاکمیت ۱۴نتیجه‌ای (کمتر از ۱۵) ═══"
python3 - "$DB" <<'PYEOF'
import sqlite3, sys, json, time
con = sqlite3.connect(sys.argv[1])
con.execute("""INSERT INTO GovernanceCheckRecord (id, passed, failed, criticalViolationsJson, resultsJson, contextJson, enforcement, triggerSource, checkedAt)
VALUES ('drill-neg-2', 14, 1, '[]', ?, '{}', 'strict', 'manual', strftime('%Y-%m-%dT%H:%M:%fZ','now'))""", (json.dumps([{"ruleId": f"GOV-X-{i}", "passed": True, "severity": "high", "details": "دریل"} for i in range(14)]),))
con.commit(); con.close()
print("  کاشته شد: بررسی با ۱۴ نتیجه")
PYEOF
bash scripts/audit-governance.sh >/tmp/pn019-drill2.log 2>&1
if [ $? -eq 0 ]; then echo "  ✗ دریل ۲ شکست — گارد نقض را ندید"; DRILL_FAIL=1; else echo "  ✓ گارد قرمز شد (انتظار برقرار)"; fi
python3 - "$DB" <<'PYEOF'
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
con.execute("DELETE FROM GovernanceCheckRecord WHERE id='drill-neg-2'")
con.commit(); con.close()
print("  پاکسازی شد")
PYEOF
bash scripts/audit-governance.sh >/dev/null 2>&1 && echo "  ✓ گارد دوباره سبز" || { echo "  ✗ پاکسازی ناموفق"; DRILL_FAIL=1; }

echo "═══ دریل ۳: ارزیابی با حکم نامعتبر ═══"
python3 - "$DB" <<'PYEOF'
import sqlite3, sys, json, time
con = sqlite3.connect(sys.argv[1])
con.execute("""INSERT INTO PolicyEvaluationRecord (id, policyId, policyType, windowFrom, windowTo, metricsJson, verdict, rationale, evidenceJson, tierAtEvaluation, evaluatedAt)
VALUES ('drill-neg-3', 'champion-gate-v1', 'learning', strftime('%Y-%m-%dT%H:%M:%fZ','now','-90 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), ?, 'destroy', 'دریل منفی', '{}', 3, strftime('%Y-%m-%dT%H:%M:%fZ','now'))""", (json.dumps({"effectiveness": 1.5, "stability": 1, "compliance": 1, "costImpact": 0}),))
con.commit(); con.close()
print("  کاشته شد: حکم نامعتبر + اثربخشی ۱٫۵ (خارج بازه)")
PYEOF
bash scripts/audit-policy-evaluation.sh >/tmp/pn019-drill3.log 2>&1
if [ $? -eq 0 ]; then echo "  ✗ دریل ۳ شکست — گارد نقض را ندید"; DRILL_FAIL=1; else echo "  ✓ گارد قرمز شد (انتظار برقرار)"; fi
python3 - "$DB" <<'PYEOF'
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
con.execute("DELETE FROM PolicyEvaluationRecord WHERE id='drill-neg-3'")
con.commit(); con.close()
print("  پاکسازی شد")
PYEOF
bash scripts/audit-policy-evaluation.sh >/dev/null 2>&1 && echo "  ✓ گارد دوباره سبز" || { echo "  ✗ پاکسازی ناموفق"; DRILL_FAIL=1; }

echo "═══ دریل ۴: اجرای سایه با executedSteps≠0 ═══"
python3 - "$DB" <<'PYEOF'
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
con.execute("""INSERT INTO ShadowDecisionRun (id, sourcePredictionId, decisionId, executedSteps, verdict, ranAt)
VALUES ('drill-neg-4', 'drill-pred', 'drill-dec', 3, 'recorded', strftime('%Y-%m-%dT%H:%M:%fZ','now'))""")
con.commit(); con.close()
print("  کاشته شد: executedSteps=3 (نقض مطلق صفر-اجرا)")
PYEOF
bash scripts/audit-decision-safety.sh >/tmp/pn019-drill4.log 2>&1
if [ $? -eq 0 ]; then echo "  ✗ دریل ۴ شکست — گارد نقض را ندید"; DRILL_FAIL=1; else echo "  ✓ گارد قرمز شد (انتظار برقرار)"; fi
python3 - "$DB" <<'PYEOF'
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
con.execute("DELETE FROM ShadowDecisionRun WHERE id='drill-neg-4'")
con.commit(); con.close()
print("  پاکسازی شد")
PYEOF
bash scripts/audit-decision-safety.sh >/dev/null 2>&1 && echo "  ✓ گارد دوباره سبز" || { echo "  ✗ پاکسازی ناموفق"; DRILL_FAIL=1; }

echo "═══ جمع‌بندی دریل ═══"
if [ "${DRILL_FAIL:-0}" != "0" ]; then
  echo "FAIL: دریل منفی شکست خورد"
  exit 1
fi
echo "PASS: هر چهار دریل منفی موفق — گاردها نقض را می‌بینند و پس از پاکسازی سبز می‌شوند"
exit 0
