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
  // ═══════════════════════════════════════════════════════════════════
  // PN-011 ثانیاً — لایهٔ دومِ خانواده‌های رنگی (۱۲-۲۳): همان خاندان رنگی با
  // تُن پررنگ‌تر (سایه‌های ۶۰۰/۷۰۰). دلیل: قانون مالک «هیچ ستونی دارای موارد
  // تکراری تک‌رنگ نباشد» — ستون «نوع ملک» به‌تنهایی ۲۳ مقدار واقعی دارد
  // (کشف زندهٔ DB) و پالت ۱۲خانه‌ای ریاضیاتِ تمایز کامل را نداشت. تُن دوم
  // اختلاف چشمی واضح می‌دهد (مثلاً emerald-500/15 در برابر emerald-700/20)
  // و ساختار ۱۲متغیرهٔ --sem-* چارت‌ها دست‌نخورده می‌ماند.
  // محدودیت مستند: chartVar تُن‌دوم همان متغیرِ خاندان است؛ اگر روزی دو مقدار
  // هم‌خانواده در «یک نمودار» سری شوند، تمایز چارت نیاز به متغیر تازه دارد.
  // ═══════════════════════════════════════════════════════════════════
  // ۱۲ — سبز تُند (emerald-2)
  { hue: "emerald",
    soft: "bg-emerald-700/20 text-emerald-800 dark:text-emerald-300 border border-emerald-700/40", solid: "bg-emerald-700 text-white border border-emerald-800",
    wrapper: "bg-emerald-700/20", icon: "text-emerald-800 dark:text-emerald-300", chartVar: "var(--sem-emerald)" },
  // ۱۳ — آبی تُند (sky-2)
  { hue: "sky",
    soft: "bg-sky-700/20 text-sky-800 dark:text-sky-300 border border-sky-700/40", solid: "bg-sky-700 text-white border border-sky-800",
    wrapper: "bg-sky-700/20", icon: "text-sky-800 dark:text-sky-300", chartVar: "var(--sem-sky)" },
  // ۱۴ — بنفش تُند (violet-2)
  { hue: "violet",
    soft: "bg-violet-700/20 text-violet-800 dark:text-violet-300 border border-violet-700/40", solid: "bg-violet-700 text-white border border-violet-800",
    wrapper: "bg-violet-700/20", icon: "text-violet-800 dark:text-violet-300", chartVar: "var(--sem-violet)" },
  // ۱۵ — کهربایی تُند (amber-2)
  { hue: "amber",
    soft: "bg-amber-600/25 text-amber-900 dark:text-amber-300 border border-amber-600/45", solid: "bg-amber-600 text-amber-950 border border-amber-700",
    wrapper: "bg-amber-600/25", icon: "text-amber-900 dark:text-amber-300", chartVar: "var(--sem-amber)" },
  // ۱۶ — سرخ تُند (rose-2)
  { hue: "rose",
    soft: "bg-rose-700/20 text-rose-800 dark:text-rose-300 border border-rose-700/40", solid: "bg-rose-700 text-white border border-rose-800",
    wrapper: "bg-rose-700/20", icon: "text-rose-800 dark:text-rose-300", chartVar: "var(--sem-rose)" },
  // ۱۷ — فیروزه‌ای تُند (teal-2)
  { hue: "teal",
    soft: "bg-teal-700/20 text-teal-800 dark:text-teal-300 border border-teal-700/40", solid: "bg-teal-700 text-white border border-teal-800",
    wrapper: "bg-teal-700/20", icon: "text-teal-800 dark:text-teal-300", chartVar: "var(--sem-teal)" },
  // ۱۸ — نیلی تُند (indigo-2)
  { hue: "indigo",
    soft: "bg-indigo-700/20 text-indigo-800 dark:text-indigo-300 border border-indigo-700/40", solid: "bg-indigo-700 text-white border border-indigo-800",
    wrapper: "bg-indigo-700/20", icon: "text-indigo-800 dark:text-indigo-300", chartVar: "var(--sem-indigo)" },
  // ۱۹ — لیمویی تُند (lime-2)
  { hue: "lime",
    soft: "bg-lime-600/25 text-lime-900 dark:text-lime-300 border border-lime-600/45", solid: "bg-lime-600 text-lime-950 border border-lime-700",
    wrapper: "bg-lime-600/25", icon: "text-lime-900 dark:text-lime-300", chartVar: "var(--sem-lime)" },
  // ۲۰ — نارنجی تُند (orange-2)
  { hue: "orange",
    soft: "bg-orange-700/20 text-orange-800 dark:text-orange-300 border border-orange-700/40", solid: "bg-orange-700 text-white border border-orange-800",
    wrapper: "bg-orange-700/20", icon: "text-orange-800 dark:text-orange-300", chartVar: "var(--sem-orange)" },
  // ۲۱ — فیروزه‌ای آبی تُند (cyan-2)
  { hue: "cyan",
    soft: "bg-cyan-700/20 text-cyan-800 dark:text-cyan-300 border border-cyan-700/40", solid: "bg-cyan-700 text-white border border-cyan-800",
    wrapper: "bg-cyan-700/20", icon: "text-cyan-800 dark:text-cyan-300", chartVar: "var(--sem-cyan)" },
  // ۲۲ — سرخابی تُند (fuchsia-2)
  { hue: "fuchsia",
    soft: "bg-fuchsia-700/20 text-fuchsia-800 dark:text-fuchsia-300 border border-fuchsia-700/40", solid: "bg-fuchsia-700 text-white border border-fuchsia-800",
    wrapper: "bg-fuchsia-700/20", icon: "text-fuchsia-800 dark:text-fuchsia-300", chartVar: "var(--sem-fuchsia)" },
  // ۲۳ — خاکستری تُند (stone-2)
  { hue: "stone",
    soft: "bg-stone-700/20 text-stone-800 dark:text-stone-300 border border-stone-700/40", solid: "bg-stone-700 text-white border border-stone-800",
    wrapper: "bg-stone-700/20", icon: "text-stone-800 dark:text-stone-300", chartVar: "var(--sem-stone)" },
];

