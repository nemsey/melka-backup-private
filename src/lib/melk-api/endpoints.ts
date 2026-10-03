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
    /** گزارش تعاملات کارشناسان — B.4-استاتیک: صفحهٔ خود سامانه این مسیر را «بدون پسوند /list»
     *  صدا می‌زند (ee("realtor-reports/realtor-interactions") بدون addToURL)؛
     *  پسوند /list در تحلیل باندل قبلی اشتباه به این خانواده تعمیم داده شده بود — عامل 404 شب ۱ */
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
    /** فهرست آگهی‌ها (فیلتر کد، وضعیت، صفحه‌بندی) — عین خود سامانه
     *  P6.5-10 (پروب زندهٔ ۱۴۰۵/۰۶/۲۹): مسیر بدون پسوند /list روی ARM با 404
     *  رد می‌شود — مسیر واقعی عین الگوی addToURL:"list" خود سامانه: properties/list
     *  (پاکت سطح‌بالای ARM: {list, count, totalPages, page, limit} — count=۱۱۳٬۳۶۳) */
    propertiesList: "properties/list",

    // ============ درخواست (ثبت‌شده توسط کارشناس) — کشف از باندل رسمی ============
    /** فهرست درخواست‌ها (فیلتر کد، وضعیت، صفحه‌بندی) — عین خود سامانه
     *  P6.5-10 (پروب زندهٔ ۱۴۰۵/۰۶/۲۹): مسیر واقعی requests/list (بدون پسوند 404)
     *  — رفع باگ زنجیرهٔ استخراج کددرخواست کاشی استخراج اطلاعات که تاکنون 404 می‌خورد */
    requestsList: "requests/list",
    /** جزئیات کامل درخواست */
    requestDetails: (id: string) => `requests/details/${encodeURIComponent(id)}`,
    /** اطلاعات درخواست‌دهنده (مشتری) درخواست — ساختار کاربر */
    requestApplicant: (id: string) => `requests/applicant/${encodeURIComponent(id)}`,

    // ============ بازدیدها و پیگیری‌ها ============
    /** فهرست بازدیدها (بررسی‌کننده × درخواست‌دهنده × کدآگهی — addToURL: list) */
    visitsList: "visits/list",

    // ============ قراردادها و اسناد (صورت وضعیت) — کشف از باندل رسمی ============
    /** فهرست صورت وضعیت‌ها (وضعیت × صفحه‌بندی) — عین خود سامانه (addToURL: list) */
    tradeOverviewsList: "trade-overviews/list",
    /** جزئیات کامل قرارداد: تاریخ سند/قرارداد/تحویل، خریداران، فروشندگان، حق‌السهم مشاوران */
    tradeOverviewInfo: (id: string) => `trade-overviews/info/${encodeURIComponent(id)}`,
    /** تعرفه تقسیم حق‌السهم (contribution) */
    tradeOverviewsContribution: "trade-overviews/contribution",

    // ============ باشگاه مشتریان — فهرست‌های مرجع (عمومی، بدون توکن) ============
    /** شخصیت مشتریان (اجتماعی، ایرادگیر، بله‌گو و ...) */
    userCharacters: "user-characters/list",
    /** شغل مشتریان (آزاد، اپراتور، استاد دانشگاه و ...) */
    userJobs: "user-jobs/list",
    /** نقش مشتریان (خریدار، فروشنده، خریدار و فروشنده سرمایه‌گذار و ...) */
    userRoles: "user-roles/list",
    /** جدیت مشتریان (خیلی زیاد، زیاد، متوسط، کم) */
    userSeriousness: "user-seriousness/list",

    // ============ شاخص قیمت روز مناطق (عمومی، بدون توکن) ============
    /** فهرست شاخص‌های قیمت روز (نوع معامله × کاربری × نوع ملک × شهر) */
    currentPricesList: "configs/current-prices/list",
    /** جزئیات مشخصات فنی یک شاخص */
    currentPriceDetails: (id: string) => `configs/current-prices/info/${encodeURIComponent(id)}/details`,
    /** مناطق پوشش‌داده‌شده توسط یک شاخص */
    currentPriceAreas: (id: string) => `configs/current-prices/info/${encodeURIComponent(id)}/areas`,

    // ============ کسب‌وکار و شعبه (توکن‌دار) ============
    /** اطلاعات کسب‌وکار/شعبه خود کاربر */
    ownBusiness: "businesses/info/own",

    // ============ P6.5-12 — کارگزاری‌های صادره (صورت‌وضعیتِ نمایندگی) ============
    /** فهرست کارگزاری‌ها — عین تب «لیست کارگزاری ها» صفحهٔ ویرایش آگهی خود سامانه
     *  (کشف از باندل SPA: N("special-properties",{addToURL:["list"],params:{property}})
     *  — شاهد پروب زندهٔ ۱۴۰۵/۰۷/۰۱: ۷۷ رکورد با realtor/creator/details/payPercent) */
    specialPropertiesList: "special-properties/list",
    /** جزئیات کامل کارگزاری — منبع «چاپ کارگزاری صادر شده» خود سامانه (PDF تولیدی) */
    specialPropertyInfo: (id: string) => `special-properties/info/${encodeURIComponent(id)}`,

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
    // ============ P6.5-12 — رجیستری پرسنل (کشف از باندل SPA سامانه PM) ============
    /** فهرست پرسنل — شامل code (کد پرسنلی!) + mobileNumber + role + activationStatus
     *  (شاهد پروب زندهٔ ۱۴۰۵/۰۷/۰۱: ۱۴۲ پرسنل؛ _id همان _id مشترک با ARM — تطبیق ۱۰۰٪) */
    realtorsList: "realtors/list",
    /** اطلاعات پرسنلی کامل — استخدام/شعبه/نقش (addToURL: [id]) */
    realtorPersonnelInfo: (id: string) => `realtors/info/personnelInfo/${encodeURIComponent(id)}`,
    /** اطلاعات تماس کامل (addToURL: [id]) */
    realtorContactInfo: (id: string) => `realtors/info/contactInfo/${encodeURIComponent(id)}`,
    /** مدارک بارگذاری‌شدهٔ پرسنل — فایل‌ها روی cdn.obizim.ir (addToURL: [id]) */
    realtorUploadedDocuments: (id: string) => `realtors/info/uploadedDocuments/${encodeURIComponent(id)}`,
  },
  /** سامانه مالی (حسابداری) ملک تبریز — کشف از globalSettings.platformsBaseUrl.acc */
  acc: {
    /** پیکربندی تعرفه کمیسیون (شهر × نوع قرارداد × ورودی‌ها + نرخ‌نامه اتحادیه) — عمومی */
    commissionConfigList: "apm/commission/configList",
    /** محاسبه کمیسیون: POST {cityId}/{contractType} */
    commissionCalculate: (cityId: string, contractType: string) =>
      `apm/commission/${encodeURIComponent(cityId)}/${encodeURIComponent(contractType)}`,
    // ============ P6.5-12 — داشبورد مالی (کشف از باندل SPA سامانه fm) ============
    /** فعال‌ترین کارشناسان بر اساس شمار صورت‌وضعیت‌ها (کل کسب‌وکار — نه فقط حساب خود کاربر)
     *  پاسخ: [{tradeOverviewsCount, realtorId, realtorFullName, realtorImage}]
     *  (شاهد پروب زندهٔ ۱۴۰۵/۰۷/۰۱: توکن ARM پذیرفته می‌شود؛ نیازمند query=business) */
    bestRealtor: "dashboard/bestRealtor",
  },

  // ============ P6546/گام صفر — سامانه GAP (سامانه گفت‌وگوی آنلاین ملک تبریز) ============
  /** کشف از باندل سامانه‌های ملک تبریز (gap.melketabriz.ir ← gap-api.melketabriz.ir/api/)
   *  سرور Express زنده است؛ احراز هویت از الگوی خانوادهٔ ملک تبریز (OTP) پیاده شده و
   *  پایهٔ آدرس از طریق MELK_GAP_API_BASE قابل تنظیم است. */
  gap: {
    /** درخواست صدور کد پیامکی سامانه گفت‌وگو — الگوی خانوادهٔ ملک تبریز */
    requestOtp: (personnelCode: string) => `authentication/otp/${encodeURIComponent(personnelCode)}`,
    /** تأیید کد پیامکی و ورود به سامانه GAP */
    verifyOtp: "authentication/otp/login",
    /** تمدید توکن سامانه GAP */
    refreshToken: "authentication/refresh-token",
  },

  // ============ P6546/گام صفر — سامانه عمومی ملک تبریز (melketabriz.com) ============
  /** کشف زندهٔ P6546 (شاهد: download/p6546/systems-discovery-*.json):
   *  پایهٔ arus-api.melketabriz.ir/api/apu/ — همان سرور ARM با بخش عمومی apu که
   *  سامانهٔ عمومی melketabriz.com از آن می‌خواند. همهٔ مسیرهای زیر «بدون توکن» پاسخ می‌دهند:
   *  · properties/list        → ۲۰۰ (count=۳٬۶۷۹ آگهی منتشرشدهٔ عمومی + رکورد غنی)
   *  · properties/info/by-code/{code} → ۲۰۰ (details[] برچسب‌دار + inputs + area/line + ...)
   *  · realtors/info/by-code/{code}   → ۲۰۰/۴۰۴ (اطلاعات عمومی کارشناس) */
  melkPublic: {
    /** فهرست آگهی‌های منتشرشدهٔ عمومی (صفحه‌بندی: page, limit) — بدون توکن */
    propertiesList: "properties/list",
    /** جزئیات کامل عمومی یک آگهی با کدملک — بدون توکن
     *  پاسخ: { inputs, details[{label,value,unit}], area, line, listOfRealtors,
     *          customerDescriptionList, fileScore, rateObj, changeWith, isPublished, ... } */
    propertyInfoByCode: (code: string | number) => `properties/info/by-code/${encodeURIComponent(String(code))}`,
    /** اطلاعات عمومی کارشناس با کد پرسنلی — بدون توکن */
    realtorInfoByCode: (code: string | number) => `realtors/info/by-code/${encodeURIComponent(String(code))}`,
  },
} as const;
