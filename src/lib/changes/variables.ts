/**
 * variables.ts — کاشی «تغییرات» · منبع یگانهٔ متغیرها (DIR-CHANGES-TILE-002)
 * ---------------------------------------------------------------------------
 * ساختار تازهٔ کاشی طبق دستور مالک (۱۴۰۵/۰۸/۲۹):
 *   ۱. کدآگهی: تغییر در کد · حذف کد
 *   ۲. کددرخواست: تغییر در کد · حذف کد
 *
 * «تغییر» کدآگهی = ۱) تغییر «اطلاعات مالک آگهی» (نام/نام‌خانوادگی + موبایل)
 *                + ۲) تغییر تاریخ «ایجاد مشاور» با آبشار اتوماتیک تاریخچه‌ها
 * «تغییر» کددرخواست = تغییر تاریخ «ایجاد مشاور» با آبشار اتوماتیک (الگوی ۰۹۹ تعمیم‌یافته)
 * «حذف» = پاکسازی کامل از ARM (رویدادها) + سامانهٔ عمومی + همهٔ آینه‌های محلی
 *         (هیچ اثری — مخصوصاً در پروفایل کارشناسان — باقی نماند)
 *
 * منابع شناخت: گزارش dir-reg-req-099-001 (شاهکار اصلاح تاریخ) · گزارش
 * DIR-CHANGES-TILE-001 (دو قابلیت + تمام‌ظرفیت) · کاوش زندهٔ این نوبت
 * (پراب‌های ۱-۱۱ + آزمون semantics): مسیرهای اثبات‌شدهٔ زنده:
 *   · users/update/{id} · users/info/{id} · users/delete/{id}  ← موجود
 *   · request-events/list?property= · request-events/update/{id} · request-events/delete/{id}
 *   · requests/history/{id} · requests/info/{id} · PUT requests/update (semantics=REPLACE)
 *   · properties/update/{id} · properties/owner/{id} · properties/info/by-code/{code}
 * و مسیرهای بررسی‌شدهٔ ناموجود (۶۰+ واریانت): history کامل آگهی · حذف آگهی/درخواست
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

/** مسیرهای ARM موردنیاز کاشی — عین باندل رسمی arm.melketabriz.ir + پراب‌های زندهٔ ۰۰۲ */
export const ARM_PATHS = {
  // ── مشتری/مالک (اطلاعات مالک آگهی) ──
  customerByMobile: (armMobile: string) => `users/info/mobile-number/${encodeURIComponent(armMobile)}`,
  customerCreate: "users/create",
  /** اطلاعات کامل کاربر — مسیر اثبات‌شدهٔ زنده (پراب ۲) */
  customerInfo: (armUserId: string) => `users/info/${encodeURIComponent(armUserId)}`,
  /** ویرایش کاربر (نام/نام‌خانوادگی/موبایل مالک) — مسیر اثبات‌شدهٔ زنده (پراب ۱: «آیتم مورد نظر یافت نشد» ≠ 404 مسیر) */
  customerUpdate: (armUserId: string) => `users/update/${encodeURIComponent(armUserId)}`,
  /** حذف کاربر — مسیر اثبات‌شدهٔ زنده (پراب ۲) */
  customerDelete: (armUserId: string) => `users/delete/${encodeURIComponent(armUserId)}`,

  // ── کد درخواست ──
  requestCreate: "requests/create",
  requestUpdate: (armRequestId: string) => `requests/update/${encodeURIComponent(armRequestId)}`,
  requestsList: "requests/list",
  requestDetails: (armRequestId: string) => `requests/details/${encodeURIComponent(armRequestId)}`,
  requestApplicant: (armRequestId: string) => `requests/applicant/${encodeURIComponent(armRequestId)}`,
  /** منبع «تاریخچه تغییرات درخواست» — کشف زندهٔ ۰۹۹ (کامل — همهٔ مدخل‌ها) */
  requestHistory: (armRequestId: string) => `requests/history/${encodeURIComponent(armRequestId)}`,
  /** رکورد کامل درخواست برای بازسازی بدنهٔ ویرایش — کشف زندهٔ ۰۰۲ (دسترسی دامنه‌ای) */
  requestInfo: (armRequestId: string) => `requests/info/${encodeURIComponent(armRequestId)}`,

  // ── رویداد درخواست (تاریخچهٔ رویداد و بازخورد) ──
  requestEventCreate: "request-events/create",
  /** فهرست رویدادها — با ?property={armPropertyId} = «تاریخچهٔ رویداد و بازخورد» آگهی (اثبات زندهٔ ۰۰۲) */
  requestEventsList: "request-events/list",
  requestEventTypes: "request-event-types/list",
  /** ویرایش رویداد (تغییر تاریخ/ساعت در آبشار) — مسیر اثبات‌شدهٔ زنده (پراب ۴) */
  requestEventUpdate: (armEventId: string) => `request-events/update/${encodeURIComponent(armEventId)}`,
  /** حذف رویداد — مسیر اثبات‌شدهٔ زنده (پراب ۱) */
  requestEventDelete: (armEventId: string) => `request-events/delete/${encodeURIComponent(armEventId)}`,

  // ── کدآگهی ──
  propertyUpdate: (armPropertyId: string) => `properties/update/${encodeURIComponent(armPropertyId)}`,
  /** جستجوی آگهی با کدآگهی — رکورد کامل (status = آخرین مدخل) */
  propertyByCode: (code: string | number) => `properties/info/by-code/${encodeURIComponent(String(code))}`,
  propertiesList: "properties/list",
  propertyDetails: (armPropertyId: string) => `properties/details/${encodeURIComponent(armPropertyId)}`,
  /** اطلاعات مالک آگهی — {userId, _id, fullName, mobileNumber, …} */
  propertyOwner: (armPropertyId: string) => `properties/owner/${encodeURIComponent(armPropertyId)}`,

  // ── واریانت‌های خواندن تاریخچهٔ کامل آگهی (بررسی‌شده در ۰۰۲: امروز هیچ‌کدام فعال نیست؛
  //    در صورت فعال‌شدن هر یک توسط آرم، آبشار تاریخچهٔ کامل آگهی خودکار کامل می‌شود) ──
  propertyHistoryVariants: (armPropertyId: string) => [
    `properties/history/${encodeURIComponent(armPropertyId)}`,
    `properties/${encodeURIComponent(armPropertyId)}/history`,
    `properties/change-history/${encodeURIComponent(armPropertyId)}`,
  ],

  // ── واریانت‌های حذف آگهی/درخواست در آرم (بررسی‌شده در ۰۰۲: امروز هیچ‌کدام فعال نیست؛
  //    در صورت فعال‌شدن، حذف کامل ARM خودکار انجام می‌شود) ──
  propertyDeleteVariants: (armPropertyId: string) => [
    { method: "DELETE" as const, path: `properties/delete/${encodeURIComponent(armPropertyId)}` },
    { method: "DELETE" as const, path: `properties/remove/${encodeURIComponent(armPropertyId)}` },
    { method: "DELETE" as const, path: `properties/${encodeURIComponent(armPropertyId)}` },
  ],
  requestDeleteVariants: (armRequestId: string) => [
    { method: "DELETE" as const, path: `requests/delete/${encodeURIComponent(armRequestId)}` },
    { method: "DELETE" as const, path: `requests/remove/${encodeURIComponent(armRequestId)}` },
    { method: "DELETE" as const, path: `requests/${encodeURIComponent(armRequestId)}` },
  ],
} as const;

