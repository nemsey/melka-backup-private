#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PN-059 فاز ۳: کامپوننت‌های مشترک + روت‌های CRM + مخازن + کتابخانه‌ها"""
import re, sys

def sub(path, old, new):
    src = open(path).read()
    if old not in src:
        print(f"✗ {path}: NOT FOUND: {old[:60]!r}"); sys.exit(1)
    open(path, "w").write(src.replace(old, new, 1))
    print(f"✓ {path}")

# ═══ InfoButton ═══
p = "src/components/info/InfoButton.tsx"
src = open(p).read()
src = src.replace('''export interface InfoButtonProps {
  /** 'tabriz' | 'melketun' — tenant همین رندر (پیش‌فرض tabriz — صفر نشت) */
  tenant: "tabriz" | "melketun";''', '''export interface InfoButtonProps {
  /** tenant همین رندر — PN-059: پس از حذف ملکتون تنها tabriz زنده است */
  tenant?: "tabriz";''')
src = src.replace('''  tenant: "tabriz" | "melketun";
  type: string;''', '''  tenant: "tabriz";
  type: string;''')
src = src.replace('''const BUSINESS_FA: Record<string, string> = {
  tabriz: "مشاور املاک ملک تبریز",
  melketun: "مشاور املاک ملکتون",
};''', '''const BUSINESS_FA: Record<string, string> = {
  tabriz: "مشاور املاک ملک تبریز",
};''')
src = src.replace('export function InfoButton({ tenant, type, code }: InfoButtonProps) {',
                  'export function InfoButton({ tenant = "tabriz", type, code }: InfoButtonProps) {')
src = src.replace(' *   · سربرگ رسمی (کسب‌وکار + کد هویت کاشی M1…M10 + کد رکورد + تاریخ تولید)',
                  ' *   · سربرگ رسمی (کسب‌وکار + کد هویت کاشی M1…M4 + کد رکورد + تاریخ تولید)')
src = src.replace('  /** «M7 · آگهی ملکتون» / «M1 · آگهی ملک تبریز» */', '  /** «M1 · آگهی ملک تبریز» */')
src = src.replace('                  {/* سربرگ رسمی — کسب‌وکار + هویت کاشی (M1…M10) + کد + تاریخ */}',
                  '                  {/* سربرگ رسمی — کسب‌وکار + هویت کاشی (M1…M4) + کد + تاریخ */}')
open(p, "w").write(src)
assert 'melketun' not in src
print("✓ InfoButton.tsx")

# ═══ excel-import-button ═══
p = "src/components/app/shared/excel-import-button.tsx"
src = open(p).read()
src = src.replace('''  /** PN-051 (دستور شورا ۱۴۰۵/۰۸/۰۲) — tenant همین فهرست: 'melketun' ⇒ ملکتون؛
   *  رکوردهای تازه در همان داشبوردِ فهرستِ بارگذاری‌شده ثبت می‌شوند */
  tenantId?: "tabriz" | "melketun";
}''', '''  /** PN-059: tenant ملکتون حذف شد — ایمپورت همیشه در ملک تبریز ثبت می‌شود */
  tenantId?: "tabriz";
}''')
src = src.replace('export function ExcelImportButton({ entity, label = "بارگذاری اکسل", compact = false, onImported, tenantId }: ExcelImportButtonProps) {',
                  'export function ExcelImportButton({ entity, label = "بارگذاری اکسل", compact = false, onImported }: ExcelImportButtonProps) {')
src = src.replace('''      const q = tenantId === "melketun" ? "?tenantId=melketun" : "";
      const res = await apiUpload<ImportResponse>(`/api/crm/import/${entity}${q}`, file);''',
'''      const res = await apiUpload<ImportResponse>(`/api/crm/import/${entity}`, file);''')
open(p, "w").write(src)
assert 'melketun' not in src
print("✓ excel-import-button.tsx")

# ═══ AreasFileCell ═══
sub("src/core/tiles/tiles/arm-request/AreasFileCell.tsx",
'''/** منبع دادهٔ سند مناطق — صداقت provenance (قانون ۱۴):
 *  تبریز = سامانهٔ ARM ملک تبریز · ملکتون = CRM ملکتون (PN-049/گام ۱-الف) */
const AREAS_SOURCE_FA: Record<string, string> = {
  tabriz: "عین دادهٔ سامانه ARM ملک تبریز",
  melketun: "عین دادهٔ CRM ملکتون",
};''',
'''/** منبع دادهٔ سند مناطق — صداقت provenance (قانون ۱۴):
 *  تبریز = سامانهٔ ARM ملک تبریز (PN-059: ملکتون حذف شد) */
const AREAS_SOURCE_FA: Record<string, string> = {
  tabriz: "عین دادهٔ سامانه ARM ملک تبریز",
};''')

