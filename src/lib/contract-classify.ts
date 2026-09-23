/**
 * classifyContract — قانون انواع معاملات ملکا (ملکا-شورا-۱۴۰۵-۰۱۸ · BLOCK 0.3)
 * ============================================================================
 * تابع مرکزی و یگانهٔ دسته‌بندی نوع قرارداد معاملات ملک تبریز.
 * «چهارگانهٔ انواع معاملات» + ثبت‌نشده:
 *
 *   نوع (kind)         خانواده (family)
 *   مبایعه‌نامه        sale  (فروش)
 *   پیش‌فروش           sale  (فروش)
 *   اجاره              rent  (اجاره)
 *   تمدید اجاره        rent  (اجاره)
 *   ثبت‌نشده           none  (بدون قرارداد)
 *
 * منبع دادهٔ خام SAM ARM مقادیر را با «فاصلهٔ معمولی» ذخیره می‌کند
 * («مبایعه نامه»، «پیش فروش»، «اجاره نامه»، «تمدید اجاره» — شاعد:
 * توزیع 739 رکورد: 522/33/170/14)؛ متن فارسی ممکن است با «نیم‌فاصله» (U+200C)
 * هم نوشته شود — تابع هر دو شکل (و ترکیب ارقام فارسی/لاتین در ورودی UI) را
 * یکسان می‌بیند. این ماژول کاملاً خالص است: صفر وابستگی، صفر DB.
 */

/** خانوادهٔ حسابداری معامله — قانون جلسه ۰۱۸ */
export type ContractFamily = "sale" | "rent" | "none";

/** نوع دقیق قرارداد — ۴ نوع کشف‌شدهٔ مالک + ثبت‌نشده */
export type ContractKind = "مبایعه‌نامه" | "پیش‌فروش" | "اجاره" | "تمدید اجاره" | "ثبت‌نشده";

/** خروجی دسته‌بندی */
export interface ContractClassification {
  kind: ContractKind;
  family: ContractFamily;
}

/** چهار kind دارای قرارداد — برای فیلتر چندگانه (D.1) به‌همراه «none» */
export const CONTRACT_KIND_FILTER_VALUES: readonly string[] = [
  "مبایعه‌نامه",
  "پیش‌فروش",
  "اجاره",
  "تمدید اجاره",
  "none",
] as const;

/** برچسب فارسی گزینه‌های فیلتر نوع قرارداد (D.1 — دقیقاً پنج گزینه) */
export const CONTRACT_KIND_FILTER_LABELS: Record<string, string> = {
  "مبایعه‌نامه": "مبایعه‌نامه",
  "پیش‌فروش": "پیش‌فروش",
  "اجاره": "اجاره",
  "تمدید اجاره": "تمدید اجاره",
  none: "بدون قرارداد ثبت‌شده",
};

/**
 * نرمال‌سازی مقدار نوع قرارداد برای مقایسه:
 * حذف فاصله‌های ابتدا/انتها · نیم‌فاصله (U+200C) → فاصله · فشرده‌سازی فاصله‌های تکراری.
 */
export function normalizeContractTypeValue(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/\u200c/g, " ") // نیم‌فاصله → فاصله
    .replace(/\s+/g, " ") // فاصله‌های تکراری → یکی
    .trim();
}

/**
 * دسته‌بندی نوع قرارداد — قواعد عین BLOCK 0.3 جلسه ۰۱۸:
 *   مبایعه‌نامه → { kind: مبایعه‌نامه, family: sale }
 *   پیش‌فروش    → { kind: پیش‌فروش,    family: sale }
 *   اجاره       → { kind: اجاره,       family: rent }
 *   تمدید اجاره → { kind: تمدید اجاره, family: rent }
 *   null/خالی   → { kind: ثبت‌نشده,    family: none }
 * مقدار ناشناخته (آیندهٔ سامانه) نیز «ثبت‌نشده/none» می‌شود تا قید ریاضی
 * مجموع = فروش + اجاره + بدون‌قرارداد همیشه برقرار بماند.
 *
 * ترتیب مقایسه مهم است: «تمدید اجاره» و «پیش‌فروش» پیش از «اجاره»/«مبایعه»
 * بررسی می‌شوند چون زیرمجموعهٔ واژگانی‌اند.
 */
export function classifyContract(rawType: string | null | undefined): ContractClassification {
  const t = normalizeContractTypeValue(rawType);
  if (!t) return { kind: "ثبت‌نشده", family: "none" };
  if (t.includes("تمدید") && t.includes("اجاره")) return { kind: "تمدید اجاره", family: "rent" };
  if ((t.includes("پیش") && t.includes("فروش")) || t.includes("پیش‌فروش")) return { kind: "پیش‌فروش", family: "sale" };
  if (t.includes("مبایعه") || t.includes("خرید و فروش")) return { kind: "مبایعه‌نامه", family: "sale" };
  if (t.includes("اجاره")) return { kind: "اجاره", family: "rent" };
  return { kind: "ثبت‌نشده", family: "none" };
}

/**
 * نرمال‌سازی ارقام فارسی/عربی → لاتین — رفع باگ F1 (filter-bug-diagnosis.md):
 * جدول کدها را با ارقام فارسی نمایش می‌دهد؛ کاربر همان را تایپ می‌کند؛
 * DB ارقام لاتین دارد. این تابع ورودی کاربر را به شکل DB می‌رساند.
 */
const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function normalizeFaDigits(input: string | null | undefined): string {
  if (!input) return "";
  let out = "";
  for (const ch of input) {
    const fa = FA_DIGITS.indexOf(ch);
    if (fa >= 0) {
      out += String(fa);
      continue;
    }
    const ar = AR_DIGITS.indexOf(ch);
    if (ar >= 0) {
      out += String(ar);
      continue;
    }
    out += ch;
  }
  return out;
}

/** نرمال‌سازی ورودی فیلتر متنی/کدی: ارقام → لاتین + نیم‌فاصله → فاصله + فشرده‌سازی فاصله */
export function normalizeFilterText(input: string | null | undefined): string {
  return normalizeContractTypeValue(normalizeFaDigits(input));
}
