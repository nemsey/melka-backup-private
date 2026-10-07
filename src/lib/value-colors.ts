/**
 * رجیستری رنگ معنایی ملکا — منبع یگانهٔ حقیقت (Single Source of Truth)
 * ---------------------------------------------------------------------------
 * PN-009 مرحله B (دستور مالک — بازطراحی بصری M1/M2/M3/M4 + یادداشت معماری):
 *   semantic value → Color Registry → { Light, Dark } → Filter / List / Chart / Badge
 *
 * قواعد عین دستور مالک:
 *   نکته ۱: «آیتم هایی که دارای موارد چندگانه هستند می‌بایست دارای رنگ متمایز در هر
 *   مورد باشند و رنگها تکراری نباشند» — هر «مقدار» رنگ متمایز و پایدار دارد.
 *   نکته ۳: «رنگهای موارد آیتم ها در یک فیلتر با هم متفاوت باشند» — تنوع درون‌آیتمی.
 *   نکته ۴: «همسان بودن رنگ هر مورد فیلتر در فهرست نیز رعایت شود» — همان تابع در
 *   دکمهٔ فیلتر و نشان (Badge) ستون فهرست استفاده می‌شود ⇒ هارمونی تضمینی.
 *   قانون ۱۲: هیچ کامپوننت مستقلی حق ندارد برای یک مقدار semantic رنگ دیگری انتخاب کند.
 *
 * طراحی: نگاشت قانون‌مند «مقدار شناخته‌شده → خانهٔ پالت» (خانواده‌های معنایی هم‌رنگ:
 * فروش/خرید/مبایعه‌نامه = سبز روشن؛ اجاره‌ها = بنفش) + پالت ۱۲رنگه برای مقادیر تازه
 * (تخصیص قطعی با هش پایدار FNV-1a). خروجی: کلاس Tailwind کامل (bg/text/border +
 * حالت dark) و متغیر CSS چارت — بدون هیچ وابستگی.
 *
 * PN-009: رنگ «وضعیت‌ها» (M1 ده‌حالته / M2 شش‌حالته) که پیش‌تر به‌صورت محلی در
 * فایل‌های صفحه نگهداری می‌شدند، به همین رجیستری منتقل شدند (listingStateBadgeClass /
 * requestStateBadgeClass) تا هر تغییری در کل اپلیکیشن هم‌زمان اعمال شود.
 */

/** رکورد خانهٔ پالت — همهٔ خروجی‌های رنگی یک خانوادهٔ معنایی */
interface PaletteEntry {
  /** نام خانوادهٔ رنگ (مستندسازی + نام متغیر CSS چارت) */
  hue: string;
  /** پس‌زمینهٔ ملایم — Badge ستون فهرست + دکمهٔ غیرفعال فیلتر */
  soft: string;
  /** پس‌زمینهٔ پررنگ — دکمهٔ فعال فیلتر */
  solid: string;
  /** پس‌زمینهٔ ملایم آیکون (KPI / نماد بدون متن) */
  wrapper: string;
  /** رنگ آیکون/متن روی پس‌زمینهٔ ملایم */
  icon: string;
  /** متغیر CSS رنگ چارت — نسخهٔ Light/Dark در globals.css (--sem-*) */
  chartVar: string;
}