# ═══ info route ═══
sub("src/app/api/info/[tenant]/[type]/[code]/route.ts",
    '"tenant نامعتبر است (tabriz | melketun)."', '"tenant نامعتبر است (tabriz)."')

# ═══ arm-catalog × ۲ + transactions route ═══
for p in ["src/app/api/crm/arm-catalog/listings/route.ts", "src/app/api/crm/arm-catalog/requests/route.ts", "src/app/api/crm/transactions/route.ts"]:
    sub(p, '''    // PN-044/فاز ۴ (شورا-ن۰۸۸) — tenant همین رندر: 'melketun' → دادهٔ ملکتون؛
    // پیش‌فرض/هر چیز دیگر → 'melk-tabriz' (رفتار فعلی — صفر شکستن).
    const tenantId = tenantDbValue(sp.get("tenantId"));''',
    '''    // PN-059: tenant ملکتون حذف شد — همیشه 'melk-tabriz' (تک-tenant).
    const tenantId = tenantDbValue(sp.get("tenantId"));''')

# ═══ export route ═══
sub("src/app/api/crm/export/[entity]/route.ts",
'''  // PN-044/فاز ۴ (شورا-ن۰۸۸) — tenant همین خروجی: 'melketun' → دادهٔ ملکتون؛
  // پیش‌فرض/هر چیز دیگر → 'melk-tabriz' (رفتار فعلی — صفر شکستن).
  const tenantKey = sp.get("tenantId");
  const tenantId = tenantDbValue(tenantKey);
  const tenantLabel = tenantKey === "melketun" ? "ملکتون" : "ملک تبریز";''',
'''  // PN-059: tenant ملکتون حذف شد — همیشه 'melk-tabriz' (تک-tenant).
  const tenantId = tenantDbValue(sp.get("tenantId"));
  const tenantLabel = "ملک تبریز";''')

# ═══ import route ═══
sub("src/app/api/crm/import/[entity]/route.ts",
'''    // PN-051 (دستور شورا ۱۴۰۵/۰۸/۰۲) — ایمپورت در tenant فهرستِ بارگذاری‌شده:
    // tenantId=melketun ⇒ رکوردهای تازه در ملکتون؛ پیش‌فرض ⇒ ملک تبریز.
    const tenantKey = request.nextUrl.searchParams.get("tenantId");
    const result = await runImport(entity as ImportEntity, sheet, file.name, tenantKey);''',
'''    // PN-059: tenant ملکتون حذف شد — ایمپورت همیشه در ملک تبریز.
    const result = await runImport(entity as ImportEntity, sheet, file.name, null);''')

# ═══ request repository ═══
sub("src/core/repositories/prisma/request.repository.ts",
'''    // PN-044/فاز ۴ (شورا-ن۰۸۸) — جداسازی tenant: ملکتون (source='melketun-crm')
    // بدون فیلتر source؛ تبریز همان رفتار قبلی (source='arm') + tenant.
    // پیش‌فرض 'melk-tabriz' — تمام دادهٔ فعلی همین است ⇒ صفر شکستن، صفر نشت.
    const where: Prisma.RequestRecordWhereInput =
      filter.tenantId === "melketun"
        ? { tenantId: "melketun" }
        : { tenantId: filter.tenantId ?? "melk-tabriz", source: "arm" };''',
'''    // PN-059: tenant ملکتون حذف شد — همیشه تبریز (source='arm' + tenant).
    const where: Prisma.RequestRecordWhereInput =
      { tenantId: filter.tenantId ?? "melk-tabriz", source: "arm" };''')
sub("src/core/repositories/prisma/request.repository.ts",
'''  /** شمارش غنی‌سازی درخواست‌های ARM — extractionBatchId تهی = در انتظار لایهٔ ۲
   *  PN-046/گام اول-۱ — tenant-scoped: پیش‌فرض 'melk-tabriz'؛ برای ملکتون شمارش روی
   *  tenantId (source='melketun-crm') — پیش از این عدد تبریز به ملکتون نشت می‌کرد. */
  async countArmEnrichment(tenantId: string = "melk-tabriz"): Promise<EnrichmentCounts> {
    const whereArm: Prisma.RequestRecordWhereInput = tenantId === "melk-tabriz" ? { source: "arm" } : { tenantId };''',
'''  /** شمارش غنی‌سازی درخواست‌های ARM — extractionBatchId تهی = در انتظار لایهٔ ۲
   *  PN-059: تک-tenant — شمارش همیشه روی source='arm' (ملکتون حذف شد). */
  async countArmEnrichment(_tenantId: string = "melk-tabriz"): Promise<EnrichmentCounts> {
    const whereArm: Prisma.RequestRecordWhereInput = { source: "arm" };''')
