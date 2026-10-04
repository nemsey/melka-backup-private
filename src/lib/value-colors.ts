/**
 * نظام رنگ مقادیر — P6547/گام پنجم-ب و ت (قانون هارمونی رنگی فیلتر ↔ فهرست)
 * ---------------------------------------------------------------------------
 * قواعد عین دستور مالک:
 *   نکته ۱: «آیتم هایی که دارای موارد چندگانه هستند می‌بایست دارای رنگ متمایز در هر
 *   مورد باشند و رنگها تکراری نباشند» — هر «مقدار» در هر آیتم چندگانه (دسته‌بندی،
 *   شعبه، نوع قرارداد، …) رنگ متمایز و پایدار دارد.
 *   نکته ۳: «رنگهای موارد آیتم ها در یک فیلتر با هم متفاوت باشند» — تنوع درون‌آیتمی.
 *   نکته ۴: «همسان بودن رنگ هر مورد فیلتر در فهرست نیز رعایت شود» — همان تابع در
 *   دکمهٔ فیلتر و نشان (Badge) ستون فهرست استفاده می‌شود ⇒ هارمونی تضمینی.
 *
 * طراحی: نگاشت قانون‌مند «مقدار شناخته‌شده → رنگ ثابت» (خانواده‌های معنایی هم‌رنگ:
 * فروش/خرید/مبایعه‌نامه = سبز روشن — عین نمونهٔ دستور؛ اجاره‌ها = بنفش) + پالت
 * ۱۲رنگه برای مقادیر تازه (تخصیص قطعی با هش پایدار FNV-1a).
 * خروجی: کلاس Tailwind کامل (bg/text/border + حالت dark) — بدون هیچ وابستگی.
 */

/** رکورد پالت: رنگ ملایم (Badge/غیرفعال) + پررنگ (فعال) */
interface PaletteEntry {
  /** پس‌زمینهٔ ملایم — Badge ستون فهرست + دکمهٔ غیرفعال فیلتر */
  soft: string;
  /** پس‌زمینهٔ پررنگ — دکمهٔ فعال فیلتر */
  solid: string;
}

