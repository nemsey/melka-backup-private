#!/usr/bin/env bash
# =============================================================================
# اسکریپت ممیزی A-1 و A-2 — بازنگری پنج‌گانه PHASE 0
# -----------------------------------------------------------------------------
# A-1) فهرست کامل فراخوانی db.<model>.<method> در ایجنت‌ها (file:line + متد)
# A-2) بازبینی سراسری نقض UI→Prisma (کامپوننت‌های client که ماژول آلوده به
#      Prisma را با import ارزشی (نه type-only) می‌کشند)
# خروجی: گزارش متنی برای درج در پیوست گزارش PHASE 0
# =============================================================================
set -euo pipefail
ROOT="/home/z/my-project"
AGENTS="$ROOT/src/core/agent"

echo "==================================================================="
echo "A-1) فراخوانی‌های مستقیم Prisma در ایجنت‌ها (src/core/agent/*.ts)"
echo "==================================================================="
total=0
for f in "$AGENTS"/*.ts; do
  name=$(basename "$f")
  # فقط فراخوانی‌های متد واقعی روی شیء db (نه تعریف/کامنت)
  calls=$(grep -nE '\bdb\.[a-zA-Z]+\.[a-zA-Z]+\(' "$f" | sed 's/^ *//' || true)
  count=$(echo "$calls" | grep -c . || true)
  if [ "$count" -gt 0 ]; then
    total=$((total + count))
    echo ""
    echo "--- $name ($count فراخوانی)"
    echo "$calls" | awk -F: '{printf "  L%-4s %s\n", $1, $2}'
  fi
done
echo ""
echo "TOTAL_AGENT_DB_CALLS=$total"

echo ""
echo "==================================================================="
echo "A-2) نقض UI→Prisma — بررسی سراسری"
echo "==================================================================="
echo "(الف) فایل‌های client («use client») با import مستقیم @/lib/db یا @prisma/client:"
viol_direct=$(grep -rl '"use client"' --include="*.tsx" --include="*.ts" "$ROOT/src/components" "$ROOT/src/core/tiles" "$ROOT/src/app" --exclude-dir=api 2>/dev/null | xargs -r grep -l '@/lib/db\|@prisma/client' 2>/dev/null || true)
if [ -z "$viol_direct" ]; then echo "  هیچ."; else echo "$viol_direct"; fi

echo ""
echo "(ب) فایل‌های client با import ارزشی از ماژول‌های lib که خودشان @/lib/db را import می‌کنند:"
# ماژول‌های lib آلوده به db
tainted=$(grep -rl 'from "@/lib/db"' --include="*.ts" "$ROOT/src/lib" 2>/dev/null || true)
for client in $(grep -rl '"use client"' --include="*.tsx" --include="*.ts" "$ROOT/src/components" "$ROOT/src/core/tiles" "$ROOT/src/app" --exclude-dir=api 2>/dev/null); do
  for t in $tainted; do
    tmod=$(echo "$t" | sed 's|.*/src/lib/|@/lib/|; s|\.ts$||')
    # import ارزشی (نه «import type»)
    if grep -nE "^import [^t].*from [\"']${tmod}[\"']" "$client" >/dev/null 2>&1; then
      line=$(grep -nE "^import [^t].*from [\"']${tmod}[\"']" "$client" | head -1 | cut -d: -f1)
      echo "  VIOLATION(runtime): $client:$line → $tmod (این ماژول db را import می‌کند)"
    elif grep -nE "^import type .*from [\"']${tmod}[\"']" "$client" >/dev/null 2>&1; then
      echo "  soft(type-only):   $client → $tmod (فقط type — در باندل نمی‌آید)"
    fi
  done
done

echo ""
echo "(ج) فایل‌های lib مشترک client/server با وابستگی نوعی به @prisma/client:"
grep -rn 'import type .*from "@prisma/client"' --include="*.ts" "$ROOT/src/lib" 2>/dev/null | sed 's|^|  |' || echo "  هیچ."