sub("src/core/repositories/prisma/request.repository.ts",
'''   *  tenantId (source='melketun-crm') — پیش از این عدد تبریز به ملکتون نشت می‌کرد. */''',
'''   *  PN-059: تک-tenant (ملکتون حذف شد). */''')

# ═══ interface comments ═══
for p, old, new in [
  ("src/core/repositories/interfaces/transaction.repository.ts",
   "/** PN-044/فاز ۴ — مقدار ستون tenantId در DB ('melk-tabriz' | 'melketun'). undefined → تبریز */",
   "/** مقدار ستون tenantId در DB — PN-059: تنها 'melk-tabriz' زنده است */"),
  ("src/core/repositories/interfaces/expert.repository.ts",
   "/** PN-044/فاز ۴ — مقدار ستون tenantId در DB ('melk-tabriz' | 'melketun'). undefined → بدون فیلتر tenant (رفتار قبلی) */",
   "/** مقدار ستون tenantId در DB — PN-059: تنها 'melk-tabriz' زنده است */"),
]:
    sub(p, old, new)
p = "src/core/repositories/interfaces/bulk-write.repository.ts"
src = open(p).read()
src = src.replace("/** PN-044/فاز ۴ — مقدار ستون tenantId در DB ('melk-tabriz' | 'melketun'). undefined → تبریز */",
                  "/** مقدار ستون tenantId در DB — PN-059: تنها 'melk-tabriz' زنده است */")
open(p, "w").write(src)
print("✓ bulk-write.repository.ts")

# ═══ crm-import ═══
sub("src/lib/services/crm-import.ts",
    " * بارگذاری‌شده ثبت می‌شوند ('melketun' ⇒ ملکتون · پیش‌فرض ⇒ ملک تبریز).",
    " * بارگذاری‌شده ثبت می‌شوند (PN-059: همیشه ملک تبریز — ملکتون حذف شد).")
sub("src/lib/services/crm-import.ts",
    "  const tenantId = tenantDbValue(tenantKey ?? undefined); // 'melketun' | 'melk-tabriz'",
    "  const tenantId = tenantDbValue(tenantKey ?? undefined); // PN-059: همیشه 'melk-tabriz'")

# ═══ profile-store ═══
sub("src/lib/experts/profile-store.ts",
    "/** PN-044/فاز ۴ — مقدار ستون tenantId در DB ('melk-tabriz' | 'melketun'). undefined → تبریز */",
    "/** مقدار ستون tenantId در DB — PN-059: تنها 'melk-tabriz' زنده است */")

# ═══ QueryProvider ═══
sub("src/components/app/QueryProvider.tsx",
    "prerender /dashboard/melketun)", "prerender مسیرهای داشبورد)")

# ═══ info-files generator ═══
p = "src/lib/info-files/generator.ts"
src = open(p).read()
src = src.replace("export type InfoTenant = TenantKey; // 'tabriz' | 'melketun'",
                  "export type InfoTenant = TenantKey; // PN-059: تنها 'tabriz' (ملکتون حذف شد)")
src = src.replace('''const TENANT_LABELS: Record<InfoTenant, string> = {
  tabriz: "ملک تبریز (ARM/PM — سامانهٔ داخلی)",
  melketun: "ملکتون (CRM — Laravel)",
};''', '''const TENANT_LABELS: Record<InfoTenant, string> = {
  tabriz: "ملک تبریز (ARM/PM — سامانهٔ داخلی)",
};''')
src = src.replace('''export function isInfoTenant(v: string): v is InfoTenant {
  return v === "tabriz" || v === "melketun";
}''', '''export function isInfoTenant(v: string): v is InfoTenant {
  return v === "tabriz";
}''')
open(p, "w").write(src)
assert 'melketun' not in src
print("✓ info-files/generator.ts")

