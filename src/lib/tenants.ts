/**
 * Tenant keys — منبع یگانهٔ نگاشت کلید tenant به مقدار DB (PN-044/فاز ۴ — شورا-ن۰۸۸)
 * ---------------------------------------------------------------------------
 * مقدار DB 'melk-tabriz' از P6.5-02 (§۱۴ مصوبه شورا) از قبل موجود است؛ همهٔ
 * ۲۷,۸۶۸ + ۲۵,۵۸۰ + ۷۹۸ + ۲۹۶ رکورد فعلی همین مقدار را دارند. PN-044 مقدار
 * 'melketun' را برای دادهٔ CRM ملکتون اضافه کرد.
 * قانون ۱۱ (صفر مداخله در دادهٔ تبریز): rename 'melk-tabriz' → 'tabriz' ممنوع.
 */

export type TenantKey = "tabriz" | "melketun";

export const TENANT_DB_VALUES = {
  tabriz: "melk-tabriz",
  melketun: "melketun",
} as const;

/** کلید tenant معتبر است؟ (ورودی API) */
export function isTenantKey(v: string | null | undefined): v is TenantKey {
  return v === "tabriz" || v === "melketun";
}

/**
 * پارامتر tenantId درخواست (اختیاری) → مقدار ستون DB.
 * پیش‌فرض = tabriz → 'melk-tabriz' (صفر شکستن دادهٔ فعلی — کاشی‌های بدون tenant
 * فقط دادهٔ تبریز می‌بینند و دادهٔ ملکتون هرگز به آن‌ها نشت نمی‌کند).
 */
export function tenantDbValue(param: string | null | undefined): string {
  return param === "melketun" ? TENANT_DB_VALUES.melketun : TENANT_DB_VALUES.tabriz;
}
