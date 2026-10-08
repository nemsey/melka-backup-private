#!/bin/bash
# PN-020/فاز ۱۰ — گارد خودآگاهی (audit-self-diagnosis.sh)
# ---------------------------------------------------------------------------
# بررسی‌ها:
#   ۱) سرویس ۲۵ بررسی دارد (۵ دسته: داده ۷ · مدل ۶ · موتور ۵ · امنیت ۴ · حاکمیت ۳)
#   ۲) نمرهٔ سلامت موزون (وزن دسته‌ها ۳۰/۲۵/۲۰/۱۵/۱۰) + آستانه‌های تفسیر
#   ۳) کار Worker چهاردهم diagnosis-cycle با چرخهٔ ۶ ساعته
#   ۴) روت‌های OWNER + آینهٔ v1
#   ۵) دریل منفی: بررسی بحرانی شکست‌خورده → هشدار critical
set -u
cd /home/z/my-project
export DATABASE_URL="${DATABASE_URL:-file:/home/z/my-project/db/test.db}"

FAIL=0
SVC="src/lib/services/self-diagnosis-service.ts"

# ۱) شمارش شناسه‌های بررسی در سرویس
N=$(grep -oE '"DIAG-[A-Z]+-[0-9]+"' "$SVC" | sort -u | wc -l)
[ "$N" -eq 25 ] && echo "بررسی‌ها: $N/۲۵ ✓" || { echo "✗ بررسی‌ها: $N/۲۵ (انتظار دقیقاً ۲۵)"; FAIL=1; }
for cat in DATA:7 MODEL:6 ENGINE:5 SEC:4 GOV:3; do
  prefix="${cat%%:*}"; want="${cat##*:}"
  got=$(grep -oE "\"DIAG-$prefix-[0-9]+\"" "$SVC" | sort -u | wc -l)
  [ "$got" -eq "$want" ] && echo "  دستهٔ $prefix: $got/$want ✓" || { echo "  ✗ دستهٔ $prefix: $got/$want"; FAIL=1; }
done

# ۲) وزن‌ها + آستانه‌ها
grep -q "data: 30," "$SVC" && grep -q "model: 25," "$SVC" && grep -q "engine: 20," "$SVC" && grep -q "security: 15," "$SVC" && grep -q "governance: 10," "$SVC" \
  && echo "وزن دسته‌ها (۳۰/۲۵/۲۰/۱۵/۱۰) ✓" || { echo "✗ وزن دسته‌ها"; FAIL=1; }
grep -q "healthScore < 50" "$SVC" && echo "آستانهٔ قرمز نمره (< ۵۰ → INFRA_ALERT) ✓" || { echo "✗ آستانهٔ قرمز"; FAIL=1; }

# ۳) کار Worker
grep -q 'diagnosisCycle: "diagnosis-cycle"' src/core/runtime/jobs.ts && grep -q "MELK_DIAGNOSIS_INTERVAL_H ?? 6" src/core/runtime/jobs.ts \
  && echo "کار Worker چهاردهم diagnosis-cycle (۶ ساعت) ✓" || { echo "✗ کار Worker"; FAIL=1; }

# ۴) روت‌ها + آینه
for f in src/app/api/admin/diagnosis/route.ts src/app/api/v1/admin/diagnosis/route.ts; do
  [ -f "$f" ] && echo "روت $f ✓" || { echo "✗ روت $f نیست"; FAIL=1; }
done

# ۵) دریل منفی + سلامت اجرا (تست واحد — کل چرخه روی DB تست)
OUT=$(DATABASE_URL="$DATABASE_URL" MELK_TOKEN_KEY=test-only-key-not-a-real-secret MELK_API_TIMEOUT_MS=300 bun test tests/pn020-phase10-11.test.ts 2>&1 | tail -3)
echo "$OUT" | grep -q " 0 fail" && echo "سوئیت فاز ۱۰+۱۱ سبز ✓" || { echo "✗ سوئیت فاز ۱۰+۱۱ قرمز:"; echo "$OUT"; FAIL=1; }

echo "SELF-DIAGNOSIS: $([ $FAIL -eq 0 ] && echo PASS || echo FAIL)"
exit $FAIL
