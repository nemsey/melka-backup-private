#!/bin/bash
# Guard: tenant isolation — PN-044/فاز ۵ (شورا-ن۰۸۸)
# ---------------------------------------------------------------------------
# چک: query های db.{propertyRecord|requestRecord|transactionRecord|expertRecord}
# در API routes بدون tenantId در همان statement → هشدار (نه خطا — پیشرفت تدریجی،
# طبق دستور). گارد به‌تدریج strict می‌شود وقتی همهٔ مسیرها tenant-filtered شوند.
set -uo pipefail
cd "$(dirname "$0")/.."

LEAKS=$(grep -rn "db\.propertyRecord\.\|db\.requestRecord\.\|db\.transactionRecord\.\|db\.expertRecord\." src/app/api/ 2>/dev/null | grep -v "tenantId" | grep -v ".test." | head -10)

if [ -n "$LEAKS" ]; then
  echo "⚠️ API queries without tenantId (advisory — gradual progress):"
  echo "$LEAKS"
else
  echo "✅ all direct tenant-table queries in src/app/api carry tenantId"
fi

# چک اضافی: لایهٔ DB (repo/profile-store) فقط باید مقدار واقعی 'melk-tabriz' ببیند —
# نه کلید UI 'tabriz' (نگاشت فقط در tenantDbValue — منبع یگانه).
BAD_TENANT=$(grep -rn "tenantId.*['\"]tabriz['\"]" src/core/repositories/ src/lib/experts/profile-store.ts src/lib/integrations/ 2>/dev/null | grep -v "melk-tabriz" | grep -v "melketun" | head -5)
if [ -n "$BAD_TENANT" ]; then
  echo "⚠️ DB layer uses raw 'tabriz' tenant value (must be 'melk-tabriz' via tenantDbValue):"
  echo "$BAD_TENANT"
fi

echo "✅ tenant isolation check complete"
