/**
 * گاردهای ریاضی مشترک builderهای ویژگی — PHASE 6 / P6-02
 * ------------------------------------------------------
 * توابع خالص بی‌وابستگی — فقط نرمال‌سازی و گارد مقادیر.
 * هیچ فایلی در لایه هوشمندی حق import بیرونی (جز type) ندارد؛
 * این ماژول کوچک برای پرهیز از تکرار چهارگانه clamp در builderهاست.
 */

/** برش به بازه [0,1] — نمره‌ها و نسبت‌ها */
export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** برش به نامنفی — شمارندها و مقادیر فیزیکی */
export function clampNonNegative(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, value);
}

/** برش عدد صحیح نامنفی (تعداد عکس، اتاق و…) */
export function clampCount(value: number): number {
  return Math.round(clampNonNegative(value));
}