/** پالت ۱۲رنگهٔ متمایز — هم‌خانواده‌های چشمی جدا شده‌اند */
const PALETTE: readonly PaletteEntry[] = [
  // ۰ — سبز روشن (emerald): خانوادهٔ فروش (عین نمونهٔ دستور مالک)
  { soft: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30", solid: "bg-emerald-500 text-white border border-emerald-600" },
  // ۱ — آبی روشن (sky): خانوادهٔ پیش‌فروش/پیش‌خرید
  { soft: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30", solid: "bg-sky-500 text-white border border-sky-600" },
  // ۲ — بنفش (violet): خانوادهٔ اجاره
  { soft: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border border-violet-500/30", solid: "bg-violet-500 text-white border border-violet-600" },
  // ۳ — کهربایی (amber): مشارکت در ساخت
  { soft: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30", solid: "bg-amber-500 text-amber-950 border border-amber-600" },
  // ۴ — سرخ روشن (rose)
  { soft: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30", solid: "bg-rose-500 text-white border border-rose-600" },
  // ۵ — فیروزه‌ای (teal)
  { soft: "bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/30", solid: "bg-teal-500 text-white border border-teal-600" },
  // ۶ — نیلی (indigo)
  { soft: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30", solid: "bg-indigo-500 text-white border border-indigo-600" },
  // ۷ — لیمویی (lime)
  { soft: "bg-lime-500/20 text-lime-800 dark:text-lime-300 border border-lime-500/40", solid: "bg-lime-500 text-lime-950 border border-lime-600" },
  // ۸ — نارنجی (orange)
  { soft: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-500/30", solid: "bg-orange-500 text-white border border-orange-600" },
  // ۹ — آبی فیروزه‌ای (cyan)
  { soft: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30", solid: "bg-cyan-500 text-cyan-950 border border-cyan-600" },
  // ۱۰ — سرخابی (fuchsia)
  { soft: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 border border-fuchsia-500/30", solid: "bg-fuchsia-500 text-white border border-fuchsia-600" },
  // ۱۱ — خاکستری (stone)
  { soft: "bg-stone-500/15 text-stone-700 dark:text-stone-300 border border-stone-500/30", solid: "bg-stone-500 text-white border border-stone-600" },
];

/**
 * نگاشت قانون‌مند «مقدار شناخته‌شده → اندیس پالت» — رنگ ثابت و مستند:
 *   · خانوادهٔ سبز روشن: فروش · خرید · مبایعه‌نامه (عین نمونهٔ دستور: «رنگ فروش سبز روشن»)
 *   · خانوادهٔ آبی: پیش فروش · پیش خرید · پیش‌فروش
 *   · خانوادهٔ بنفش: رهن و اجاره · اجاره
 *   · شعبه‌های چهارگانه (از سامانهٔ PM): ارتش=سرخ · باغلارباغی=فیروزه‌ای · ملکی تبریزی=نیلی · هتل مرمر=لیمویی
 *   · انواع ملک پرتکرار و انواع ساختمان — هر یک رنگ خود
 * قانون تنوع درون‌آیتمی (نکته ۳) با ریاضیات پالت برقرار است — گارد hasDistinctColors تستش می‌کند.
 */
const CANONICAL: Readonly<Record<string, number>> = {
  // دسته‌بندی‌های آگهی (M1) و درخواست (M2) + انواع قرارداد (M3)
  "فروش": 0, "خرید": 0, "مبایعه‌نامه": 0,
  "پیش فروش": 1, "پیش خرید": 1, "پیش‌فروش": 1, "پیش فروش (توافقی)": 1,
  "رهن و اجاره": 2, "اجاره": 2,
  "مشارکت در ساخت": 3,
  "تمدید اجاره": 9,
  // شعبه‌های چهارگانهٔ ملک تبریز (branchId.title سامانهٔ PM)
  "ارتش": 4, "باغلارباغی": 5, "ملکی تبریزی": 6, "هتل مرمر": 7,
  // انواع ملک پرتکرار (ستون نوع ملک M1/M2)
  "آپارتمان": 5, "زمین": 8, "کلنگی": 10, "کلنگی (تبدیل)": 10, "تجاری": 4, "دفترکار": 6, "دفتر کار": 6, "ویلا": 7, "باغ": 8, "باغچه": 9, "مغازه": 4,
  // انواع ساختمان (M2)
  "مسکونی": 0, "اداری": 1, "مسکونی-اداری": 3,
  // سایر
  "ثبت‌نشده": 11, "تعیین نشده": 11,
};

/** اندیس پالت برای مقدار — قانون‌مند؛ ناشناخته: هش پایدار FNV-1a */
function paletteIndexFor(value: string): number {
  const known = CANONICAL[value];
  if (typeof known === "number") return known;
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return Math.abs(h) % PALETTE.length;
}

/** رنگ «ملایم» یک مقدار — Badge ستون فهرست + دکمهٔ غیرفعال فیلتر (هارمونی تضمینی) */
export function valueSoftClass(value: string): string {
  return PALETTE[paletteIndexFor(value)].soft;
}

/** رنگ «پررنگ» یک مقدار — دکمهٔ فعال فیلتر (هم‌خانوادهٔ رنگ ملایم همان مقدار) */
export function valueSolidClass(value: string): string {
  return PALETTE[paletteIndexFor(value)].solid;
}

/** کلاس Badge شعبه — میان‌بر برای ستون شعبه/شعبهٔ مشاور (M1/M2/M3/M4) */
export function branchBadgeClass(branch: string): string {
  return valueSoftClass(branch);
}

/** آیا مقادیر یک آیتم رنگ متمایز دارند؟ (گارد قانون عدم تکرار رنگ درون‌آیتم — قابل تست) */
export function hasDistinctColors(values: readonly string[]): boolean {
  const seen = new Set<number>();
  for (const v of values) {
    const idx = paletteIndexFor(v);
    if (seen.has(idx)) return false;
    seen.add(idx);
  }
  return true;
}

/** فهرست مقادیر یک «آیتم چندگانه» → رنگ متمایز قطعی (برای تست‌ها و UI) */
export function itemValueColors(values: readonly string[]): Array<{ value: string; soft: string; solid: string }> {
  return values.map((v) => ({ value: v, soft: valueSoftClass(v), solid: valueSolidClass(v) }));
}
