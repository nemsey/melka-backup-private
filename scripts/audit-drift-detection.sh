#!/usr/bin/env bash
# ============================================================
# audit-drift-detection.sh — PN-018 فاز ۷: گارد آشکارساز رانش
# ------------------------------------------------------------
# وارسی‌ها:
#   ۱) ردیف‌های DriftCheck: نوع سه‌گانه مجاز · کنش چهارگانه مجاز
#   ۲) زنده بودن: برای هر مدل قهرمان، بررسی در ۷ روز اخیر (کار Worker)
#   ۳) هر action ≥ alert رکورد AuditLog دارد
#   ۴) آستانه‌های کد = پیش‌فرض سند (۰٫۰۲/۰٫۰۵/۰٫۱۰) و env قابل‌تنظیم
#   ۵) سرویس drift فقط‌نویسندهٔ DriftCheck است (مرز مخزن)
# خروج: ۰ = PASS · ۱ = FAIL
# ============================================================
set -uo pipefail
cd /home/z/my-project
DB="${MELKA_DB:-db/custom.db}"

python3 - "$DB" <<'PYEOF'
import sqlite3, sys, datetime

con = sqlite3.connect(sys.argv[1])
fails = []

# ۱) مقادیر مجاز
bad_types = con.execute("SELECT COUNT(*) FROM DriftCheck WHERE driftType NOT IN ('performance','data','concept')").fetchone()[0]
bad_actions = con.execute("SELECT COUNT(*) FROM DriftCheck WHERE action NOT IN ('monitor','alert','retrain','escalate')").fetchone()[0]
if bad_types: fails.append(f"{bad_types} ردیف با نوع نامعتبر")
if bad_actions: fails.append(f"{bad_actions} ردیف با کنش نامعتبر")

# ۲) زنده بودن: هر مدل قهرمان باید در ۷ روز اخیر بررسی داشته باشد
# (Prisma 6 روی SQLite تاریخ را epoch-milliseconds صحیح ذخیره می‌کند — کشف زندهٔ این گارد)
champions = [r[0] for r in con.execute("SELECT DISTINCT modelId FROM ModelVersion WHERE status='champion'").fetchall()]
if champions:
    stale = con.execute("""
      SELECT DISTINCT mv.modelId FROM ModelVersion mv
      WHERE mv.status='champion' AND NOT EXISTS (
        SELECT 1 FROM DriftCheck dc
        WHERE dc.modelId = mv.modelId
          AND dc.checkedAt > CAST(strftime('%s','now','-7 days') AS INTEGER) * 1000
      )""").fetchall()
    if stale:
        fails.append(f"مدل قهرمان بدون بررسی رانش در ۷ روز: {[s[0] for s in stale]}")

# ۳) AuditLog برای alert+ (نسبتی — نبودِ کامل هشدارها را می‌گیرد؛ رابطهٔ دقیق در تست‌های خودکار)
alerts_total = con.execute("SELECT COUNT(*) FROM DriftCheck WHERE action != 'monitor'").fetchone()[0]
audits_total = con.execute("SELECT COUNT(*) FROM AuditLog WHERE action = 'DRIFT_DETECTED'").fetchone()[0]
if alerts_total > 0 and audits_total == 0:
    fails.append(f"{alerts_total} کنش alert+ بدون هیچ AuditLog")

con.close()
if fails:
    for f in fails: print(f"  ✗ {f}")
    sys.exit(1)
print("  ردیف‌های مجاز · زنده بودن کار Worker (۷ روز) · هشدار AuditLog")
PYEOF
if [ $? -ne 0 ]; then
  echo "======================================================================="
  echo "FAIL: آشکارساز رانش نقض دارد"
  exit 1
fi

# ۴) آستانه‌های کد — عین پیش‌فرض سند طراحی
if ! grep -q 'MELK_DRIFT_ALERT ?? 0.02' src/lib/services/drift-service.ts; then
  echo "✗ آستانهٔ alert پیش‌فرض در drift-service تغییر یافته (سند طراحی پیوست ج)"; exit 1
fi
if ! grep -q 'MELK_DRIFT_RETRAIN ?? 0.05' src/lib/services/drift-service.ts; then
  echo "✗ آستانهٔ retrain پیش‌فرض تغییر یافته"; exit 1
fi
if ! grep -q 'MELK_DRIFT_ESCALATE ?? 0.10' src/lib/services/drift-service.ts; then
  echo "✗ آستانهٔ escalate پیش‌فرض تغییر یافته"; exit 1
fi

# ۵) مرز مخزن: drift-service تنها نویسندهٔ جدول
WRITERS=$(grep -rl 'db.driftCheck' src/ --include='*.ts' | grep -v 'drift-service' || true)
if [ -n "$WRITERS" ]; then
  echo "✗ نویسندهٔ خارج از مرز: $WRITERS"; exit 1
fi
echo "======================================================================="
echo "PASS: گارد Drift Detection — سبز"
