/**
 * variables.ts — کاشی «تغییرات» · گام اول (DIR-CHANGES-TILE-001)
 * ---------------------------------------------------------------------------
 * فراکامل‌ترین شناخت «ایجاد و تغییر کدآگهی و کد درخواست در سامانه ARM ملک تبریز»
 * که به‌صورت متغیرهای پیش‌بینی‌شده برای دو قابلیت کاشی مهیا شده است.
 *
 * منبع شناخت (گام اول دستور مالک): گزارش dir-reg-req-099-001 — نخستین تغییر
 * موفق کد درخواست طبق نظر مالک (ثبت ۵۵۹۲۰ + اصلاح تاریخ تاریخچه به ۱۷:۳۰|۱۴۰۵/۰۸/۲۰)
 * + کاوش زندهٔ فرم‌های خود سامانه (فرم پویا ۳۴ ورودی · requests/history ·
 * request-event-types · PUT requests/update با آرایهٔ status).
 *
 * دو قابلیت (گام دوم) هر دو از همین متغیرها تغذیه می‌شوند:
 *   قابلیت ۱ — ایجاد و تغییر «کدآگهی» (properties/*)
 *   قابلیت ۲ — ایجاد و تغییر «کد درخواست» (requests/* + تاریخچه + رویداد)
 *
 * قانون: این فایل «منبع یگانه» است — هیچ شناسه/مسیر/مقدار استانداردی در
 * ایجنت‌ها یا UI هاردکد نمی‌شود؛ همه چیز از همین‌جا می‌آید.
 */

import { jalaliToGregorian, gregorianToJalali } from "@/lib/jalali";
import { TABRIZ_CITY_ID } from "@/lib/divar/tabriz-locations";

/* ═══════════════════ ۱. هویت مالک و حساب ARM ═══════════════════ */

/** هویت مالک — حساب کاربری ARM که تغییرات طبق نظر او ثبت می‌شود */
export const OWNER_IDENTITY = {
  fullName: "سید نعمت اله سیدی",
  personnelCode: "410031320",
  deviceLabel: "Poco F3 سیدی",
} as const;

/** هویت پیش‌فرض «توسط» در رویدادهای تاریخچه — عین ۰۹۹ */
export const HISTORY_BY_DEFAULT = {
  name: OWNER_IDENTITY.fullName,
  code: OWNER_IDENTITY.personnelCode,
} as const;

/* ═══════════════════ ۲. نقاط اتصال ARM (کشف‌شده از خود سامانه) ═══════════════════ */

/** مسیرهای ARM موردنیاز دو قابلیت — عین باندل رسمی arm.melketabriz.ir */
export const ARM_PATHS = {
  // ── مشتری (گام مشترک هر دو قابلیت) ──
  customerByMobile: (armMobile: string) => `users/info/mobile-number/${encodeURIComponent(armMobile)}`,
  customerCreate: "users/create",

  // ── کد درخواست (قابلیت ۲) ──
  requestCreate: "requests/create",
  requestCreateDraft: "requests/create/draft",
  requestUpdate: (armRequestId: string) => `requests/update/${encodeURIComponent(armRequestId)}`,
  requestsList: "requests/list",
  requestDetails: (armRequestId: string) => `requests/details/${encodeURIComponent(armRequestId)}`,
  requestApplicant: (armRequestId: string) => `requests/applicant/${encodeURIComponent(armRequestId)}`,
  /** منبع «تاریخچه تغییرات درخواست» — کشف زندهٔ ۰۹۹ */
  requestHistory: (armRequestId: string) => `requests/history/${encodeURIComponent(armRequestId)}`,
  /** ثبت رویداد تاریخچه — عین request-events/create خود سامانه */
  requestEventCreate: "request-events/create",
  /** انواع رویداد (زنده — برای انتخاب اقدام) */
  requestEventTypes: "request-event-types/list",
  /** فرم پویای دسته‌بندی (۳۴ ورودی — برای اعتبارسنجی مقادیر دقیق) */
  categoryForm: "forms/info/category",

  // ── کدآگهی (قابلیت ۱) ──
  propertyCreate: "properties/create",
  propertyCreateDraft: "properties/create/draft",
  propertyUpdate: (armPropertyId: string) => `properties/update/${encodeURIComponent(armPropertyId)}`,
  /** جستجوی آگهی با کدآگهی — عین جستجوی زندهٔ فرم رویداد خود سامانه */
  propertyByCode: (code: string | number) => `properties/info/by-code/${encodeURIComponent(String(code))}`,
  propertiesList: "properties/list",
  propertyDetails: (armPropertyId: string) => `properties/details/${encodeURIComponent(armPropertyId)}`,
  propertyOwner: (armPropertyId: string) => `properties/owner/${encodeURIComponent(armPropertyId)}`,
} as const;

