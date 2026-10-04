/**
 * قالب‌بندی فارسی — اعداد، مبالغ، تاریخ (هجری شمسی)
 * ------------------------------------------------------
 * تمام نمایش عددی اپلیکیشن با ارقام فارسی است (تک‌زبانه: فارسی).
 * تمام تاریخ‌ها با تقویم هجری شمسی (جلالی) نمایش داده می‌شوند؛
 * محاسبات تقویم در «src/lib/jalali.ts» (تک‌منبع حقیقت) انجام می‌شود.
 */

import { dateToJalali, enDigits, faDigits, formatJalaliLong, formatJalaliLongDateTime, formatJalaliShort, formatJalaliShortDateTime } from "./jalali";

export { enDigits, faDigits };

/** تاریخ شمسی خوانا از ISO/Date: «۲۱ شهریور ۱۴۰۵» */
export function faDate(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "—";
  return formatJalaliLong(dateToJalali(d));
}

/** تاریخ شمسی کوتاه: «۱۴۰۵/۰۶/۲۱» — مناسب جدول‌ها */
export function faJalaliShort(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "—";
  return formatJalaliShort(dateToJalali(d));
}

/** تاریخ + ساعت شمسی خوانا: «۲۱ شهریور ۱۴۰۵ — ساعت ۱۴:۳۰» */
export function faDateTime(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "—";
  return formatJalaliLongDateTime(d);
}

/** تاریخ + ساعت شمسی فشرده: «۱۴۰۵/۰۶/۲۱ — ۱۴:۳۰» */
export function faJalaliShortDateTime(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "—";
  return formatJalaliShortDateTime(d);
}

/** برچسب ماه شمسی از کلید ماه جلالی «yyyy-mm»: «شهریور ۱۴۰۵» */
export function faMonthLabel(jalaliMonthKey: string): string {
  const [y, m] = jalaliMonthKey.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return jalaliMonthKey;
  return `${["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"][m - 1]} ${faDigits(y)}`;
}

// ===================== اعداد و مبالغ =====================

const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

function faDigitsLocal(input: string | number): string {
  return String(input).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

/** مبلغ تومانی خوانا: ۲٫۵ میلیارد تومان */
export function faToman(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const faDec = (s: string) => faDigitsLocal(s).replace(".", "٫");
  if (n >= 1_000_000_000_000) return `${faDec((n / 1_000_000_000_000).toFixed(1))} همت`;
  if (n >= 1_000_000_000) return `${faDec((n / 1_000_000_000).toFixed(1).replace(/\.0$/, ""))} میلیارد تومان`;
  if (n >= 1_000_000) return `${faNumber(Math.round(n / 1_000_000))} میلیون تومان`;
  return `${faNumber(n)} تومان`;
}

/** عدد با جداکننده هزارگان فارسی
 *  P6.5-12 (نکتهٔ ۱ دستور مالک): جداکننده در کل اپ «،» است — عین نمونهٔ دستور:
 *  ۲۰۰،۰۰۰،۰۰۰،۰۰۰ تومان */
export function faNumber(n: number): string {
  return faDigitsLocal(Math.round(n).toLocaleString("en-US")).replace(/,/g, "،");
}

/** P6.5-12 — مبلغ با تمام ارقام و جداکنندهٔ «،»: «۱۹،۳۰۰،۰۰۰،۰۰۰ تومان»
 *  (بدون خلاصه‌سازی میلیارد/میلیون — عین نمونهٔ دستور مالک) */
export function faAmountFull(n: number | null | undefined, unit = " تومان"): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${faNumber(n)}${unit}`;
}

/** درصد فارسی */
export function faPercent(n: number): string {
  return `${faDigitsLocal(n.toLocaleString("en-US"))}٪`;
}

// ===================== فاصله زمانی نسبی =====================

/** فاصله زمانی نسبی فارسی: «امروز»، «۱۲ روز پیش» */
export function faRelative(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "امروز";
  if (days < 30) return `${faDigitsLocal(days)} روز پیش`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${faDigitsLocal(months)} ماه پیش`;
  return `${faDigitsLocal(Math.floor(months / 12))} سال پیش`;
}

/** مبلغ تومانی دقیق با جداکننده هزارگان: «۶٬۷۵۰٬۰۰۰ تومان» — مناسب قبض کمیسیون */
export function faTomanExact(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${faNumber(n)} تومان`;
}
