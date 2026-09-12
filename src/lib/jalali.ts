/**
 * تقویم هجری شمسی (جلالی) — هسته مشترک کل اپلیکیشن
 * ------------------------------------------------------
 * تمام محاسبات، قالب‌بندی و اجزای تقویم شمسی از این ماژول استفاده
 * می‌کنند (تک‌منبع حقیقت). این ماژول «خالص» است: هیچ وابستگی به
 * سرور یا کلاینت ندارد و در هر دو محیط قابل استفاده است.
 *
 * الگوریتم تبدیل: روش استاندارد جلالی↔میلادی (کیک‌جبر دوطرفه).
 * مبنای زمانی: زمان محلی کاربر برای نمایش، و UTC برای ISO.
 */

// ===================== نام‌ها =====================

/** نام ماه‌های هجری شمسی */
export const JALALI_MONTHS = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
] as const;

/** نام روزهای هفته — شنبه اولین روز هفته ایرانی است */
export const JALALI_WEEKDAYS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"] as const;

/** حروف اختصاری روزهای هفته برای سربرگ تقویم */
export const JALALI_WEEKDAYS_SHORT = ["ش", "ی", "د", "س", "چ", "پ", "ج"] as const;

// ===================== تبدیل تاریخ =====================

/** میلادی → جلالی (سال، ماه، روز) */
export function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = gy <= 1600 ? 0 : 979;
  gy -= gy <= 1600 ? 621 : 1600;
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    365 * gy +
    Math.floor((gy2 + 3) / 4) -
    Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400) -
    80 +
    gd +
    g_d_m[gm - 1];
  jy += 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return [jy, jm, jd];
}

/** جلالی → میلادی (سال، ماه، روز) */
export function jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number] {
  let gy = jy <= 979 ? 621 : 1600;
  jy -= jy <= 979 ? 0 : 979;
  let days =
    365 * jy +
    Math.floor(jy / 33) * 8 +
    Math.floor(((jy % 33) + 3) / 4) +
    78 +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  gy += 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const sal_a = [
    0,
    31,
    (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  let gm = 0;
  while (gm < 13 && gd > sal_a[gm]) {
    gd -= sal_a[gm];
    gm++;
  }
  return [gy, gm, gd];
}

/** سال کبیسه جلالی است؟ (برای طول اسفند) */
export function isJalaliLeap(jy: number): boolean {
  // الگوریتم ۳۳ ساله با باقیمانده‌های کبیسه ۱، ۵، ۹، ۱۳، ۱۷، ۲۲، ۲۶، ۳۰
  const r = jy % 33;
  return [1, 5, 9, 13, 17, 22, 26, 30].includes(r);
}

/** طول ماه جلالی (۳۱ برای ۶ ماه اول، ۳۰ برای ۵ ماه بعد، ۲۹/۳۰ اسفند) */
export function jalaliMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isJalaliLeap(jy) ? 30 : 29;
}

// ===================== انواع کمکی =====================

/** تاریخ جلالی به‌همراه روز هفته (۰ = شنبه) */
export interface JalaliDate {
  jy: number;
  jm: number;
  jd: number;
  /** ۰ = شنبه … ۶ = جمعه */
  weekday: number;
}

/** تبدیل Date به JalaliDate (بر پایه زمان محلی) */
export function dateToJalali(d: Date): JalaliDate {
  const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  // getDay(): ۰=یکشنبه…۶=شنبه → نگاشت به ۰=شنبه…۶=جمعه
  const weekday = (d.getDay() + 1) % 7;
  return { jy, jm, jd, weekday };
}

/** ساخت Date میلادی از مختصات جلالی (بدون ساعت — زمان محلی) */
export function jalaliToDate(jy: number, jm: number, jd: number): Date {
  const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd);
  return new Date(gy, gm - 1, gd, 12, 0, 0, 0);
}

/** تاریخ امروز به جلالی */
export function todayJalali(): JalaliDate {
  return dateToJalali(new Date());
}

// ===================== قالب‌بندی =====================

const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

/** تبدیل ارقام لاتین به فارسی */
export function faDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

/** تبدیل ارقام فارسی/عربی به لاتین (برای ورودی کاربر) */
export function enDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

/** دو رقمی با صفر پیشوند */
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** برچسب ماه جلالی از ISO/Date: «شهریور ۱۴۰۵» */
export function faJalaliMonthLabel(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "—";
  return jalaliMonthLabelOf(d);
}

/** جلالی خوانا: «۲۱ شهریور ۱۴۰۵» */
export function formatJalaliLong(j: JalaliDate): string {
  return `${faDigits(j.jd)} ${JALALI_MONTHS[j.jm - 1]} ${faDigits(j.jy)}`;
}

