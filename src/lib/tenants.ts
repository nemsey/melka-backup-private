/**
 * Tenant keys — منبع یگانهٔ نگاشت کلید tenant به مقدار DB (PN-044/فاز ۴ — شورا-ن۰۸۸)
 * ---------------------------------------------------------------------------
 * مقدار DB 'melk-tabriz' از P6.5-02 (§۱۴ مصوبه شورا) از قبل موجود است.
 * قانون ۱۱ (صفر مداخله در دادهٔ تبریز): rename 'melk-tabriz' → 'tabriz' ممنوع.
 *
 * PN-059 (دستور مالک ۱۴۰۵/۰۸/۱۱) — حذف کامل ملکتون:
 * tenant «melketun» به‌همراه کاشی، مسیرها، خط‌لوله‌های سینک و همهٔ داده‌هایش
 * به حکم صریح مالک حذف شد. تنها tenant زنده: tabriz (ملک تبریز).
 */

export type TenantKey = "tabriz";

export const TENANT_DB_VALUES = {
  tabriz: "melk-tabriz",
} as const;

/** کلید tenant معتبر است؟ (ورودی API) */
export function isTenantKey(v: string | null | undefined): v is TenantKey {
  return v === "tabriz";
}

/* ═══════════════════════════════════════════════════════════════════════════
 * PN-047/گام اول-۱ (دستور مالک ۱۴۰۵/۰۷/۲۹) — هویت مستقل کاشی‌های هر داشبورد
 * ---------------------------------------------------------------------------
 * «برای کاشی‌های موجود در داشبورد ملکتون هویت جداگانه قائل شو و شماره‌گذاری کن»:
 *   · ملک تبریز:  M1 آگهی · M2 درخواست · M3 معاملات · M4 کارشناسان
 *   · ملکتون (M7-M10): حذف کامل — PN-059 (دستور مالک ۱۴۰۵/۰۸/۱۱)
 * M5 (تطبیق هوشمند) و M6 (فایل‌یابی) کاشی‌های سراسریِ خارج از داشبورد
 * چند-مستأجری‌اند و شماره‌شان مشترک می‌ماند.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** کلید کاشی‌های چند-مستأجری (چهار فهرست هر داشبورد) */
export type TenantTileKind = "listings" | "requests" | "transactions" | "experts";

/** هویت شماره‌ای کاشی‌ها به تفکیک tenant — عین دستور مالک PN-047 */
export const TENANT_TILE_IDENTITY: Record<TenantKey, Record<TenantTileKind, string>> = {
  tabriz: { listings: "M1", requests: "M2", transactions: "M3", experts: "M4" },
};

/** برچسب فارسی هر کاشی (مشترک) */
export const TILE_KIND_FA: Record<TenantTileKind, string> = {
  listings: "آگهی",
  requests: "درخواست",
  transactions: "معاملات",
  experts: "کارشناسان",
};

/** برچسب کامل کسب‌وکار هر tenant */
export const TENANT_FA: Record<TenantKey, string> = {
  tabriz: "ملک تبریز",
};

/**
 * برچسب هویت کامل یک کاشی — «M1 · آگهی ملک تبریز».
 */
export function tileIdentityLabel(tenant: TenantKey, kind: TenantTileKind): string {
  return `${TENANT_TILE_IDENTITY[tenant][kind]} · ${TILE_KIND_FA[kind]} ${TENANT_FA[tenant]}`;
}

/** فقط کد هویت: «M1» */
export function tileIdentityCode(tenant: TenantKey, kind: TenantTileKind): string {
  return TENANT_TILE_IDENTITY[tenant][kind];
}

/**
 * پارامتر tenantId درخواست (اختیاری) → مقدار ستون DB.
 * تک-tenant پس از PN-059: همیشه 'melk-tabriz' (ملکتون حذف شد).
 */
export function tenantDbValue(_param: string | null | undefined): string {
  return TENANT_DB_VALUES.tabriz;
}
