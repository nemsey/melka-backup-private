/**
 * هویت «نگین» — سیستم طراحی گوهرین ملکا — PN-024 (ملکا-شورا-ن۰۳۱-۱۴۰۵)
 * ---------------------------------------------------------------------------
 * «هر کاشی، یک نگین، یک احساس روانی.»
 *
 * نگین = لایهٔ درخشان رویی روی نظام فیروزه‌ای موجود (۱۳ بخش · پالت ۲۴-خانه‌ای
 * PN-011). قواعد ساختاری (قانون ۶ سفارش):
 *   ۱) صفر تغییر در --sec-* موجود (تست p6530 سبز می‌ماند)
 *   ۲) صفر تغییر در value-colors.ts (رنگ CANONICAL: فروش=سبز · اجاره=بنفش)
 *   ۳) ۱۱ نگین متمایز — نگاشت یکتا کاشی→نگین
 *   ۴) مروارید روشن است؛ متن همیشه ۷۰۰ تیره — WCAG AA حفظ می‌شود
 *
 * این فایل منبع یگانهٔ حقیقت نگین است: globals.css و TileCard و گارد
 * audit-negin-consistency همه از این‌جا تغذیه می‌شوند.
 */

/** رکورد یک نگین (گوهر) */
export interface NeginGem {
  /** شناسهٔ پایدار — kebab-case لاتین */
  id: string;
  /** نام فارسی گوهر */
  fa: string;
  /** کلید accent کاشی در SECTION_ACCENTS (نگاشت زیر) */
  accentKey: string;
  /** عنوان کاشی (برای گواه) */
  tileTitle: string;
  /** شعاع احساسی — روانشناسی رنگ */
  feeling: string;
  /** خانهٔ پالت روشن — ۵۰۰ عین مصوبهٔ جلسهٔ ۰۳۱ مالک */
  light: { "50": string; "200": string; "400": string; "500": string; "700": string };
  /** خانهٔ پالت تیره (قاعدهٔ ۴: ۵۰۰→۴۰۰ روشن‌تر · متن معکوس) */
  dark: { "50": string; "200": string; "400": string; "500": string; "700": string };
  /** رنگ متن/آیکون روی ۵۰۰ — کنتراست ≥ ۳:۱ برای آیکون گرادیانی */
  fgOn500: string;
}

/** ۱۱ نگین مصوب — عین جدول بخش اول سند شورا (جلسهٔ ۰۳۱) */
export const NEGIN_GEMS: readonly NeginGem[] = [
  {
    id: "yaghut-kamani", fa: "یاقوت کمانی", accentKey: "finder", tileTitle: "فایل یابی ملکا", feeling: "غریزهٔ شکارچی",
    light: { "50": "#FEF2F2", "200": "#FECACA", "400": "#F87171", "500": "#DC2626", "700": "#991B1B" },
    dark: { "50": "#2A1215", "200": "#7F1D1D", "400": "#FCA5A5", "500": "#F87171", "700": "#FECACA" },
    fgOn500: "#FFFFFF",
  },
  {
    id: "kahroba-talaee", fa: "کهربا طلایی", accentKey: "melka-listing", tileTitle: "آگهی ملکا", feeling: "گرمای فرصت",
    light: { "50": "#FFFBEB", "200": "#FDE68A", "400": "#FBBF24", "500": "#F59E0B", "700": "#B45309" },
    dark: { "50": "#2A2005", "200": "#78350F", "400": "#FCD34D", "500": "#FBBF24", "700": "#FDE68A" },
    fgOn500: "#1F2937",
  },
  {
    id: "aqiq-limoonee", fa: "عقیق لیمویی", accentKey: "melka-request", tileTitle: "درخواست ملکا", feeling: "سبزدشت رشد",
    light: { "50": "#F7FEE7", "200": "#D9F99D", "400": "#A3E635", "500": "#84CC16", "700": "#3F6212" },
    dark: { "50": "#1C2606", "200": "#4D7C0F", "400": "#BEF264", "500": "#A3E635", "700": "#D9F99D" },
    fgOn500: "#1A2E05",
  },
  {
    id: "zomorrod-koohi", fa: "زمرد کوهی", accentKey: "m1", tileTitle: "M1 — آگهی‌ها", feeling: "فرصت سرسبز",
    light: { "50": "#ECFDF5", "200": "#A7F3D0", "400": "#34D399", "500": "#10B981", "700": "#047857" },
    dark: { "50": "#04211A", "200": "#065F46", "400": "#6EE7B7", "500": "#34D399", "700": "#A7F3D0" },
    fgOn500: "#022C22",
  },
  {
    id: "marjan-daryayi", fa: "مرجان دریایی", accentKey: "m2", tileTitle: "M2 — درخواست‌ها", feeling: "جریان زندهٔ آب",
    light: { "50": "#FFF1F2", "200": "#FECDD3", "400": "#FDA4AF", "500": "#FB7185", "700": "#BE123C" },
    dark: { "50": "#2B0D16", "200": "#9F1239", "400": "#FDA4AF", "500": "#FDA4AF", "700": "#FECDD3" },
    fgOn500: "#4C0519",
  },
  {
    id: "yaghut-banafsh", fa: "یاقوت بنفش", accentKey: "m3", tileTitle: "M3 — معاملات", feeling: "شکوه توافق",
    light: { "50": "#F5F3FF", "200": "#DDD6FE", "400": "#A78BFA", "500": "#8B5CF6", "700": "#6D28D9" },
    dark: { "50": "#1E1636", "200": "#4C1D95", "400": "#C4B5FD", "500": "#A78BFA", "700": "#DDD6FE" },
    fgOn500: "#FFFFFF",
  },
  {
    id: "yaghut-kabud", fa: "یاقوت کبود", accentKey: "m4", tileTitle: "M4 — کارشناسان", feeling: "اعتماد آسمانی",
    light: { "50": "#EFF6FF", "200": "#BFDBFE", "400": "#60A5FA", "500": "#3B82F6", "700": "#1D4ED8" },
    dark: { "50": "#0D1B2E", "200": "#1E40AF", "400": "#93C5FD", "500": "#60A5FA", "700": "#BFDBFE" },
    fgOn500: "#FFFFFF",
  },
  {
    id: "kuartz-soorati", fa: "کوارتز صورتی", accentKey: "m5", tileTitle: "M5 — تطبیق", feeling: "هماهنگی دل‌نشین",
    light: { "50": "#FDF2F8", "200": "#FBCFE8", "400": "#F9A8D4", "500": "#F472B6", "700": "#BE185D" },
    dark: { "50": "#2B0C21", "200": "#9D174D", "400": "#F9A8D4", "500": "#F9A8D4", "700": "#FBCFE8" },
    fgOn500: "#500724",
  },
  {
    id: "nili", fa: "نیلی", accentKey: "m8", tileTitle: "M6 — مغز ملکا", feeling: "ژرفای هوش",
    light: { "50": "#EEF2FF", "200": "#C7D2FE", "400": "#818CF8", "500": "#6366F1", "700": "#4338CA" },
    dark: { "50": "#171A45", "200": "#3730A3", "400": "#A5B4FC", "500": "#818CF8", "700": "#C7D2FE" },
    fgOn500: "#FFFFFF",
  },
  {
    id: "topaz-abee", fa: "توپاز آبی", accentKey: "m6", tileTitle: "M7 — شاخص بازار", feeling: "شفافیت آب‌رس",
    light: { "50": "#ECFEFF", "200": "#A5F3FC", "400": "#22D3EE", "500": "#06B6D4", "700": "#0E7490" },
    dark: { "50": "#0A222B", "200": "#155E75", "400": "#67E8F9", "500": "#22D3EE", "700": "#A5F3FC" },
    fgOn500: "#083344",
  },
  {
    id: "morvarid", fa: "مروارید", accentKey: "m7", tileTitle: "M8 — پوشش داده", feeling: "سازوارهٔ آرام",
    light: { "50": "#FAFAF9", "200": "#E7E5E4", "400": "#A8A29E", "500": "#E7E5E4", "700": "#44403C" },
    dark: { "50": "#1C1917", "200": "#57534E", "400": "#D6D3D1", "500": "#A8A29E", "700": "#E7E5E4" },
    fgOn500: "#1C1917",
  },
];

