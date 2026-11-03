#!/usr/bin/env bash
# ============================================================
# audit-data-sacred.sh — گارد قانون دادهٔ مقدس (PN-038 · فاز ۱ · بند ۱.۶)
# ------------------------------------------------------------
# شورای عالی ملکا (جلسهٔ ۰۶۳): «گارد جدید audit-data-sacred.sh به مجموعه
# اضافه می‌شود تا از این پس هرگونه کد مخرب (deleteMany) در سینک شناسایی
# و مسدود شود.»
#
# وارسی‌ها (۶):
#   ۱) مسیرهای سینک (src/lib/melk-api/) هیچ deleteMany/deleteAll کدی ندارند
#      (مستثناهای مجاز: relay-jobs.ts — صف کارهای گذرا با TTL، داده نیست)
#   ۲) sync-mode فقط incremental برمی‌گرداند (legacy بازنشسته)
#   ۳) sweepFamilyStale حذف ندارد (sacredNoDelete)
#   ۴) clearCrmCacheTables حالت sacred-keep دارد
#   ۵) گارد مقدس (sacred-data-guard.ts) وجود دارد و هر ۳ نقطهٔ جایگزینی DB
#      (restore.sh · recovery-guard.sh · p6549-recovery.sh) آن را صدا می‌زنند
#   ۶) کار بکاپ مقدس ۱۵دقیقه‌ای در Worker ثبت شده
# خروجی: ۰ = همه سبز · ۱ = تخطیف
# ============================================================
set -uo pipefail
cd "$(dirname "$0")/.."
FAIL=0
step() { echo "[data-sacred] $*"; }
fail() { echo "[data-sacred] FAIL: $*"; FAIL=1; }

# ── ۱) صفر deleteMany/deleteAll در مسیرهای سینک ──
while IFS= read -r f; do
  case "$f" in
    *relay-jobs.ts) continue ;; # صف کار گذرا (TTL housekeeping) — داده نیست
  esac
  offenders=$(rg -n "deleteMany\(|deleteAll\(" "$f" 2>/dev/null | rg -v "^\s*[0-9]+:\s*(//|\*|#|/\*)" | rg -v ":[0-9]+:\s*//|:[0-9]+:\s*\*" || true)
  if [[ -n "$offenders" ]]; then
    fail "کد حذف در مسیر سینک: $f"
    echo "$offenders" | head -5
  fi
done < <(ls src/lib/melk-api/*.ts 2>/dev/null)
step "۱) مسیرهای سینک scoured — صفر کد حذف (به‌جز مستثنای relay-jobs)"

# ── ۲) sync-mode فقط incremental ──
if rg -q 'return "incremental";' src/lib/melk-api/sync-mode.ts; then
  step "۲) sync-mode همیشه incremental ✓"
else
  fail "sync-mode.ts مقدار incremental را برنمی‌گرداند"
fi

# ── ۳) sweep بدون حذف ──
if rg -q "sacredNoDelete" src/lib/melk-api/sync.ts && ! rg -q "await family\.deleteByKeys\(" src/lib/melk-api/sync.ts; then
  step "۳) sweepFamilyStale فقط گزارش می‌دهد (sacredNoDelete) ✓"
else
  fail "sweepFamilyStale هنوز deleteByKeys را فراخوانی می‌کند"
fi

# ── ۴) ریست بدون حذف ──
if rg -q 'mode: "sacred-keep"' src/lib/melk-api/sync.ts; then
  step "۴) clearCrmCacheTables حالت sacred-keep ✓"
else
  fail "clearCrmCacheTables حالت sacred-keep ندارد"
fi

# ── ۵) گارد مقدس متصل به نقاط جایگزینی DB ──
[[ -f scripts/recovery/sacred-data-guard.ts ]] || fail "sacred-data-guard.ts وجود ندارد"
for anchor in scripts/recovery-034/restore.sh scripts/pn005c/recovery-guard.sh scripts/p6549-recovery.sh; do
  if rg -q "sacred-data-guard\.ts" "$anchor" 2>/dev/null; then
    step "۵) $anchor ← گارد مقدس متصل ✓"
  else
    fail "$anchor گارد مقدس را صدا نمی‌زند"
  fi
done

# ── ۶) کار بکاپ مقدس در Worker ──
if rg -q "sacred-backup|sacredBackup" src/core/runtime/jobs.ts; then
  step "۶) کار sacred-backup در رجیستری Worker ✓"
else
  fail "کار sacred-backup در jobs.ts ثبت نشده"
fi

if [[ "$FAIL" -eq 0 ]]; then
  echo "[data-sacred] PASS — قانون دادهٔ مقدس برقرار (شورا-ن۰۶۳ / PN-038)"
  exit 0
fi
echo "[data-sacred] FAIL — تخطیف قانون دادهٔ مقدس"
exit 1
