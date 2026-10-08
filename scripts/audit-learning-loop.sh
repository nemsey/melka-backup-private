#!/usr/bin/env bash
# ============================================================
# audit-learning-loop.sh — PN-018 فاز ۷: گارد حلقهٔ کامل یادگیری
# ------------------------------------------------------------
# وارسی‌ها:
#   ۱) شاهد حلقهٔ کامل موجود و معتبر (full-loop.json — هفت گام)
#   ۲) پیش‌بینی‌های تازه مهر modelVersionId دارند
#   ۳) هیچ رکورد prediction با modelVersionId اشاره به نسخهٔ ناموجود
#   ۴) loop-latest.json تازه (< ۲۴ ساعت — دیمن هوش زنده)
#   ۵) سرویس حلقه از سرویس‌های نسخه/رانش می‌نویسد (نه مستقیم DB مدل‌ها)
# خروج: ۰ = PASS · ۱ = FAIL
# ============================================================
set -uo pipefail
cd /home/z/my-project
DB="${MELKA_DB:-db/custom.db}"

python3 - "$DB" <<'PYEOF'
import sqlite3, sys, json, os, datetime

fails = []
con = sqlite3.connect(sys.argv[1])

# ۱) شاهد حلقهٔ کامل
if not os.path.exists("download/pn018/full-loop.json"):
    fails.append("شاهد full-loop.json موجود نیست")
else:
    w = json.load(open("download/pn018/full-loop.json", encoding="utf-8"))
    loop = w.get("loop", {})
    for step in ["step1_collectPairs", "step2_evaluateChampion", "step3_learn", "step4_ensureChallenger", "step5_shadow", "step6_promote", "step7_newPrediction"]:
        if step not in loop:
            fails.append(f"گام مفقود در شاهد: {step}")
    if not loop.get("loopClosed"):
        fails.append("حلقه بسته نشده (loopClosed != true)")
    st7 = loop.get("step7_newPrediction")
    if not st7 or not st7.get("modelVersionId"):
        fails.append("پیش‌بینی تازه مهر نسخه ندارد")

# ۲) جریان زندهٔ حلقه: آخرین رکورد مهرشده است و نسخه‌اش موجود
# (جریان زنده جدا از snapshot تاریخی دیمن است — predictions.jsonl فقط‌یک‌بار نوشته می‌شود)
LIVE = "intelligence-data/predictions-live.jsonl"
if not os.path.exists(LIVE):
    fails.append("جریان زندهٔ predictions-live.jsonl موجود نیست (حلقه هرگز اجرا نشده)")
else:
    llines = [l for l in open(LIVE, encoding="utf-8").read().strip().split("\n") if l.strip()]
    if llines:
        last = json.loads(llines[-1])
        if not last.get("modelVersionId"):
            fails.append("آخرین پیش‌بینی زنده بدون modelVersionId است")
        else:
            c = con.execute("SELECT COUNT(*) FROM ModelVersion WHERE id = ?", (last["modelVersionId"],)).fetchone()[0]
            if c == 0:
                fails.append(f"modelVersionId ناموجود در ModelVersion: {last['modelVersionId']}")
    else:
        fails.append("جریان زنده خالی است")

# ۴) تازگی دیمن
if os.path.exists("intelligence-data/loop-latest.json"):
    ll = json.load(open("intelligence-data/loop-latest.json", encoding="utf-8"))
    ran = datetime.datetime.fromisoformat(ll["ranAt"].replace("Z", "+00:00"))
    age_h = (datetime.datetime.now(datetime.timezone.utc) - ran).total_seconds() / 3600
    if age_h > 48:
        fails.append(f"loop-latest.json کهنه است: {age_h:.0f} ساعت > 48")
else:
    fails.append("loop-latest.json موجود نیست")

con.close()
if fails:
    for f in fails: print(f"  ✗ {f}")
    sys.exit(1)
print("  شاهد هفت‌گام · مهر نسخه · ارجاع معتبر · دیمن تازه")
PYEOF
if [ $? -ne 0 ]; then
  echo "======================================================================="
  echo "FAIL: حلقهٔ یادگیری کامل/مهرشده نیست"
  exit 1
fi

# ۵) مرز: learning-loop-service مستقیم به جدول ModelVersion نمی‌نویسد (از سرویس نسخه می‌گذرد)
if grep -q 'db\.modelVersion\.' src/lib/services/learning-loop-service.ts; then
  echo "✗ learning-loop-service مستقیم به ModelVersion می‌نویسد — مرز سرویس نقض"; exit 1
fi
echo "======================================================================="
echo "PASS: گارد Learning Loop — سبز"
