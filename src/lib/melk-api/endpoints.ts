/**
 * ثبت نقاط اتصال (Endpoint Registry) سامانه‌های ملک تبریز
 * ------------------------------------------------------
 * «فرض مستند»: مشخصات رسمی API عمومی نیست؛ الگوها مطابق
 * قراردادهای رایج REST برای سامانه‌های CRM املاک تعریف شده‌اند.
 * برای اتصال واقعی، فقط همین فایل باید با مستندات رسمی هم‌تراز شود.
 */

export const MELK_ENDPOINTS = {
  auth: {
    /** درخواست صدور کد پیامکی برای کد پرسنلی */
    requestOtp: "/api/v1/auth/request-otp",
    /** تأیید کد پیامکی و دریافت توکن نشست */
    verifyOtp: "/api/v1/auth/verify-otp",
    /** تمدید نشست */
    refresh: "/api/v1/auth/refresh",
    /** خروج */
    logout: "/api/v1/auth/logout",
  },
  crm: {
    /** فهرست معاملات */
    transactions: "/api/v1/deals",
    /** فهرست کارشناسان */
    experts: "/api/v1/agents",
  },
  pm: {
    /** درخواست‌های خرید ثبت‌شده در سامانه pm */
    requests: "/api/v1/requests",
  },
} as const;
