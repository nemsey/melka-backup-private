#!/usr/bin/env bash
# =============================================================================
# audit-repository-boundary.sh — گارد مرز Repository (PHASE 2)
# =============================================================================
# وظایف:
#   ۱) شمارش فراخوانی مستقیم db.<model>.* در ایجنت‌ها (baseline: 47 → هدف: 0)
#   ۲) شمارش فراخوانی مستقیم db.<model>.* در روت‌های API (baseline: 69 → هدف: 0)
#      (ممیزی PHASE 0 ~۲۰ تخمین زده بود؛ شمارش واقعی ۶۹ است — گزارش صادقانه)
#   ۳) شمارش db.$transaction در ایجنت‌ها (baseline: 2 در base-agent → هدف: 0)
#   ۴) گزارش فایل‌های ایجنت که @prisma/client یا @/lib/db import می‌کنند
#
# حالت‌ها:
#   بدون آرگومان  → فقط گزارش (برای P2-00/P2-01 و پایش پیشرفت)
#   --strict      → اجرای حاکم: شکست اگر ایجنت/روت db.* داشته باشد،
#                   ایجنت Prisma/db import کند، یا interfaces/ ناخالص باشد
#   --strict-agents → حاکم فقط روی ایجنت‌ها (پس از P2-02، قبل از P2-03)
# =============================================================================
set -uo pipefail
cd "$(dirname "$0")/.."

MODE="${1:-}"

# ---------- شمارش فراخوانی‌های مدل (db.<model>...) ----------
AGENT_COUNT=$(grep -rnoE 'db\.[a-zA-Z]+' src/core/agent/ --include='*.ts' 2>/dev/null | wc -l | tr -d ' ')
ROUTE_COUNT=$(grep -rnoE 'db\.[a-zA-Z]+' src/app/api/ --include='*.ts' 2>/dev/null | wc -l | tr -d ' ')
AGENT_TX_COUNT=$(grep -rnoE 'db\.\$transaction' src/core/agent/ --include='*.ts' 2>/dev/null | wc -l | tr -d ' ')

# ---------- importهای ممنوع ----------
AGENT_PRISMA_FILES=$(grep -rlE "from ['\"]@prisma/client['\"]" src/core/agent/ --include='*.ts' 2>/dev/null || true)
AGENT_PRISMA_IMPORTS=$(echo -n "$AGENT_PRISMA_FILES" | grep -c . || true)
AGENT_DB_FILES=$(grep -rlE "from ['\"]@/lib/db['\"]" src/core/agent/ --include='*.ts' 2>/dev/null || true)
AGENT_DB_IMPORTS=$(echo -n "$AGENT_DB_FILES" | grep -c . || true)
IFACE_PRISMA=$(grep -rlE "from ['\"]@prisma/client['\"]" src/core/repositories/interfaces/ --include='*.ts' 2>/dev/null | grep -c . || true)
IFACE_DB=$(grep -rlE "from ['\"]@/lib/db['\"]" src/core/repositories/interfaces/ --include='*.ts' 2>/dev/null | grep -c . || true)

echo "================ REPOSITORY BOUNDARY AUDIT ================"
printf "%-52s %s\n" "db.<model>.* call sites in agents (src/core/agent):" "$AGENT_COUNT  (baseline 47)"
printf "%-52s %s\n" "db.<model>.* call sites in routes (src/app/api):"    "$ROUTE_COUNT  (baseline 69)"
printf "%-52s %s\n" "db.\$transaction in agents:"                          "$AGENT_TX_COUNT  (baseline 2)"
printf "%-52s %s\n" "agent files importing @prisma/client:"                "$AGENT_PRISMA_IMPORTS"
printf "%-52s %s\n" "agent files importing @/lib/db:"                      "$AGENT_DB_IMPORTS"
printf "%-52s %s\n" "interfaces/ files importing @prisma/client:"          "$IFACE_PRISMA"
printf "%-52s %s\n" "interfaces/ files importing @/lib/db:"                "$IFACE_DB"
echo "==========================================================="

FAIL=0
if [ "$MODE" = "--strict" ] || [ "$MODE" = "--strict-agents" ]; then
  if [ "$AGENT_COUNT" -gt 0 ] || [ "$AGENT_TX_COUNT" -gt 0 ]; then
    echo "FAIL: ایجنت‌ها هنوز $((AGENT_COUNT + AGENT_TX_COUNT)) فراخوانی مستقیم db.* دارند (هدف: 0)."
    FAIL=1
  fi
  if [ "$AGENT_PRISMA_IMPORTS" -gt 0 ]; then
    echo "FAIL: این فایل‌های ایجنت @prisma/client import می‌کنند:"
    echo "$AGENT_PRISMA_FILES"
    FAIL=1
  fi
  if [ "$AGENT_DB_IMPORTS" -gt 0 ]; then
    echo "FAIL: این فایل‌های ایجنت @/lib/db import می‌کنند:"
    echo "$AGENT_DB_FILES"
    FAIL=1
  fi
  if [ "$IFACE_PRISMA" -gt 0 ] || [ "$IFACE_DB" -gt 0 ]; then
    echo "FAIL: لایه interfaces/ باید خالص باشد (بدون Prisma/db)."
    FAIL=1
  fi
fi
if [ "$MODE" = "--strict" ]; then
  if [ "$ROUTE_COUNT" -gt 0 ]; then
    echo "FAIL: روت‌ها هنوز $ROUTE_COUNT فراخوانی مستقیم db.* دارند (هدف: 0)."
    FAIL=1
  fi
fi

if [ "$FAIL" -eq 0 ]; then
  if [ "$MODE" = "--strict" ] || [ "$MODE" = "--strict-agents" ]; then
    echo "PASS: مرز Repository در حالت $MODE رعایت شد."
  else
    echo "REPORT-ONLY: برای حاکمیت کامل از --strict استفاده کنید."
  fi
fi
exit $FAIL
