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

/* ═══════════════════════════════════════════════════════════════════════════
 * PN-047/گام اول-۱ (دستور مالک ۱۴۰۵/۰۷/۲۹) — هویت مستقل کاشی‌های هر داشبورد
 * ---------------------------------------------------------------------------
 * «برای کاشی‌های موجود در داشبورد ملکتون هویت جداگانه قائل شو و شماره‌گذاری کن»:
 *   · ملک تبریز:  M1 آگهی · M2 درخواست · M3 معاملات · M4 کارشناسان
 *   · ملکتون:    M7 آگهی · M8 درخواست · M9 معاملات · M10 کارشناسان
 * این جدول «منبع یگانهٔ حقیقت» هویت کاشی‌هاست — همهٔ UI‌ها (تب‌های داشبورد،
 * سربرگ فهرست‌ها، فایل اطلاعات، بینش‌ها) و همهٔ اسناد از همین‌جا می‌خوانند.
 * M5 (تطبیق هوشمند) و M6 (فایل‌یابی) کاشی‌های سراسریِ خارج از داشبوردهای
 * چند-مستأجری‌اند و شماره‌شان مشترک می‌ماند.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** کلید کاشی‌های چند-مستأجری (چهار فهرست هر داشبورد) */
export type TenantTileKind = "listings" | "requests" | "transactions" | "experts";

/** هویت شماره‌ای کاشی‌ها به تفکیک tenant — عین دستور مالک PN-047 */
export const TENANT_TILE_IDENTITY: Record<TenantKey, Record<TenantTileKind, string>> = {
  tabriz: { listings: "M1", requests: "M2", transactions: "M3", experts: "M4" },
  melketun: { listings: "M7", requests: "M8", transactions: "M9", experts: "M10" },
};

/** برچسب فارسی هر کاشی (مشترک بین دو داشبورد) */
export const TILE_KIND_FA: Record<TenantTileKind, string> = {
  listings: "آگهی",
  requests: "درخواست",
  transactions: "معاملات",
  experts: "کارشناسان",
};

/** برچسب کامل کسب‌وکار هر tenant */
export const TENANT_FA: Record<TenantKey, string> = {
  tabriz: "ملک تبریز",
  melketun: "ملکتون",
};

/**
 * برچسب هویت کامل یک کاشی — «M7 · آگهی ملکتون» / «M1 · آگهی ملک تبریز».
 * منبع یگانه برای سربرگ فهرست‌ها، تب‌ها، فایل اطلاعات و اسناد.
 */
export function tileIdentityLabel(tenant: TenantKey, kind: TenantTileKind): string {
  return `${TENANT_TILE_IDENTITY[tenant][kind]} · ${TILE_KIND_FA[kind]} ${TENANT_FA[tenant]}`;
}

/** فقط کد هویت: «M7» */
export function tileIdentityCode(tenant: TenantKey, kind: TenantTileKind): string {
  return TENANT_TILE_IDENTITY[tenant][kind];
}

/**
 * پارامتر tenantId درخواست (اختیاری) → مقدار ستون DB.
 * پیش‌فرض = tabriz → 'melk-tabriz' (صفر شکستن دادهٔ فعلی — کاشی‌های بدون tenant
 * فقط دادهٔ تبریز می‌بینند و دادهٔ ملکتون هرگز به آن‌ها نشت نمی‌کند).
 */
export function tenantDbValue(param: string | null | undefined): string {
  return param === "melketun" ? TENANT_DB_VALUES.melketun : TENANT_DB_VALUES.tabriz;
}