/** پالت ۱۲رنگهٔ متمایز — هم‌خانواده‌های چشمی جدا شده‌اند */
const PALETTE: readonly PaletteEntry[] = [
  // ۰ — سبز روشن (emerald): خانوادهٔ فروش (عین نمونهٔ دستور مالک)
  { hue: "emerald",
    soft: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30", solid: "bg-emerald-500 text-white border border-emerald-600",
    wrapper: "bg-emerald-500/15", icon: "text-emerald-700 dark:text-emerald-300", chartVar: "var(--sem-emerald)" },
  // ۱ — آبی روشن (sky): خانوادهٔ پیش‌فروش/پیش‌خرید
  { hue: "sky",
    soft: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30", solid: "bg-sky-500 text-white border border-sky-600",
    wrapper: "bg-sky-500/15", icon: "text-sky-700 dark:text-sky-300", chartVar: "var(--sem-sky)" },
  // ۲ — بنفش (violet): خانوادهٔ اجاره
  { hue: "violet",
    soft: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border border-violet-500/30", solid: "bg-violet-500 text-white border border-violet-600",
    wrapper: "bg-violet-500/15", icon: "text-violet-700 dark:text-violet-300", chartVar: "var(--sem-violet)" },
  // ۳ — کهربایی (amber): مشارکت در ساخت
  { hue: "amber",
    soft: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30", solid: "bg-amber-500 text-amber-950 border border-amber-600",
    wrapper: "bg-amber-500/15", icon: "text-amber-700 dark:text-amber-300", chartVar: "var(--sem-amber)" },
  // ۴ — سرخ روشن (rose)
  { hue: "rose",
    soft: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30", solid: "bg-rose-500 text-white border border-rose-600",
    wrapper: "bg-rose-500/15", icon: "text-rose-700 dark:text-rose-300", chartVar: "var(--sem-rose)" },
  // ۵ — فیروزه‌ای (teal)
  { hue: "teal",
    soft: "bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/30", solid: "bg-teal-500 text-white border border-teal-600",
    wrapper: "bg-teal-500/15", icon: "text-teal-700 dark:text-teal-300", chartVar: "var(--sem-teal)" },
  // ۶ — نیلی (indigo)
  { hue: "indigo",
    soft: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30", solid: "bg-indigo-500 text-white border border-indigo-600",
    wrapper: "bg-indigo-500/15", icon: "text-indigo-700 dark:text-indigo-300", chartVar: "var(--sem-indigo)" },
  // ۷ — لیمویی (lime)
  { hue: "lime",
    soft: "bg-lime-500/20 text-lime-800 dark:text-lime-300 border border-lime-500/40", solid: "bg-lime-500 text-lime-950 border border-lime-600",
    wrapper: "bg-lime-500/20", icon: "text-lime-800 dark:text-lime-300", chartVar: "var(--sem-lime)" },
  // ۸ — نارنجی (orange)
  { hue: "orange",
    soft: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-500/30", solid: "bg-orange-500 text-white border border-orange-600",
    wrapper: "bg-orange-500/15", icon: "text-orange-700 dark:text-orange-300", chartVar: "var(--sem-orange)" },
  // ۹ — آبی فیروزه‌ای (cyan)
  { hue: "cyan",
    soft: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30", solid: "bg-cyan-500 text-cyan-950 border border-cyan-600",
    wrapper: "bg-cyan-500/15", icon: "text-cyan-700 dark:text-cyan-300", chartVar: "var(--sem-cyan)" },
  // ۱۰ — سرخابی (fuchsia)
  { hue: "fuchsia",
    soft: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 border border-fuchsia-500/30", solid: "bg-fuchsia-500 text-white border border-fuchsia-600",
    wrapper: "bg-fuchsia-500/15", icon: "text-fuchsia-700 dark:text-fuchsia-300", chartVar: "var(--sem-fuchsia)" },
  // ۱۱ — خاکستری (stone)
  { hue: "stone",
    soft: "bg-stone-500/15 text-stone-700 dark:text-stone-300 border border-stone-500/30", solid: "bg-stone-500 text-white border border-stone-600",
    wrapper: "bg-stone-500/15", icon: "text-stone-700 dark:text-stone-300", chartVar: "var(--sem-stone)" },
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

/** متغیر CSS رنگ چارت یک مقدار — برای سری‌های نمودار (نسخهٔ Light/Dark در globals.css) */
export function valueChartVar(value: string): string {
  return PALETTE[paletteIndexFor(value)].chartVar;
}

/** نام خانوادهٔ رنگ یک مقدار (مستندسازی/تست) */
export function valueHue(value: string): string {
  return PALETTE[paletteIndexFor(value)].hue;
}

/** جفت کلاس آیکون معنایی — KPI/نماد بدون متن (پس‌زمینهٔ ملایم + رنگ آیکون) */
export function valueIconPair(value: string): { wrapper: string; icon: string } {
  const e = PALETTE[paletteIndexFor(value)];
  return { wrapper: e.wrapper, icon: e.icon };
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

// ============================================================================
// رنگ وضعیت‌ها — PN-009 مرحله B: مهاجرت از فایل‌های صفحه به رجیستری یگانه
// (قانون ۱۲ دستور: Color Mapping تک‌منبعی؛ رنگ وضعیت در فیلتر/بینش/ستون یکی است)
// ============================================================================

/**
 * رنگ Badge وضعیت آگهی (M1 — ده‌حالته) — کلیدواژهٔ بصری ثابت در فیلتر/ستون/بینش.
 * هماهنگ با خانواده‌های پالت: معامله=فیروزه‌ای، منتشر=سبز، خصوصی=سرخابی، انقضا=کهربایی،
 * رد مدیر=سرخ، در انتظار مدیر=بنفش، در انتظار کارشناس=آبی، بازبینی=نارنجی، قابل بازیافت=لیمویی، غیرقابل بازیافت=خاکستری.
 */
export const LISTING_STATE_BADGE_CLASS: Readonly<Record<string, string>> = {
  traded: "bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30",
  published: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  private: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/30",
  expired: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  rejectedByAdmin: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
  pendingAdmin: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30",
  pendingConsultant: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
  pendingReview: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30",
  recoverable: "bg-lime-500/20 text-lime-800 dark:text-lime-300 border-lime-500/40",
  unrecoverable: "bg-stone-500/15 text-stone-700 dark:text-stone-300 border-stone-500/30",
};

/**
 * رنگ Badge وضعیت درخواست (M2 — شش‌حالته) — همان قواعد M1 برای مقادیر مشترک
 * (معامله=فیروزه‌ای) تا هویت رنگی یک مقدار در هر دو فهرست یکی باشد.
 */
export const REQUEST_STATE_BADGE_CLASS: Readonly<Record<string, string>> = {
  traded: "bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30",
  pendingTrade: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  lead: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
  pendingApproval: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30",
  lostToCompetitors: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
  other: "bg-stone-500/15 text-stone-700 dark:text-stone-300 border-stone-500/30",
};

/** رنگ Badge وضعیت آگهی با کلید — ناشناخته: خنثی (بدون شکستن رندر) */
export function listingStateBadgeClass(key: string | null | undefined): string {
  return (key && LISTING_STATE_BADGE_CLASS[key]) || "bg-muted/60 text-muted-foreground border-border";
}

/** رنگ Badge وضعیت درخواست با کلید — ناشناخته: خنثی (بدون شکستن رندر) */
export function requestStateBadgeClass(key: string | null | undefined): string {
  return (key && REQUEST_STATE_BADGE_CLASS[key]) || "bg-muted/60 text-muted-foreground border-border";
}

/** جفت کلاس آیکون وضعیت آگهی (KPI/بینش M1) */
export function listingStateIconPair(key: string): { wrapper: string; icon: string } {
  const e = PALETTE.find((p) => LISTING_STATE_BADGE_CLASS[key]?.includes(`${p.hue}-500/`));
  return e ? { wrapper: e.wrapper, icon: e.icon } : { wrapper: "bg-muted", icon: "text-muted-foreground" };
}

/** جفت کلاس آیکون وضعیت درخواست (KPI/بینش M2) */
export function requestStateIconPair(key: string): { wrapper: string; icon: string } {
  const e = PALETTE.find((p) => REQUEST_STATE_BADGE_CLASS[key]?.includes(`${p.hue}-500/`));
  return e ? { wrapper: e.wrapper, icon: e.icon } : { wrapper: "bg-muted", icon: "text-muted-foreground" };
}
