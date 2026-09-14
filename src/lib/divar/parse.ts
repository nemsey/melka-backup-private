/**
 * ابزار تجزیه داده دیوار — ارقام فارسی، قیمت، تاریخ جلالی انتشار، مشخصات
 * همه الگوها از پاسخ‌های واقعی و زنده API دیوار استخراج شده‌اند.
 */

import { JALALI_MONTHS, jalaliToGregorian } from "@/lib/jalali";

/** تبدیل ارقام فارسی/عربی به لاتین */
export function toLatinDigits(s: string): string {
  return s
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

/** تجزیه قیمت متنی دیوار به تومان («۵,۲۰۰,۰۰۰,۰۰۰ تومان» → 5200000000) */
export function parsePriceToman(text: string | null | undefined): number | null {
  if (!text) return null;
  const latin = toLatinDigits(text).replace(/,/g, "");
  const m = latin.match(/(\d{3,})\s*(?:تومان|تومن)?/);
  if (!m) return null;
  const num = Number(m[1]);
  return isFinite(num) && num > 0 ? num : null;
}

/** تجزیه «قیمت هر متر» به تومان */
export function parsePricePerMeterToman(text: string | null | undefined): number | null {
  return parsePriceToman(text);
}

/** تجزیه متراژ («۷۵» → 75) */
export function parseMeterage(text: string | null | undefined): number | null {
  if (!text) return null;
  const latin = toLatinDigits(String(text));
  const m = latin.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const num = Number(m[1]);
  return isFinite(num) && num > 0 && num < 100000 ? num : null;
}

/** ماه‌های جلالی — مطابق هسته jalali.ts */
/**
 * تجزیه تاریخ جلالی دیوار به میلادی UTC.
 * نمونه واقعی از API دیوار: «۱۹ شهریور ۱۴۰۵، ۱۴:۰۲»
 * خروجی: ISO datetime (زمان دیوار ایران +۳:۳۰ است → UTC = منهای ۳:۳۰)
 */
export function parseDivarJalaliDateTime(text: string | null | undefined): Date | null {
  if (!text) return null;
  const latin = toLatinDigits(text).replace(/،/g, ",").replace(/\s+/g, " ").trim();
  // الگو: 19 شهریور 1405, 14:02
  const m = latin.match(/(\d{1,2})\s+([\u0600-\u06FF]+)\s+(\d{4})(?:\s*,?\s*(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const day = Number(m[1]);
  const monthName = m[2];
  const year = Number(m[3]);
  const hour = m[4] ? Number(m[4]) : 12;
  const minute = m[5] ? Number(m[5]) : 0;
  const month = JALALI_MONTHS.findIndex((mn) => mn === monthName);
  if (month < 0 || day < 1 || day > 31 || year < 1300 || year > 1500) return null;

  // تبدیل جلالی → میلادی با هسته تست‌شده پروژه
  const [gy, gm, gd] = jalaliToGregorian(year, month + 1, day);
  // دیوار زمان را به وقت ایران (+03:30) نمایش می‌دهد
  const utc = Date.UTC(gy, gm - 1, gd, hour, minute) - 3.5 * 3600 * 1000;
  const dt = new Date(utc);
  return isNaN(dt.getTime()) ? null : dt;
}

/** تجزیه «۴ از ۱۰» طبقه به {floor: 4, total: 10} */
export function parseFloor(text: string | null | undefined): { floor: number; total: number } | null {
  if (!text) return null;
  const latin = toLatinDigits(text);
  const m = latin.match(/(\d+)\s*از\s*(\d+)/);
  if (!m) {
    const single = latin.match(/^(\d+)$/);
    if (single) return { floor: Number(single[1]), total: 0 };
    return null;
  }
  return { floor: Number(m[1]), total: Number(m[2]) };
}

/** ماه‌های فارسی و سال ساخت («۱۳۹۰») */
export function parseBuildYear(text: string | null | undefined): number | null {
  if (!text) return null;
  const latin = toLatinDigits(String(text));
  const m = latin.match(/(13\d{2}|14\d{2})/);
  return m ? Number(m[1]) : null;
}

/** تعداد اتاق از متن («۲» یا «دو») */
const ROOM_WORDS: Record<string, number> = { "بدون اتاق": 0, یک: 1, "۱": 1, دو: 2, "۲": 2, سه: 3, "۳": 3, چهار: 4, "۴": 4, پنج: 5, "۵": 5 };
export function parseRooms(text: string | null | undefined): number | null {
  if (!text) return null;
  const s = text.trim();
  if (ROOM_WORDS[s] !== undefined) return ROOM_WORDS[s];
  const latin = toLatinDigits(s).replace(/\s+/g, " ");
  if (ROOM_WORDS[latin] !== undefined) return ROOM_WORDS[latin];
  const m = latin.match(/(\d)/);
  return m ? Number(m[1]) : null;
}

/** قالب‌بندی تومان با ارقام فارسی (برای نمایش) */
export function formatToman(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  const fa = Math.round(n).toLocaleString("en-US").replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
  return `${fa} تومان`;
}