/** جلالی کوتاه: «۱۴۰۵/۰۶/۲۱» */
export function formatJalaliShort(j: JalaliDate): string {
  return faDigits(`${j.jy}/${pad2(j.jm)}/${pad2(j.jd)}`);
}

/** جلالی کوتاه با ساعت: «۱۴۰۵/۰۶/۲۱ — ۱۴:۳۰» */
export function formatJalaliShortDateTime(d: Date): string {
  const j = dateToJalali(d);
  return `${formatJalaliShort(j)} — ${faDigits(pad2(d.getHours()))}:${faDigits(pad2(d.getMinutes()))}`;
}

/** جلالی خوانا + ساعت: «۲۱ شهریور ۱۴۰۵ — ساعت ۱۴:۳۰» */
export function formatJalaliLongDateTime(d: Date): string {
  const j = dateToJalali(d);
  return `${formatJalaliLong(j)} — ساعت ${faDigits(pad2(d.getHours()))}:${faDigits(pad2(d.getMinutes()))}`;
}

/** ISO/Date → رشته جلالی «YYYY/MM/DD» برای پارامترهای API سامانه ملک تبریز */
export function isoToJalaliString(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "";
  const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return `${jy}/${pad2(jm)}/${pad2(jd)}`;
}

/**
 * تاریخ ورودی سامانه (جلالی «YYYY/MM/DD» یا ISO) → Date میلادی (زمان محلی ظهر)
 * ارقام فارسی/عربی هم پذیرفته می‌شوند.
 */
export function anyDateStringToDate(input: unknown): Date | null {
  if (input === null || input === undefined) return null;
  let s = String(input).trim();
  if (!s) return null;
  s = s
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  s = s.replace(/[-.]/g, "/");

  if (/\d{4}-\d{2}-\d{2}T/.test(String(input))) {
    const d = new Date(String(input));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const parts = s.split("/").map((p) => Number(p));
  if (parts.length < 3 || parts.some((p) => !Number.isFinite(p))) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const [y, m, dd] = parts;
  if (y > 1300 && y < 1600) {
    // جلالی
    return jalaliToDate(y, m, dd);
  }
  return new Date(y, m - 1, dd, 12, 0, 0, 0);
}

/** برچسب ماه جلالی از تاریخ ISO: «شهریور ۱۴۰۵» */
export function jalaliMonthLabelOf(d: Date): string {
  const j = dateToJalali(d);
  return `${JALALI_MONTHS[j.jm - 1]} ${faDigits(j.jy)}`;
}

// ===================== تقویم ماهانه (برای کامپوننت انتخاب تاریخ) =====================

export interface JalaliMonthCell {
  jd: number;
  /** ۰ = شنبه … ۶ = جمعه */
  weekday: number;
  /** در ماه نمایشی جاری نیست (روز ماه قبل/بعد) */
  inMonth: boolean;
  /** تاریخ میلادی متناظر برای مقایسه */
  date: Date;
  /** امروز است؟ */
  isToday: boolean;
}

/** سلول‌های نمایشی یک ماه جلالی (۴۲ سلول = ۶ هفته؛ شروع از شنبه) */
export function buildJalaliMonthGrid(jy: number, jm: number): JalaliMonthCell[] {
  const today = todayJalali();
  const firstDate = jalaliToDate(jy, jm, 1);
  // ستون شروع: ۰=شنبه
  const startOffset = (firstDate.getDay() + 1) % 7;
  const cells: JalaliMonthCell[] = [];
  const len = jalaliMonthLength(jy, jm);
  // روزهای ماه قبل برای پرکردن هفته اول
  const prevMonth = jm === 1 ? { jy: jy - 1, jm: 12 } : { jy, jm: jm - 1 };
  const prevLen = jalaliMonthLength(prevMonth.jy, prevMonth.jm);
  for (let i = startOffset - 1; i >= 0; i--) {
    const jd = prevLen - i;
    const date = jalaliToDate(prevMonth.jy, prevMonth.jm, jd);
    cells.push({ jd, weekday: cells.length % 7, inMonth: false, date, isToday: false });
  }
  // روزهای ماه جاری
  for (let jd = 1; jd <= len; jd++) {
    const date = jalaliToDate(jy, jm, jd);
    cells.push({
      jd,
      weekday: cells.length % 7,
      inMonth: true,
      date,
      isToday: today.jy === jy && today.jm === jm && today.jd === jd,
    });
  }
  // روزهای ماه بعد تا تکمیل ۶ هفته
  const nextMonth = jm === 12 ? { jy: jy + 1, jm: 1 } : { jy, jm: jm + 1 };
  let nextJd = 1;
  while (cells.length < 42) {
    const date = jalaliToDate(nextMonth.jy, nextMonth.jm, nextJd);
    cells.push({ jd: nextJd, weekday: cells.length % 7, inMonth: false, date, isToday: false });
    nextJd += 1;
  }
  return cells;
}
