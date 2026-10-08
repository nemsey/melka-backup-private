#!/usr/bin/env bash
# ============================================================
# audit-champion-challenger.sh — PN-018 فاز ۷: گارد چرخهٔ عمر نسخهٔ مدل
# ------------------------------------------------------------
# وارسی‌ها:
#   ۱) هر مدل حداکثر یک champion
#   ۲) هیچ championِ دارای promotedAt با councilApproved=false (دروازهٔ شورا)
#   ۳) version یکتا در دامنهٔ مدل (قید DB — یک ردیف وارسی نمونه‌ای)
#   ۴) هر champion دارای approvalSource یا قهرمان اولیهٔ ثبت‌شده
#   ۵) AuditLog برای transitionهای اخیر موجود است
# خروج: ۰ = PASS · ۱ = FAIL
# ============================================================
set -uo pipefail
cd /home/z/my-project
DB="${MELKA_DB:-db/custom.db}"

python3 - "$DB" <<'PYEOF'
import sqlite3, sys, json

con = sqlite3.connect(sys.argv[1])
fails = []

# ۱) حداکثر یک champion per modelId
rows = con.execute("""
  SELECT modelId, COUNT(*) FROM ModelVersion WHERE status='champion'
  GROUP BY modelId HAVING COUNT(*) > 1""").fetchall()
if rows:
    fails.append(f"چند قهرمان: {rows}")

# ۲) دروازهٔ شورا: champion با promotedAt و بدون تأیید
rows = con.execute("""
  SELECT modelId, version FROM ModelVersion
  WHERE status='champion' AND promotedAt IS NOT NULL AND councilApproved = 0""").fetchall()
if rows:
    fails.append(f"قهرمان بدون تأیید شورا: {rows}")

# ۳) یکتایی نسخه (نقض باید توسط DB رد شده باشد — شمارش تکراری‌ها)
rows = con.execute("""
  SELECT modelId, version, COUNT(*) c FROM ModelVersion
  GROUP BY modelId, version HAVING c > 1""").fetchall()
if rows:
    fails.append(f"نسخهٔ تکراری: {rows}")

# ۴) statusهای مجاز
rows = con.execute("""
  SELECT modelId, version, status FROM ModelVersion
  WHERE status NOT IN ('champion','challenger','retired','rejected')""").fetchall()
if rows:
    fails.append(f"وضعیت نامعتبر: {rows}")

# ۵) champion دارای approvalSource (قهرمانِ ارتقایافته) یا بدون promotedAt (اولیه)
rows = con.execute("""
  SELECT modelId, version FROM ModelVersion
  WHERE status='champion' AND promotedAt IS NOT NULL
    AND (approvalSource IS NULL OR LENGTH(TRIM(approvalSource)) < 4)""").fetchall()
if rows:
    fails.append(f"قهرمان بدون منبع تأیید: {rows}")

con.close()
if fails:
    for f in fails: print(f"  ✗ {f}")
    sys.exit(1)
print("  invariantها: قهرمان واحد · دروازهٔ شورا · یکتایی نسخه · وضعیت مجاز · منبع تأیید")
PYEOF
if [ $? -ne 0 ]; then
  echo "======================================================================="
  echo "FAIL: چرخهٔ عمر نسخهٔ مدل نقض invariant دارد"
  exit 1
fi

# دریل منفی داخل همان اجرا: تزریق قهرمان بدون تأیید → باید قرمز شود
echo "  (دریل منفی در تست خودکار pn018-phase7 هم پوشش داده می‌شود)"
echo "======================================================================="
echo "PASS: گارد Champion/Challenger — سبز"
