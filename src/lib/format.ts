/**
 * قالب‌بندی فارسی — اعداد، مبالغ، تاریخ
 * تمام نمایش عددی اپلیکیشن با ارقام فارسی است (تک‌زبانه: فارسی).
 */

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

/** مبلغ تومانی خوانا: ۲٫۵ میلیارد تومان */
export function faToman(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const faDec = (s: string) => faDigits(s).replace(".", "٫");
  if (n >= 1_000_000_000_000) return `${faDec((n / 1_000_000_000_000).toFixed(1))} همت`;
  if (n >= 1_000_000_000) return `${faDec((n / 1_000_000_000).toFixed(1).replace(/\.0$/, ""))} میلیارد تومان`;
  if (n >= 1_000_000) return `${faNumber(Math.round(n / 1_000_000))} میلیون تومان`;
  return `${faNumber(n)} تومان`;
}

/** عدد با جداکننده هزارگان فارسی */
export function faNumber(n: number): string {
  return faDigits(Math.round(n).toLocaleString("en-US")).replace(/,/g, "٬");
}

/** درصد فارسی */
export function faPercent(n: number): string {
  return `${faDigits(n.toLocaleString("en-US"))}٪`;
}

const FA_MONTHS = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];

/** تاریخ شمسی خوانا از رشته ISO یا Date */
export function faDate(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "—";
  try {
    const fmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year: "numeric", month: "long", day: "numeric" });
    return fmt.format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** تاریخ + ساعت شمسی */
export function faDateTime(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "—";
  try {
    const fmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
    return fmt.format(d);
  } catch {
    return d.toISOString();
  }
}

/** برچسب ماه شمسی از کلید yyyy-mm میلادی */
export function faMonthLabel(isoMonthKey: string): string {
  const [y, m] = isoMonthKey.split("-").map(Number);
  if (!y || !m) return isoMonthKey;
  const solarMonth = (m + 9) % 12;
  const solarYear = y - 621 - (m <= 3 ? 1 : 0);
  return `${FA_MONTHS[solarMonth]} ${faDigits(solarYear)}`;
}

/** فاصله زمانی نسبی فارسی */
export function faRelative(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "امروز";
  if (days < 30) return `${faDigits(days)} روز پیش`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${faDigits(months)} ماه پیش`;
  return `${faDigits(Math.floor(months / 12))} سال پیش`;
}