/**
 * نگاشت قانون‌مند «مقدار شناخته‌شده → اندیس پالت» — رنگ ثابت و مستند:
 *   · خانوادهٔ سبز روشن: فروش · خرید · مبایعه‌نامه (عین نمونهٔ دستور: «رنگ فروش سبز روشن»)
 *   · خانوادهٔ آبی: پیش فروش · پیش خرید · پیش‌فروش
 *   · خانوادهٔ بنفش: رهن و اجاره · اجاره
 *   · شعبه‌های چهارگانه (از سامانهٔ PM): ارتش=سرخ · باغلارباغی=فیروزه‌ای · ملکی تبریزی=نیلی · هتل مرمر=لیمویی
 *   · انواع ملک (۲۳ مقدار واقعی DB — کشف زندهٔ PN-011) و انواع ساختمان و سمت‌های
 *     پرسنلی (۱۸ مقدار واقعی) — «هر مقدار در ستون خود رنگ یکتا دارد» (قانون عدم
 *     تکرار تک‌رنگ در ستون). گارد: tests/pn011-value-colors.test.ts با همین مجموعه‌ها.
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
  // ═══════════════════════════════════════════════════════════════════
  // PN-011 ثانیاً — انواع ملک (ستون نوع ملک M1/M2 — ۲۳ مقدار واقعی DB؛
  // خانه‌ها دوتایی‌شده تا «هیچ دو مقدار هم‌رنگ در یک ستون» نباشد):
  //   پرمتداول‌ها (۹۹٪ ردیف‌ها) همه در خاندان‌های چشمی «متفاوت» — بدون جفتِ
  //   تُن-۱/تُن-۲ در میان پرمتداول‌ها؛ دنبالهٔ کمیاب در خانه‌های تُن‌دوم.
  // ═══════════════════════════════════════════════════════════════════
  "آپارتمان": 5, // ۲۸٬۰۰۰+ ردیف — فیروزه‌ای
  "خانه،حیاط،ویلایی": 8, // ۱٬۹۰۰ — نارنجی
  "مغازه": 4, // ۷۷۰ — سرخ
  "زمین یا ملک کلنگی": 10, // ۱٬۳۵۰ — سرخابی
  "دفترکار": 6, "دفتر کار": 6, // ۴۹۰ — نیلی
  "ساختمان": 9, // ۲۳۰ — فیروزه‌ای آبی
  "خانه،حیاط": 13, // ۶۸ — آبی تُند
  "زیرزمین": 23, // ۶۱ — خاکستری تُند
  "ویلا": 7, // ۲۶ — لیمویی
  "زمین": 12, // ۴۲ (با نرمال‌سازی فاصله) — سبز تُند
  "زمین تجاری": 16, "زمین های تجاری": 16, // سرخ تُند
  "زمین خدماتی تجاری": 21, // فیروزه‌ای آبی تُند
  "کارخانه": 18, // نیلی تُند
  "زمین خدماتی": 22, // سرخابی تُند
  "کارگاه": 19, // لیمویی تُند
  "سوله": 17, // فیروزه‌ای تُند
  "باغ": 20, // نارنجی تُند
  "پاساژ": 14, // بنفش تُند
  "هتل": 15, // کهربایی تُند
  "انباری": 11, // خاکستری
  "گلخانه": 0, // سبز (شعری: گلخانه=سبز)
  "پرورش ماهی": 2, // بنفش
  "جایگاه سوخت": 3, // کهربایی
  // انواع ساختمان (ستون نوع ساختمان M2 — مقادیر واقعی DB)
  "مسکونی": 0, "اداری": 1, "مسکونی-اداری": 3,
  "تجاری-خدماتی": 4, "مسکونی با تجاری": 12, "باغ و ویلا": 7, "صنعتی": 18, "مزروعی-کشاورزی": 19, "دامداری-شیلات": 21,
  // ═══════════════════════════════════════════════════════════════════
  // PN-020/گام اول-ب — جهات ملک (ستون جهت/سمت M2 — ۱۱ مقدار واقعی DB؛
  // دستور مالک: «ستون فوریت و ستون سمت و ستون نوع ساخت به صورت رنگی شود» —
  // هر جهت رنگ یکتای خود را دارد؛ شمال=آسمان، جنوب=سبز، عین نقشهٔ جغرافیایی)
  // ═══════════════════════════════════════════════════════════════════
  "شمال": 1, "جنوب": 0, "شرق": 2, "غرب": 4,
  "شمال غربی": 6, "شمال شرقی": 5, "جنوب غربی": 3, "جنوب شرقی": 9,
  "شمالی-جنوبی": 10, "شرقی-غربی": 8, "سه‌در": 7,
  // انواع ساخت (ستون نوع ساخت M2 — ۳ مقدار واقعی DB: شخصی/مجتمع/برج)
  "شخصی": 0, "مجتمع": 2, "برج": 9,
  // فوریت درخواست (ستون فوریت M2 — فوری نارنجیِ معنایی · عادی خاکستریِ بی‌طرف)
  "فوری": 8, "عادی": 11,
  // ═══════════════════════════════════════════════════════════════════
  // جلسهٔ ۰۳۳ (دستور مالک — ثانیاً/الف) — اسناد ملک (ستون سند M2 — ۵ مقدار
  // واقعی DB؛ هر سند رنگ یکتای خود را دارد؛ «golname» همان قولنامه با املاای
  // لاتین سامانهٔ مبدأ است ⇒ هم‌رنگِ معنایی آن — الگوی «دفتر کار/دفترکار»):
  //   شش‌دانگ=سبز (مالکیت کامل) · در دست اقدام=نارنجی (در جریان) ·
  //   قراردادی=بنفش (قرارداد رسمی) · قولنامه=آبی (توافق اولیه)
  // ═══════════════════════════════════════════════════════════════════
  "شش‌دانگ": 0, "در دست اقدام": 8, "قراردادی": 2, "قولنامه": 1, "golname": 1,
  // ═══════════════════════════════════════════════════════════════════
  // PN-020/گام اول-ج — وضعیت‌های معامله (ستون وضعیت معامله M3 — برچسب‌های
  // فارسی سامانه مبدأ؛ تکمیل=سبز · فسخ/حذف=سرخ · انتظار=کهربایی)
  // ═══════════════════════════════════════════════════════════════════
  "تکمیل شده": 0,
  "فسخ شده": 4, "حذف شده توسط مالی": 16,
  "در انتظار افزودن مشاور": 3, "در انتظار تایید مشاوران": 15, "در انتظار تایید مالی": 8,
  "پیش‌نویس": 11, "در مبدأ یافت نشد": 23,
  // ═══════════════════════════════════════════════════════════════════
  // PN-011 ثانیاً — سمت‌های پرسنلی (ستون سمت M4 — ۱۸ مقدار واقعی DB؛
  // خانه‌ها دوتایی درون همین ستون)
  // ═══════════════════════════════════════════════════════════════════
  "کارشناس و مشاور فروش": 5, "مشاور فروش": 0, "مشاور ارشد فروش": 8,
  "کارشناس فروش": 1, "مدیر فایل و crm": 6, "کارشناس برنامه نویس": 9,
  "مدیر قرارداد": 2, "مسئول خدمات": 10, "کارشناس نظارت بر سیستم": 7,
  "مدیر شعبه": 16, "کارشناس شبکه های مجـازی": 13, "کارشناس تولید محتوا": 17,
  "مسئول پشتیبانی": 14, "مسئول هماهنگی": 19, "مسئول امور قراردادها": 22,
  "مدیر مالی": 18, "مدیر فناوری": 20, "مدیر بازرگانی": 15,
  // سایر
  "ثبت‌نشده": 11, "تعیین نشده": 11,
};

/**
 * اندیس پالت برای مقدار — قانون‌مند؛ ناشناخته: هش پایدار FNV-1a.
 * PN-011: نرمال‌سازی فاصله‌های ابتدا/انتها (دادهٔ واقعی DB دارای «زمین » و
 * «ساختمان » است — بدون trim دو مقدارِ یکی دو رنگ می‌گرفتند).
 */
function paletteIndexFor(value: string): number {
  const v = value.trim();
  const known = CANONICAL[v];
  if (typeof known === "number") return known;
  let h = 0x811c9dc5;
  for (let i = 0; i < v.length; i++) {
    h ^= v.charCodeAt(i);
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
