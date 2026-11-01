/**
 * محافظ دادهٔ مقدس — G1/G2/G5 (DIR-PN048-007 · موج صفر · D-0a)
 * ---------------------------------------------------------------------------
 * G1 — stripProtectedNulls: پیش از هر update در مسیرهای upsert ملکتون،
 *      مقادیر null/undefined از payload کنده می‌شوند و مقادیر تهیِ («»)
 *      فیلدهای محافظت‌شدهٔ PII هرگز روی دادهٔ پر نمی‌نشینند.
 * G2 — additive-only: هیچ null روی پر نمی‌نشیند (create کامل می‌ماند؛
 *      update فقط فیلدهای دارای مقدار واقعی را می‌نویسد).
 * G5 — طرح provenance: هر فیلد همیشه با {source, endpoint, extractedAt,
 *      runId, confidence, verified} ثبت می‌شود (FieldProvenance).
 *
 * چرا: رکورد CRM در پاسِ بعدی ممکن است فیلد غنی‌سازی نداشته باشد
 * (myFilings ناقص · صفحهٔ خراب ۵۰۰ · تغییر نمای CRM). بدون این محافظ،
 * upsert با update:data مقدار null را روی دادهٔ پرِ قبلی می‌نویسد —
 * همان الگوی «فاجعهٔ صفر شدن داده» که این گارد باید برای همیشه ببندد.
 *
 * Worker boot (قانون توقف DIR-PN048-007): اگر G1_STRIP_PROTECTED_NULLS
 * نادرست بود، Worker حق استارت ندارد (توقف فوری).
 */

/** نشانهٔ نسخهٔ فعال — Worker در بوت این را وارسی می‌کند (halt در صورت false) */
export const G1_STRIP_PROTECTED_NULLS = true as const;

/**
 * فیلدهای محافظت‌شدهٔ PII (G1) — رشتهٔ تهی هم مثل null رفتار می‌کند؛
 * این فیلدها هرگز با «» یا null بازنویسی نمی‌شوند؛ فقط مقدار واقعیِ
 * جدید جایگزین می‌شود (جابجایی موبایل مالک وقتی CRM واقعاً تازه داده).
 */
export const PROTECTED_PII_FIELDS: readonly string[] = [
  "ownerName",
  "ownerCode",
  "ownerKey",
  "ownerNote",
  "ownerMobile",
  "rawOwnerName",
  "rawOwnerMobile",
  "ownerSearchNorm",
  "customerName",
  "rawCustomerName",
  "customerMobile",
  "rawCustomerMobile",
  "buyerMobile",
  "sellerMobile",
  "personMobile",
  "address",
  "addressText",
  "telephone",
  "mobile",
] as const;

const PROTECTED_SET: ReadonlySet<string> = new Set(PROTECTED_PII_FIELDS);

/**
 * G1/G2 — حذف null/undefined از کل payload update + حذف رشتهٔ تهی از
 * فیلدهای محافظت‌شدهٔ PII. ایدمپوتنت و بی‌عرضه (آبجکت تازه می‌سازد).
 *
 * create دادهٔ کامل می‌گیرد (رکورد تازه با nullهای صادقانه اشکالی ندارد)؛
 * update هرگز چیزی را که پر است خالی نمی‌کند.
 */
export function stripProtectedNulls<T extends Record<string, unknown>>(data: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) continue; // G2: null روی پر نمی‌نشیند
    if (PROTECTED_SET.has(key) && typeof value === "string" && value.trim() === "") continue; // G1: PII با «» پاک نمی‌شود
    out[key] = value;
  }
  return out as Partial<T>;
}

/**
 * G5 — طرح provenance میدانی (ثبت منبع هر استخراج).
 * sourceOfTruth: فقط حساب خودی (sync ملکتون با session مالک).
 */
export interface FieldProvenance {
  field: string;
  source: string; // مثال: "melketun-crm-public" | "melketun-myfilings" | "owner-note"
  endpoint: string; // مسیر Ziggy/صفحه‌ای که مقدار از آن آمده
  extractedAt: string; // ISO 8601
  runId: string; // شناسهٔ اجرای sync
  confidence: number; // 0..1
  verified: boolean; // آیا با شاهد دوم راستی‌آزمایی شد؟
}

/** dataLineageHash — اثر انگشت سادهٔ ردیف provenance برای تشخیص تغییر (SHA-256 در فراخوان) */
export function provenanceKey(p: Omit<FieldProvenance, "verified" | "confidence"> & Partial<FieldProvenance>): string {
  return [p.field, p.source, p.endpoint, p.runId].join("|");
}
