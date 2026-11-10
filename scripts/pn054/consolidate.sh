#!/usr/bin/env bash
# ============================================================================
# consolidate.sh — پاکسازی و ادغام اسکریپت‌ها (PN-054 · دستور ۲)
# ----------------------------------------------------------------------------
# ورودی: upload/.runtime/pn054-unreferenced.txt (بستار v2 — خارج ارجاع)
# منطق:
#   • KEEP = ابزارهای عملیاتی دستی (ثبت در CLI-REGISTRY.md) — هرگز حذف نمی‌شوند
#   • بقیه = اسکریپت‌های جلسه‌ای/شاهد/یشین‌شده → حذف (تاریخچهٔ گیت حفظشان می‌کند)
#   • پوشه‌های خالی + پوشه‌های صرفاً مستنداتی جلسه‌ای پاک می‌شوند
# ============================================================================
set -uo pipefail
cd /home/z/my-project

UNREF="upload/.runtime/pn054-unreferenced.txt"
[ -f "$UNREF" ] || { echo "اول closure.sh را اجرا کن"; exit 1; }

# ─── ابزارهای عملیاتی دستی — ریشهٔ زندهٔ جدید (CLI-REGISTRY.md) ───
KEEP=(
  # ممیزی‌های دستی
  scripts/audit-data-sacred.sh
  scripts/audit-db-fortress.sh
  scripts/audit-resurrect-ultimate.sh
  scripts/audit-mobile-relay.sh
  scripts/audit-melka-relay-apk.sh
  scripts/audit-relay-matrix.sh
  scripts/audit-reproducibility.sh
  scripts/audit-roles.sh
  scripts/audit-feature-visibility.sh
  scripts/audit-graph-integrity.sh
  scripts/audit-job-state.sh
  scripts/audit-opportunity-alerts.sh
  scripts/audit-phase0-revision.sh
  scripts/audit-pin-check.sh
  scripts/audit-scope-usage.ts
  scripts/audit-smart-update.sh
  # ابزارهای عملیاتی ریشه
  scripts/melka-debug.ts
  scripts/fetch.sh
  scripts/check-db-counts.ts
  scripts/dev-secrets.ts
  scripts/park-deliver.sh
  scripts/refresh-sync-tar.sh
  scripts/regression-guard.sh
  scripts/resilient-test-runner.sh
  scripts/rotate-encryption-key.ts
  scripts/snapshot-db.ts
  scripts/verify-deploy-freshness.sh
  scripts/verify-preview-version.sh
  # کاوشگرهای مالک (PN-072)
  scripts/pn072-counts-probe.sh
  scripts/pn072-excel-probe.sh
  scripts/pn072-public-verify.sh
  # ابزارهای DB و عملیات
  scripts/pn041/vacuum-copy.ts
  scripts/pn041/db-probe.ts
  scripts/pn078/drop-cache.sh
  scripts/pn053/audit-deadcode.py
  scripts/pn048/sacred-integrity.sh
  scripts/mirror/build-snapshot.sh
  # مولد پالت (ارجاع در globals.css/TileCard به‌عنوان مولد مرجع)
  scripts/p6530/gen-palette.py
)

# ─── حذف فایل‌های کد جلسه‌ای ───
DELETED=0
while IFS= read -r f; do
  [ -f "$f" ] || continue
  keep=no
  for k in "${KEEP[@]}"; do [ "$f" = "$k" ] && keep=yes && break; done
  if [ "$keep" = "yes" ]; then continue; fi
  git rm -q --cached "$f" 2>/dev/null || true
  rm -f "$f"
  DELETED=$((DELETED+1))
done < "$UNREF"

echo "─── فایل کد حذف‌شده: $DELETED"

# ─── پاکسازی پوشه‌های صرفاً مستنداتی/جلسه‌ای ───
rm -rf scripts/p6550-skeleton   # اسکلت مستندات جلسهٔ ۵۵۰ (تاریخچه در گیت)
rm -f  scripts/p6530-baseline.json scripts/p6530/palette.css scripts/p6530/tailwind-snippet.ts
rm -f  scripts/p6549/palette13.ts scripts/p6530/colors.json.tmp

# شواهد غیرکدِ پوشه‌های جلسه‌ای (html/json/buildlog/txt یتیم)
find scripts -type f \( -name "*.html" -o -name "*.buildlog" \) -delete 2>/dev/null || true

# ─── پوشه‌های خالی ───
find scripts -mindepth 1 -type d -empty -delete 2>/dev/null || true

# ─── گزارش ───
TOTAL=$(find scripts -type f \( -name "*.sh" -o -name "*.ts" -o -name "*.py" -o -name "*.js" -o -name "*.cjs" -o -name "*.mjs" \) | wc -l)
echo "─── تعداد فایل‌های کد باقی‌مانده در scripts/: $TOTAL (هدف: زیر ۱۵۰)"
[ "$TOTAL" -lt 150 ] && echo "✅ معیار پذیرش دستور ۲ برآورده شد" || echo "❌ هنوز بالای ۱۵۰"