# ═══ column-source-map ═══
p = "src/lib/column-source-map.ts"
src = open(p).read()
src = src.replace('  crm_private: "Melketun CRM: myFilings funnel (نمای خصوصی کارشناس — ویرایش مستقیم؛ Law 05 برنده)",',
                  '  crm_private: "CRM قدیمی ملکتون: myFilings funnel (تاریخی — PN-059: مسیر حذف شد)",')
src = src.replace('  crm_public: "Melketun CRM: filings module (نمای عمومی آگهی‌ها)",',
                  '  crm_public: "CRM قدیمی ملکتون: filings module (تاریخی — PN-059: مسیر حذف شد)",')
src = src.replace('- \\`src/sync/lists/melketun-listings.ts\\` (M7) · \\`melketun-requests.ts\\` (M8) — مسیر CRM ملکتون\n', '')
open(p, "w").write(src)
print("✓ column-source-map.ts")

# ═══ protected-nulls header ═══
p = "src/lib/integrations/protected-nulls.ts"
src = open(p).read()
src = src.replace(''' * G1 — stripProtectedNulls: پیش از هر update در مسیرهای upsert ملکتون،''',
                  ''' * G1 — stripProtectedNulls: پیش از هر update در مسیرهای upsert سینک،''')
src = src.replace(''' * چرا: رکورد CRM در پاسِ بعدی ممکن است فیلد غنی‌سازی نداشته باشد''',
                  ''' * چرا: رکورد منبع در پاسِ بعدی ممکن است فیلد غنی‌سازی نداشته باشد''')
src = src.replace('  source: string; // مثال: "melketun-crm-public" | "melketun-myfilings" | "owner-note"',
                  '  source: string; // مثال: "arm-details" | "public-site" | "owner-note"')
open(p, "w").write(src)
print("✓ protected-nulls.ts")

# ═══ tsconfig exclude download ═══
p = "tsconfig.json"
src = open(p).read()
src = src.replace('''  "exclude": [
    "node_modules",
    "examples",
    "skills",
    "capacitor.config.ts",
    "scripts",
    "docs/archive"
  ]''', '''  "exclude": [
    "node_modules",
    "examples",
    "skills",
    "capacitor.config.ts",
    "scripts",
    "docs/archive",
    "download"
  ]''')
open(p, "w").write(src)
print("✓ tsconfig.json")

# ═══ اسکریپت‌های زیرساختی ═══
p = "scripts/pn048/simulate-stale-build.sh"
src = open(p).read()
src = src.replace("/home/z/my-project/src/lib/integrations/melketun/protected-nulls.ts",
                  "/home/z/my-project/src/lib/integrations/protected-nulls.ts")
open(p, "w").write(src)
print("✓ simulate-stale-build.sh")

p = "scripts/resurrect-ultimate.sh"
src = open(p).read()
src = src.replace('''# G1 (Worker boot precondition): محافظ stripProtectedNulls باید در سورس باشد
SYNC_GUARD="$REPO/src/lib/integrations/melketun/protected-nulls.ts"
if [ ! -f "$SYNC_GUARD" ] || ! grep -q "G1_STRIP_PROTECTED_NULLS = true" "$SYNC_GUARD" \\
   || ! grep -q "stripProtectedNulls" "$REPO/src/lib/integrations/melketun/sync.ts"; then
  echo "❌ G1 GATE: stripProtectedNulls در مسیرهای upsert یافت نشد — Worker استارت نمی‌شود (قانون دادهٔ مقدس)"
  exit 1
fi
echo "  ✓ G1: محافظ stripProtectedNulls حاضر است (protected-nulls.ts + ۶ نقطهٔ upsert)"''',
'''# G1 (Worker boot precondition): محافظ stripProtectedNulls باید در سورس باشد
# PN-059: مسیر از پوشهٔ ملکتونِ حذف‌شده به مسیر عمومی منتقل شد (حذف کامل کاشی ملکتون)
SYNC_GUARD="$REPO/src/lib/integrations/protected-nulls.ts"
if [ ! -f "$SYNC_GUARD" ] || ! grep -q "G1_STRIP_PROTECTED_NULLS = true" "$SYNC_GUARD"; then
  echo "❌ G1 GATE: stripProtectedNulls در سورس یافت نشد — Worker استارت نمی‌شود (قانون دادهٔ مقدس)"
  exit 1
fi
echo "  ✓ G1: محافظ stripProtectedNulls حاضر است (protected-nulls.ts)"''')
open(p, "w").write(src)
print("✓ resurrect-ultimate.sh")

print("PHASE-3 OK")