/* ═══════════════════ ۳. شناسه‌های کاتالوگ ARM (زنده — عین خود سامانه) ═══════════════════ */

/** مکان رسمی — ایران / آذربایجان شرقی / تبریز */
export const LOCATION_IDS = {
  country: "614ed19700cace6eac4f9ded", // ایران (IRAN_COUNTRY_ID)
  state: "614ed19700cace6eac4f9df0", // آذربایجان شرقی (AZ_SHARGHI_STATE_ID)
  city: TABRIZ_CITY_ID, // تبریز
} as const;

/** نوع معامله */
export const TRADE_TYPE_IDS = {
  sell: "614ed62da50555f0a54c1eca", // فروش
  preSell: "614ed63aa50555f0a54c1ed3", // پیش فروش
  rent: "614ed649a50555f0a54c1edc", // رهن و اجاره
  partnership: "614ed790a50555f0a54c1ee5", // مشارکت در ساخت
} as const;

/** نوع کاربری */
export const BUILDING_TYPE_IDS = {
  residential: "614edc35a50555f0a54c1f12", // مسکونی
  residentialCommercial: "614edc47a50555f0a54c1f1b", // مسکونی با تجاری
  gardenVilla: "614edc58a50555f0a54c22a5", // باغ و ویلا
  commercial: "614edc66a50555f0a54c1f2d", // تجاری-خدماتی
  industrial: "614edc8ba50555f0a54c1f36", // صنعتی
} as const;

/** نوع ملک */
export const PROPERTY_TYPE_IDS = {
  apartment: "614ee704a50555f0a54c227d", // آپارتمان
  house: "614ee750a50555f0a54c228e", // خانه،حیاط،ویلایی
  landOrOld: "614ee798a50555f0a54c22a5", // زمین یا ملک کلنگی
  building: "614ee784a50555f0a54c229c", // ساختمان
} as const;