/* ═══════════════════ ۳. شناسه‌های کاتالوگ ARM (زنده — عین خود سامانه) ═══════════════════ */

/** مکان رسمی — ایران / آذربایجان شرقی / تبریز (عین crm-transfer و ۰۹۹؛
 *  شهر از دادهٔ منطقه‌بندی تبریز — ماژول فقط-داده، امن برای UI) */
export const LOCATION_IDS = {
  country: "614ed19700cace6eac4f9ded", // ایران (IRAN_COUNTRY_ID)
  state: "614ed19700cace6eac4f9df0", // آذربایجان شرقی (AZ_SHARGHI_STATE_ID)
  city: TABRIZ_CITY_ID, // تبریز (از منطقه‌بندی رسمی ۱۳۰ منطقه/۹۲۶ محله)
} as const;

/** نوع معامله — فروش/پیش‌فروش/رهن‌واجاره/مشارکت (nameRequest = برچسب درخواستی خود سامانه) */
export const TRADE_TYPE_IDS = {
  sell: "614ed62da50555f0a54c1eca", // فروش (برچسب درخواستی: خرید)
  preSell: "614ed63aa50555f0a54c1ed3", // پیش فروش (پیش خرید)
  rent: "614ed649a50555f0a54c1edc", // رهن و اجاره
  partnership: "614ed790a50555f0a54c1ee5", // مشارکت در ساخت
} as const;

/** نوع کاربری — مسکونی/مسکونی‌با‌تجاری/باغ‌وویلا/تجاری/صنعتی/… */
export const BUILDING_TYPE_IDS = {
  residential: "614edc35a50555f0a54c1f12", // مسکونی
  residentialCommercial: "614edc47a50555f0a54c1f1b", // مسکونی با تجاری
  gardenVilla: "614edc58a50555f0a54c1f24", // باغ و ویلا
  commercial: "614edc66a50555f0a54c1f2d", // تجاری-خدماتی
  industrial: "614edc8ba50555f0a54c1f36", // صنعتی
} as const;

/** نوع ملک — منتخب پرکاربرد (آپارتمان مسکونی عین ۰۹۹) */
export const PROPERTY_TYPE_IDS = {
  apartment: "614ee704a50555f0a54c227d", // آپارتمان (مسکونی)
  house: "614ee750a50555f0a54c228e", // خانه،حیاط،ویلایی (مسکونی)
  landOrOld: "614ee798a50555f0a54c22a5", // زمین یا ملک کلنگی (مسکونی)
  building: "614ee784a50555f0a54c229c", // ساختمان (مسکونی)
} as const;

/** نحوهٔ پرداخت (پول مشتری) — «نقدی» = استانداردترین (۶۶٪ درخواست‌های زنده — شاهد ۰۹۹) */
export const PAYMENT_METHOD_IDS = {
  cash: "61a39bf0f06329efdeacbbef", // نقدی
  propertyAndCash: "61b4adae67a91fbc73ec891a", // ملک و نقد
  bySelling: "61b4adc567a91fbc73ec8924", // با فروش ملک
  barter: "61b4b26567a91fbc73ec8cdd", // تهاتر با کالا
} as const;

