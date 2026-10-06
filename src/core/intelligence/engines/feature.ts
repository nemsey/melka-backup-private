/**
 * قرارداد موتور ویژگی (FeatureEngine) — PHASE 3 / interface خالص
 * ------------------------------------------------------
 * مسئولیت: تبدیل «داده خام» به «ویژگی عددی/ترتیبی استاندارد» برای پیش‌بینی:
 * نرمال‌سازی، پنجره‌زمانی، مشتق‌گیری روند. تنها نقطه‌ای که از DTOهای
 * Repository به بردار ویژگی می‌رسیم.
 *
 * مرز (قوانین اجرایی):
 *  - تابع خالص — ورودی یکسان همیشه خروجی یکسان (بدون زمان در محاسبه).
 *  - صفر نوشتن.
 *
 * نسخه قرارداد: 1.
 * فاز پیاده‌سازی بدنه: PHASE 5. در PHASE 3 فقط قرارداد — بدون مصرف‌کننده.
 */

export interface FeatureQuery {
  tileId: string;
  domain: string;
  windowDays?: number;
  /** منبع داده خام — در PHASE 3 مجهول می‌ماند (مصرف‌کننده‌ای ندارد) */
  source?: Record<string, unknown>;
}

export interface FeatureSet {
  tileId: string;
  domain: string;
  computedAt: string;
  /** بردار ویژگی نام‌دار و بازتولیدپذیر (بدون شبه‌تصادفی) */
  vector: Record<string, number>;
  /** فهرست صادقانه ویژگی‌های در دسترس‌نیافته */
  missing: string[];
}

export interface FeatureEngine {
  readonly contractVersion: 1;
  compute(query: FeatureQuery): Promise<FeatureSet>;
}
