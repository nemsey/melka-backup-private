/**
 * مرتب‌سازی فارسی فهرست‌ها — P6530 / گام ۶ (نکتهٔ بسیار مهم ۲)
 * ---------------------------------------------------------------------------
 * «ترتیب نوشتاری اعداد از ۰ الی ۹ در تمامی فهرست‌ها در کاشی‌ها کنترل شود که
 * مرتب و به ترتیب می‌باشد و نتیجهٔ نوشتن با اعداد فارسی و انگلیسی یک نتیجهٔ
 * واحد داشته باشد و همچنین قاعدهٔ ترتیب حروف فارسی و عربی در فهرست‌ها کنترل شود»
 *
 * یک منبع یگانه:
 *   · faNormalizeKey(text) — ارقام فارسی/عربی → لاتین + ي/ك/ة عربی → فارسی +
 *     حذف نیم‌فاصله/فاصله‌های تکراری + حذف اعراب — کلید مرتب‌سازی پایدار
 *   · faCompare(a, b) — مقایسهٔ متنی با الفبای فارسی (ا ب پ ت ث …) و ارقام ۰-۹
 *   · faCompareCode(a, b) — مقایسهٔ عددی کدها (۵۹۱۱۵ = 59115؛ ترتیب ۰ تا ۹)
 *
 * کاربرد: فهرست‌های کاشی‌ها برای ترتیب نمایشی ستون‌های متنی/کدی از این ماژول
 * استفاده می‌کنند؛ ورودی فارسی/عربی/لاتین همیشه نتیجهٔ واحد می‌دهد.
 */

/** نرمال‌سازی کلید مرتب‌سازی — ارقام و حروف عربی→فارسی + پاک‌سازی */
export function faNormalizeKey(text: string | null | undefined): string {
  if (!text) return "";
  return text
    // ارقام فارسی ۰-۹ و عربی-هندی ٠-٩ → لاتین 0-9 (ترتیب عددی پایدار)
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    // حروف عربی → معادل فارسی (ي↦ی، ك↦ک، ة↦ه، أإآ↦ا برای مرتب‌سازی)
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ة/g, "ه")
    .replace(/[أإآٱ]/g, "ا")
    // اعراب حذف
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    // نیم‌فاصله → فاصله + فاصله‌های تکراری یکی
    .replace(/\u200c/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** مقایسهٔ متنی فارسی — الفبای فارسی + ارقام ۰-۹؛ خروجی منفی/صفر/مثبت */
export function faCompare(a: string | null | undefined, b: string | null | undefined): number {
  const ka = faNormalizeKey(a);
  const kb = faNormalizeKey(b);
  // localeCompare با fa: ترتیب الفبای فارسی + ارقام قبل از حروف
  const byLocale = ka.localeCompare(kb, "fa", { numeric: true, sensitivity: "base" });
  return byLocale;
}

/** مقایسهٔ عددی کدها — ۵۹۱۱۵ = 59115؛ ترتیب عددی ۰ تا ۹ (نه لغتی) */
export function faCompareCode(a: string | null | undefined, b: string | null | undefined): number {
  const ka = faNormalizeKey(a);
  const kb = faNormalizeKey(b);
  const na = /^-?\d+$/.test(ka) ? Number(ka) : null;
  const nb = /^-?\d+$/.test(kb) ? Number(kb) : null;
  if (na !== null && nb !== null) return na - nb; // هر دو عددی → ترتیب عددی
  if (na !== null) return -1; // اعداد قبل از متن
  if (nb !== null) return 1;
  return ka.localeCompare(kb, "fa", { numeric: true, sensitivity: "base" });
}

/** مرتب‌سازی آرایه بر اساس کلید استخراج‌شده با مقایسهٔ فارسی */
export function faSortBy<T>(items: readonly T[], key: (item: T) => string | null | undefined): T[] {
  return [...items].sort((x, y) => faCompare(key(x), key(y)));
}