/** نگاشت accent کلید → شناسهٔ نگین (تزریق به SECTION_ACCENTS) */
export const ACCENT_TO_GEM: Readonly<Record<string, string>> = Object.fromEntries(
  NEGIN_GEMS.map((g) => [g.accentKey, g.id]),
);

/** چهار گرادیان درخشان مصوب — «۴ ترکیب» */
export const NEGIN_GRADIENTS: ReadonlyArray<{ id: string; fa: string; from: string; to: string }> = [
  { id: "shafaq", fa: "شفق یاقوت", from: "#DC2626", to: "#F59E0B" },
  { id: "ocean", fa: "اقیانوس", from: "#06B6D4", to: "#6366F1" },
  { id: "jangal", fa: "جنگل زمرد", from: "#10B981", to: "#84CC16" },
  { id: "shahaneh", fa: "شاهانه", from: "#8B5CF6", to: "#3B82F6" },
];

/** پنج افکت فاخر — «۵ افکت» */
export const NEGIN_EFFECTS: readonly string[] = [
  "negin-glow", // هالهٔ گوهر
  "negin-shine", // درخشش متحرک
  "negin-sparkle", // سوسوی نرم
  "negin-depth", // عمق سایه‌لایه
  "negin-glass", // شیشهٔ گوهرین
];

/* ─────────────────────────────────────────────────────────────────────────
 * WCAG AA — محاسبهٔ مستقل کنتراست (بدون وابستگی به هیچ ابزار بیرونی)
 * ───────────────────────────────────────────────────────────────────────── */

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  const ch = (v: number): number => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

/** نسبت کنتراست WCAG بین دو رنگ hex */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** گزارش کنتراست هر ۱۱ نگین — متن-۷۰۰ روی پس‌زمینه-۵۰ (جفت الزامی chip) */
export function neginContrastReport(): Array<{ id: string; fa: string; ratio: number; pass: boolean }> {
  return NEGIN_GEMS.map((g) => {
    const ratio = contrastRatio(g.light["700"], g.light["50"]);
    return { id: g.id, fa: g.fa, ratio: Math.round(ratio * 100) / 100, pass: ratio >= 4.5 };
  });
}

/** یکتایی ۱۱ رنگ ۵۰۰ — قاعدهٔ ۱ مالک (صفر تکرار گوهر) */
export function neginUnique500(): { unique: boolean; values: string[] } {
  const values = NEGIN_GEMS.map((g) => g.light["500"].toUpperCase());
  return { unique: new Set(values).size === values.length, values };
}
