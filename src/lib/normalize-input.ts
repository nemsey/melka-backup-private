/**
 * قانون یکسان‌سازی ورودی (P6525 — دستور مالک ۱۴۰۵/۰۷/۰۵)
 * =========================================================
 * ریشهٔ ایجاد: باگ تاریخی ۴/۵ — چهار فایل رشتهٔ «۰۱۲۳۵۴۶۷۸۹» را با جابه‌جاییِ
 * ۴ و ۵ داشتند (indexOf → ۵↦4 و ۴↦5)؛ جست‌وجوی «۵۹۱۵» به «4915» ترجمه می‌شد
 * و صفر نتیجه می‌داد. شاهد زندهٔ پیش از رفع: کد ۵۹۲۵۲ با ارقام فارسی = ۰ ردیف،
 * با ارقام لاتین = ۱ ردیف.
 *
 * قانون این ماژول (برای همیشه — منبع یگانه):
 *   ۱. نتیجهٔ نگاشت ارقام فارسی (۰-۹)، عربی (٠-٩) و لاتین (0-9) همیشه یکسان است.
 *   ۲. حروف عربی/فارسی هم‌ارز (ي↔ی، ك↔ک) یکسان دیده می‌شوند (بررسی نکتهٔ مالک).
 *   ۳. هیچ نگاشت مبتنی بر «رشتهٔ ترتیبی + indexOf» خارج از این فایل مجاز نیست —
 *      گارد تست P6525 هر رشتهٔ ده‌رقمی غیرترتیبی در src را قرمز می‌کند.
 */

/** ارقام فارسی به ترتیب مقدار — هرگز ترتیب را تغییر ندهید؛ گارد تست مراقب است */
const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
/** ارقام عربی به ترتیب مقدار — هرگز ترتیب را تغییر ندهید؛ گارد تست مراقب است */
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** نگاشت یک رقم فارسی/عربی به لاتین — بر پایهٔ موقعیت در رشتهٔ مرتب */
const FA_TO_LATIN = new Map<string, string>(
  Array.from(FA_DIGITS, (ch, i) => [ch, String(i)] as const).concat(
    Array.from(AR_DIGITS, (ch, i) => [ch, String(i)] as const)
  )
);

/** نگاشت حروف عربی → هم‌ارز فارسی (نکتهٔ ۲ مالک — ی/ي و ک/ك) */
const AR_TO_FA_LETTERS: ReadonlyMap<string, string> = new Map([
  ["\u064A", "\u06CC"], // ي (Arabic yeh) → ی (Farsi yeh)
  ["\u0643", "\u06A9"], // ك (Arabic kaf) → ک (Farsi keh)
]);

/**
 * ارقام فارسی/عربی → لاتین (بقیهٔ نویسه‌ها دست‌نخورده).
 * ورودی تهی → رشتهٔ خالی. deterministic و بدون وابستگی.
 */
export function normalizeFaDigits(input: string | null | undefined): string {
  if (!input) return "";
  let out = "";
  for (const ch of input) {
    const latin = FA_TO_LATIN.get(ch);
    out += latin ?? ch;
  }
  return out;
}

/**
 * حروف عربی → هم‌ارز فارسی (ي→ی، ك→ک).
 * برای فیلترهای نام: کاربر هر دو شکل را تایپ می‌کند و نتیجه باید یکسان باشد.
 */
export function normalizeFaLetters(input: string | null | undefined): string {
  if (!input) return "";
  let out = "";
  for (const ch of input) {
    out += AR_TO_FA_LETTERS.get(ch) ?? ch;
  }
  return out;
}

/**
 * نرمال‌سازی کامل ورودی فیلترهای فهرست‌ها (قانون P6525):
 *   ارقام → لاتین + حروف عربی → فارسی + نیم‌فاصله → فاصله + فشرده‌سازی فاصله‌ها + trim.
 * این تابع جای هر نگاشت درون‌خطی ارقام/حروف در مسیر فیلتر را گرفته است.
 */
export function normalizeFilterInput(input: string | null | undefined): string {
  if (!input) return "";
  return normalizeFaLetters(normalizeFaDigits(input))
    .replace(/\u200C/g, " ") // نیم‌فاصله → فاصله (هم‌ارزی فرم‌های DB و کاربر)
    .replace(/\s+/g, " ")
    .trim();
}
