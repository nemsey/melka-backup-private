/**
 * owner-codes.ts — PN-008 BLOCK 6: کدهای پرسنلی مالک (قانون هویت دوگانهٔ مالک)
 * ---------------------------------------------------------------------------
 * «مالک از هر مسیر وارد شود (کد مستر یا کد پرسنلی)، سیستم باید نقش OWNER را
 * با دسترسی کامل اعمال کند.» — ملکا-شورا-ن۰۰۸-۱۴۰۵
 *
 * ماژول خالص (بدون وابستگی DB) تا در provider نشست هم بدون زنجیرهٔ سنگین استفاده شود.
 * منبع: متغیر محیطی OWNER_PERSONNEL_CODES (کاما-جدا؛ مثال: 410031320,410031321)
 */

export function ownerPersonnelCodesFromEnv(): string[] {
  return (process.env.OWNER_PERSONNEL_CODES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isOwnerPersonnelCode(personnelCode: string): boolean {
  const code = (personnelCode ?? "").trim();
  return code.length > 0 && ownerPersonnelCodesFromEnv().includes(code);
}