/** جدیت مشتری — user-seriousness/list زنده (منبع: USER_SERIOUSNESS؛ «زیاد» = استانداردترین ۰۹۹) */
export const SERIOUSNESS_IDS = {
  veryHigh: "61a7536b0927675c45489a59", // خیلی زیاد
  high: "61a753650927675c45489a4f", // زیاد (عین ۰۹۹)
  medium: "61a7535f0927675c45489a3b", // متوسط
  low: "61a39c18f06329efdeacbe47", // کم
} as const;

/**
 * انواع اقدام تاریخچهٔ درخواست — شناسه‌های واقعی خود سامانه
 * (کشف زنده از requests/history در ۰۹۹ — «ایجاد مشاور» همین‌جا تأیید شد)
 */
export const HISTORY_ACTION_TYPES = {
  /** اقدام «ایجاد مشاور» — عین دستور مالک در ۰۹۹ */
  createRealtor: { id: "6506dde8c772727517fed9b8", name: "ایجاد مشاور" },
} as const;

/** مقادیر استاندارد فیلدهای الزامیِ اعلام‌نشده — الگوی ۰۹۹ (استانداردترین‌ها) */
export const STANDARD_DEFAULTS = {
  userPaymentMethod: PAYMENT_METHOD_IDS.cash, // نقدی
  userPaymentMethodName: "نقدی",
  userSeriousity: SERIOUSNESS_IDS.high, // زیاد
  userSeriousityName: "زیاد",
} as const;

/* ═══════════════════ ۴. تاریخ جلالی ↔ ISO (شاهکار ۰۹۹: تاریخ دقیق) ═══════════════════ */

/**
 * تبدیل تاریخ جلالی + ساعت تهران → ISO UTC — عین قرارداد ۰۹۹:
 *   ۱۴۰۵/۰۸/۲۰ ساعت ۱۷:۳۰ تهران → 2026-11-11T14:00:00.000Z
 * (تهران = UTC+3:30 — TEHRAN_UTC_OFFSET_MINUTES در jalali.ts)
 */
export function jalaliHourToIsoUtc(jalaliDate: string, hourTehran: string): string | null {
  const m = jalaliDate.trim().match(/^(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})$/);
  const h = hourTehran.trim().match(/^(\d{1,2}):(\d{1,2})$/);
  if (!m || !h) return null;
  const [gy, gm, gd] = jalaliToGregorian(Number(m[1]), Number(m[2]), Number(m[3]));
  const hh = Number(h[1]);
  const mm = Number(h[2]);
  if (hh > 23 || mm > 59) return null;
  // تهران UTC+3:30 → UTC = محلی منهای ۳ساعت و ۳۰ دقیقه (Date.UTC قرض ساعت/دقیقه را خودش می‌بندد)
  const d = new Date(Date.UTC(gy, gm - 1, gd, hh - 3, mm - 30, 0, 0));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** تبدیل ISO → «۱۷:۳۰ | ۱۴۰۵/۰۸/۲۰» برای نمایش عین UI خود سامانه */
