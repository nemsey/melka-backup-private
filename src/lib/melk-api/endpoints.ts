/**
 * ثبت نقاط اتصال (Endpoint Registry) واقعی سامانه‌های ملک تبریز
 * ------------------------------------------------------
 * ✅ این مقادیر «کشف‌شده از خود سامانه‌های واقعی» هستند (تحلیل باندل
 *    arm.melketabriz.ir و pm.melketabriz.ir + تست زنده‌ی HTTP).
 *
 * سامانه ARM (سامانه مدیریت آگهی و درخواست — ملک تبریز):
 *   API اصلی:    https://arus-api.melketabriz.ir/api/apm/
 *   API عمومی:   https://arus-api.melketabriz.ir/api/public/
 *   احراز هویت:  GET  authentication/otp/{code}      ← ارسال پیامک
 *                POST authentication/otp/login       ← {code, otpCode}
 *                POST authentication/refresh-token   ← {refreshToken}
 *   داده‌ها:     realtor-reports/traded-count-total  ← گزارش معاملات
 *                realtor-reports/traded-count        ← شمارش معاملات
 *                realtor-reports/realtor-interactions
 *                realtors/list                       ← کارشناسان
 *
 * سامانه PM (سامانه مدیریت پرسنلی — ملک تبریز):
 *   API:         https://pm-api.melketabriz.ir/api/
 *   احراز هویت:  GET  authentication/otp/{code}
 *                POST authentication/otp/login       ← {code, otpCode}
 *                POST authentication/refreshToken
 *   داده‌ها:     public/portalInfo
 *
 * پوشه پاسخ (NestJS Envelope): { statusCode, status, data, message }
 */

/** مسیرهای نسبی — به‌همراه پایه در client ترکیب می‌شوند */
export const MELK_ENDPOINTS = {
  arm: {
    /** درخواست صدور کد پیامکی برای کد پرسنلی (کد در مسیر URL) */
    requestOtp: (personnelCode: string) => `authentication/otp/${encodeURIComponent(personnelCode)}`,
    /** تأیید کد پیامکی و دریافت توکن نشست سامانه ARM */
    verifyOtp: "authentication/otp/login",
    /** تمدید توکن سامانه ARM */
    refreshToken: "authentication/refresh-token",
    /** خروج از سامانه ARM */
    logout: "authentication/logout",
    /** تنظیمات سراسری (نیازمند توکن) */
    globalSettings: "global-settings",
    /** گزارش معاملات (صفحه‌بندی + بازه تاریخ) */
    tradedTotal: "realtor-reports/traded-count-total",
    /** شمارش معاملات (خلاصه) */
    tradedCount: "realtor-reports/traded-count",
    /** گزارش تعاملات کارشناسان */
    realtorInteractions: "realtor-reports/realtor-interactions",
    /** فهرست کارشناسان (کارشناس املاک = realtor) */
    realtorsList: "realtors/list",
    /** شمارش اعلان‌ها */
    badgeCount: "count/badge",

    // ============ آگهی (ثبت‌شده توسط کارشناس) — کشف از باندل رسمی ============
    /** جست‌وجوی آگهی با کدآگهی — پاسخ: {_id, title, relatedRealtor, ...} */
    propertiesByCode: (code: string) => `properties/info/by-code/${encodeURIComponent(code)}`,
    /** جزئیات کامل آگهی — پاسخ: {details: [{label, value, unit}], address, ...} */
    propertyDetails: (id: string) => `properties/details/${encodeURIComponent(id)}`,
    /** اطلاعات مالک آگهی — پاسخ: ساختار کاربر (mobileNumber, extraUserInfo, ...) */
    propertyOwner: (id: string) => `properties/owner/${encodeURIComponent(id)}`,
    /** فهرست آگهی‌ها (فیلتر کد، وضعیت، صفحه‌بندی) — عین خود سامانه */
    propertiesList: "properties",

    // ============ درخواست (ثبت‌شده توسط کارشناس) — کشف از باندل رسمی ============
    /** فهرست درخواست‌ها (فیلتر کد، وضعیت، صفحه‌بندی) — عین خود سامانه */
    requestsList: "requests",
    /** جزئیات کامل درخواست */
    requestDetails: (id: string) => `requests/details/${encodeURIComponent(id)}`,
    /** اطلاعات درخواست‌دهنده (مشتری) درخواست — ساختار کاربر */
    requestApplicant: (id: string) => `requests/applicant/${encodeURIComponent(id)}`,

    // ============ بازدیدها و پیگیری‌ها ============
    /** فهرست بازدیدها (بررسی‌کننده × درخواست‌دهنده × کدآگهی) */
    visitsList: "visits",

    // ============ بازیابی کاربر با شماره موبایل ============
    /** استعلام کاربر/مشتری با شماره موبایل */
    userByMobile: (mobile: string) => `users/info/mobile-number/${encodeURIComponent(mobile)}`,
  },
  armPublic: {
    /** مقادیر شمارشی فارسی (بدون توکن) */
    enums: "statics/enums-persian",
  },
  armReports: {
    /** گزارش عرضه و تقاضا (بازه × تعداد آگهی × درصد درخواست × وضعیت) */
    supplyDemand: "realtor-reports/supply-demand",
  },
  pm: {
    /** اطلاعات پورتال (عمومی) */
    portalInfo: "public/portalInfo",
    /** درخواست صدور کد پیامکی سامانه پرسنلی */
    requestOtp: (personnelCode: string) => `authentication/otp/${encodeURIComponent(personnelCode)}`,
    /** تأیید کد و ورود به سامانه پرسنلی */
    verifyOtp: "authentication/otp/login",
    /** تمدید توکن سامانه پرسنلی */
    refreshToken: "authentication/refreshToken",
  },
} as const;