/** نحوهٔ پرداخت */
export const PAYMENT_METHOD_IDS = {
  cash: "61a39bf0f06329efdeacbbef", // نقدی
  propertyAndCash: "61b4adae67a91fbc73ec891a", // ملک و نقد
  bySelling: "61b4adc567a91fbc73ec8924", // با فروش ملک
  barter: "61b4b26567a91fbc73c8cdd", // تهاتر با کالا
} as const;

/** جدیت مشتری */
export const SERIOUSNESS_IDS = {
  veryHigh: "61a7536b0927675c45489a59", // خیلی زیاد
  high: "61a753650927675c45489a4f", // زیاد (عین ۰۹۹)
  medium: "61a7535f0927675c45489a3b", // متوسط
  low: "61a39c18f06329efdeacbe47", // کم
} as const;

/** انواع اقدام تاریخچهٔ درخواست — شناسه‌های واقعی خود سامانه (کشف زندهٔ ۰۹۹) */
export const HISTORY_ACTION_TYPES = {
  createRealtor: { id: "6506dde8c772727517fed9b8", name: "ایجاد مشاور" },
} as const;

/** مقادیر استاندارد فیلدهای الزامیِ اعلام‌نشده — الگوی ۰۹۹ */
export const STANDARD_DEFAULTS = {
  userPaymentMethod: PAYMENT_METHOD_IDS.cash,
  userPaymentMethodName: "نقدی",
  userSeriousity: SERIOUSNESS_IDS.high,
  userSeriousityName: "زیاد",
} as const;

/* ═══════════════════ ۴. تاریخ جلالی ↔ ISO (شاهکار ۰۹۹) ═══════════════════ */

/** تبدیل تاریخ جلالی + ساعت تهران → ISO UTC — ۱۴۰۵/۰۸/۲۰ ۱۷:۳۰ تهران → 2026-11-11T14:00:00.000Z */
export function jalaliHourToIsoUtc(jalaliDate: string, hourTehran: string): string | null {
  const m = jalaliDate.trim().match(/^(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})$/);
  const h = hourTehran.trim().match(/^(\d{1,2}):(\d{1,2})$/);
  if (!m || !h) return null;
  const [gy, gm, gd] = jalaliToGregorian(Number(m[1]), Number(m[2]), Number(m[3]));
  const hh = Number(h[1]);
  const mm = Number(h[2]);
  if (hh > 23 || mm > 59) return null;
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

/** قالب ISO فقط-تاریخ (YYYY-MM-DD) از جلالی */
export function jalaliToIsoDate(jalaliDate: string): string | null {
  const m = jalaliDate.trim().match(/^(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})$/);
  if (!m) return null;
  const [gy, gm, gd] = jalaliToGregorian(Number(m[1]), Number(m[2]), Number(m[3]));
  return `${gy}-${String(gm).padStart(2, "0")}-${String(gd).padStart(2, "0")}`;
}

/** ساعت تهران (HH:mm) از ISO — برای حفظ ساعت در جابه‌جایی تاریخ */
export function isoToTehranHour(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const tehran = new Date(d.getTime() + 210 * 60_000);
  return `${String(tehran.getUTCHours()).padStart(2, "0")}:${String(tehran.getUTCMinutes()).padStart(2, "0")}`;
}

/* ═══════════════════ ۵. قواعد آبشار تاریخ (دستور مالک ۱۴۰۵/۰۸/۲۹) ═══════════════════ */

/**
 * قاعدهٔ آبشار — عین مثال مالک:
 *   ایجاد مشاور ۱۴۰۵/۰۶/۰۲ → هدف ۱۴۰۵/۰۷/۰۵  (Δ = +۳۴ روز)
 *   انتشار آگهی ۱۴۰۵/۰۶/۰۳ → ۱۴۰۵/۰۷/۰۶       (همان Δ — همهٔ مدخل‌ها و رویدادها
 *   با «همان فاصلهٔ نسبی از لنگر» جابه‌جا می‌شوند)
 *
 * لنگر: مدخل «ایجاد مشاور»؛ اگر نبود، قدیمی‌ترین مدخل (شفاف گزارش می‌شود).
 * اگر ساعت هدف داده نشود، ساعتِ فعلیِ لنگر حفظ می‌شود (Δ دقیق میلی‌ثانیه‌ای).
 */
export const CASCADE_RULES = {
  /** نام اقدام لنگر — عین دستور مالک و اسکرین‌شات */
  anchorActionName: "ایجاد مشاور",
  /** جایگزین لنگر وقتی «ایجاد مشاور» نبود: قدیمی‌ترین مدخل */
  anchorFallback: "earliest",
} as const;

