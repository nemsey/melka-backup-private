#!/bin/bash
# PN-020/فاز ۱۱ — گارد دروازهٔ ترمیم (audit-repair-gate.sh)
# ---------------------------------------------------------------------------
# بررسی‌ها:
#   ۱) قفل شورا: اجرا فقط از وضعیت approved + approvalSource الزامی
#   ۲) سقف نرخ: حداکثر ۱ ترمیم در ۲۴ ساعت
#   ۳) هفت نوع کنش معتبر + rollback plan اجباری
#   ۴) روت‌های OWNER-only + آینهٔ v1
#   ۵) دریل منفی: اجرای پیشنهاد بدون تأیید → بلاک (تست واحد)
set -u
cd /home/z/my-project
export DATABASE_URL="${DATABASE_URL:-file:/home/z/my-project/db/test.db}"

FAIL=0
SVC="src/lib/services/self-repair-service.ts"

# ۱) قفل شورا
grep -q 'row.status !== "approved" || !row.approvalSource' "$SVC" && grep -q "REPAIR_BLOCKED" "$SVC" \
  && echo "قفل شورا (approved + approvalSource الزامی + رد AUDIT) ✓" || { echo "✗ قفل شورا"; FAIL=1; }

# ۲) سقف نرخ
grep -q "REPAIR_MAX_PER_DAY = 1" "$SVC" && grep -q "Date.now() - 86_400_000" "$SVC" \
  && echo "سقف نرخ (۱ ترمیم در ۲۴ ساعت) ✓" || { echo "✗ سقف نرخ"; FAIL=1; }

# ۳) هفت کنش + rollback اجباری
grep -q '"prune_sessions",' "$SVC" && grep -q '"restore_backup",' "$SVC" && grep -q '"update_threshold",' "$SVC" \
  && echo "هفت نوع کنش (شامل prune/restore/threshold) ✓" || { echo "✗ انواع کنش"; FAIL=1; }
grep -q "rollbackPlan: rollbackPlanForType" "$SVC" && echo "rollback plan اجباری در ساخت پیشنهاد ✓" || { echo "✗ rollback اجباری"; FAIL=1; }

# ۴) روت‌ها
for f in "src/app/api/admin/repairs/route.ts" "src/app/api/admin/repairs/[id]/route.ts" "src/app/api/v1/admin/repairs/route.ts" "src/app/api/v1/admin/repairs/[id]/route.ts"; do
  [ -f "$f" ] && echo "روت $f ✓" || { echo "✗ روت $f نیست"; FAIL=1; }
done
grep -q 'requireRole(request, "OWNER"' "src/app/api/admin/repairs/[id]/route.ts" && echo "روت اجرا OWNER-only ✓" || { echo "✗ مالک‌محوری روت"; FAIL=1; }

# ۵) دریل منفی (در سوئیت تست: اجرای بدون تأیید → 412 قفل شورا + بلاک AUDIT)
OUT=$(DATABASE_URL="$DATABASE_URL" MELK_TOKEN_KEY=test-only-key-not-a-real-secret MELK_API_TIMEOUT_MS=300 bun test tests/pn020-phase10-11.test.ts 2>&1 | tail -3)
echo "$OUT" | grep -q " 0 fail" && echo "دریل منفی قفل شورا سبز ✓" || { echo "✗ سوئیت قرمز:"; echo "$OUT"; FAIL=1; }

echo "REPAIR-GATE: $([ $FAIL -eq 0 ] && echo PASS || echo FAIL)"
exit $FAIL
