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
  },
  armPublic: {
    /** مقادیر شمارشی فارسی (بدون توکن) */
    enums: "statics/enums-persian",
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