/* ═══════════════════ ۶. اولویت رلهٔ ترموکس ═══════════════════ */

/** اولویت سقف صف رله — کاشی تغییرات: مقدم بر OTP(۵) و ثبت‌ها(۵) */
export const RELAY_PRIORITY_CHANGES = 10;

/** مهلت‌های اجرای تغییرات از طریق رلهٔ ترموکس (میلی‌ثانیه) */
export const CHANGES_TIMEOUT_MS = {
  lookup: 45_000,
  write: 120_000,
} as const;

/* ═══════════════════ ۷. نشست تمام‌ظرفیت (گام سوم — کدنصب) ═══════════════════ */

export const CHANGES_SESSION_MAX_MS = 30 * 60_000;
export const CHANGES_SESSION_FILE = "changes-session.json";
export const CHANGES_TILE_ID = "changes";

export interface ChangesSessionFile {
  version: 1;
  startedAt: string;
  actor: string;
  actorName: string;
  note: string;
  expiresAt: string;
  started: {
    queuePending: number;
    queueDispatched: number;
  };
}

/* ═══════════════════ ۸. شرح ساختار تازهٔ کاشی (منبع یگانه UI) ═══════════════════ */

export interface CapabilityDescriptor {
  key: "listing" | "request";
  order: 1 | 2;
  title: string;
  subject: string;
  operations: Array<{ key: "change" | "delete"; title: string; description: string }>;
}

/** دو بخش کاشی — هر یک فقط «تغییر» و «حذف» (سایر بخش‌ها حذف شد — دستور مالک) */
export const CAPABILITIES: readonly CapabilityDescriptor[] = [
  {
    key: "listing",
    order: 1,
    title: "کدآگهی — تغییر در کد · حذف کد",
    subject: "آگهی‌های سامانه ARM (properties) + اطلاعات مالک + تاریخچه‌ها",
    operations: [
      {
        key: "change",
        title: "تغییر در کدآگهی",
        description:
          "۱) تغییر «اطلاعات مالک آگهی» (نام و نام خانوادگی + شماره موبایل مالک در خود سامانه ARM) · " +
          "۲) تغییر تاریخ «ایجاد مشاور» در تاریخچهٔ تغییرات آگهی + تغییر اتوماتیک تاریخ سایر مدخل‌های تاریخچه و تاریخچهٔ رویداد و بازخورد متناسب با تاریخ اعلامی مالک (عین مثال مالک: ۱۴۰۵/۰۶/۰۲ → ۱۴۰۵/۰۷/۰۵، انتشار: ۱۴۰۵/۰۶/۰۳ → ۱۴۰۵/۰۷/۰۶).",
      },
      {
        key: "delete",
        title: "حذف کدآگهی",
        description:
          "حذف کامل آگهی اعلامی مالک از سامانه ARM و سامانهٔ عمومی ملک تبریز + پاکسازی کامل همهٔ آینه‌های محلی (کاتالوگ، رویدادها، بازدیدها، کارگزاری‌ها، معاملات، قراردادها، گراف هوشمند) — هیچ اثری حتی در پروفایل کارشناس ثبت‌کننده باقی نمی‌ماند.",
      },
    ],
  },
  {
    key: "request",
    order: 2,
    title: "کددرخواست — تغییر در کد · حذف کد",
    subject: "درخواست‌های سامانه ARM (requests) + تاریخچهٔ تغییرات + رویدادها",
    operations: [
      {
        key: "change",
        title: "تغییر در کددرخواست",
        description:
          "تغییر تاریخ «ایجاد مشاور» در تاریخچهٔ تغییرات درخواست + تغییر اتوماتیک تاریخ سایر مدخل‌های تاریخچه و تاریخ رویدادهای درخواست متناسب با تاریخ اعلامی مالک (تعمیم شاهکار ۰۹۹ با آبشار نسبی).",
      },
      {
        key: "delete",
        title: "حذف کددرخواست",
        description:
          "حذف کامل درخواست اعلامی مالک از سامانه ARM + پاکسازی کامل همهٔ آینه‌های محلی (رکورد، رویدادها، معاملات، قراردادها، گراف هوشمند) — هیچ اثری حتی در پروفایل کارشناس ثبت‌کننده باقی نمی‌ماند.",
      },
    ],
  },
] as const;

/** برچسب وضعیت‌های گام */
export const STEP_STATUS_LABELS: Record<string, string> = {
  pending: "در انتظار",
  done: "انجام شد",
  failed: "ناموفق",
  skipped: "رد شد",
};