export function isoToJalaliHour(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const tehran = new Date(d.getTime() + 210 * 60_000); // UTC+3:30
  const [jy, jm, jd] = gregorianToJalali(tehran.getUTCFullYear(), tehran.getUTCMonth() + 1, tehran.getUTCDate());
  const hh = String(tehran.getUTCHours()).padStart(2, "0");
  const mm = String(tehran.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm} | ${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`;
}

/** قالب ISO فقط-تاریخ (YYYY-MM-DD) از جلالی — عین قرارداد ذخیرهٔ رویداد محلی (JalaliDatePicker) */
export function jalaliToIsoDate(jalaliDate: string): string | null {
  const m = jalaliDate.trim().match(/^(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})$/);
  if (!m) return null;
  const [gy, gm, gd] = jalaliToGregorian(Number(m[1]), Number(m[2]), Number(m[3]));
  return `${gy}-${String(gm).padStart(2, "0")}-${String(gd).padStart(2, "0")}`;
}

/* ═══════════════════ ۵. اولویت رلهٔ ترموکس (گام سوم) ═══════════════════ */

/** اولویت سقف صف رله — کاشی تغییرات: مقدم بر OTP(۵) و ثبت‌ها(۵) */
export const RELAY_PRIORITY_CHANGES = 10;

/** مهلت‌های اجرای تغییرات از طریق رلهٔ ترموکس (میلی‌ثانیه) */
export const CHANGES_TIMEOUT_MS = {
  lookup: 45_000, // جستجو/جزئیات/تاریخچه
  write: 120_000, // ثبت/ویرایش (عین بودجهٔ رله — TTL صف ۳۰۰ث)
} as const;

/* ═══════════════════ ۶. نشست تمام‌ظرفیت (گام سوم — کدنصب) ═══════════════════ */

/** حداکثر عمر طبیعی نشست تمام‌ظرفیت — ۳۰ دقیقه (سپس خودکار خاتمه — محافظ) */
export const CHANGES_SESSION_MAX_MS = 30 * 60_000;
/** نام فایل نشست — همان دایرکتوری اجرایی runtime (عین پرچم‌های force) */
export const CHANGES_SESSION_FILE = "changes-session.json";

/** شناسهٔ کاشی — منبع یگانه (رجیستری و ایجنت) */
export const CHANGES_TILE_ID = "changes";

/** وضعیت نشست تمام‌ظرفیت — عین JSON فایل */
export interface ChangesSessionFile {
  version: 1;
  startedAt: string;
  actor: string;
  actorName: string;
  note: string;
  /** انقضای خودکار — محافظ در برابر فراموشی «پایان» */
  expiresAt: string;
  /** شمارنده‌های شروع (شاهد توقف فهرست‌ها) */
  started: {
    queuePending: number;
    queueDispatched: number;
  };
}

/* ═══════════════════ ۷. شرح دو قابلیت (گام دوم — منبع یگانه UI) ═══════════════════ */

export interface CapabilityDescriptor {
  key: "listing" | "request";
  order: 1 | 2;
  title: string;
  subject: string;
  endpoints: string[];
  operations: string[];
}

/** دو قابلیت کاشی — هر دو با شناخت گام اول (۰۹۹) */
export const CAPABILITIES: readonly CapabilityDescriptor[] = [
  {
    key: "listing",
    order: 1,
    title: "قابلیت ۱ — ایجاد و تغییر کدآگهی",
    subject: "آگهی‌های سامانه ARM (properties)",
    endpoints: ["properties/create", "properties/update/{id}", "properties/info/by-code/{code}", "properties/list"],
    operations: ["جستجو با کدآگهی", "ثبت کدآگهی جدید (۵ گامی)", "تغییر در کدآگهی موجود"],
  },
  {
    key: "request",
    order: 2,
    title: "قابلیت ۲ — ایجاد و تغییر کد درخواست",
    subject: "درخواست‌های سامانه ARM (requests) + تاریخچهٔ تغییرات",
    endpoints: ["requests/create", "requests/update/{id}", "requests/history/{id}", "request-events/create"],
    operations: ["جستجو با کد درخواست", "ثبت کد درخواست جدید (۴ گامی)", "اصلاح تاریخ تاریخچه (شاهکار ۰۹۹)", "ثبت رویداد با تاریخ دقیق"],
  },
] as const;

/** برچسب وضعیت‌های گام (عین RegistrationStep) */
export const STEP_STATUS_LABELS: Record<string, string> = {
  pending: "در انتظار",
  done: "انجام شد",
  failed: "ناموفق",
  skipped: "رد شد",
};
