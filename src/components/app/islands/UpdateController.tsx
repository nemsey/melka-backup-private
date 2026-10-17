"use client";

/**
 * UpdateController — جزیرهٔ به‌روزرسانی PWA (PN-013 فاز ۴)
 * ---------------------------------------------------------------------------
 * ثبت Service Worker و گوش‌دادن به پیام‌های به‌روزرسانی کش. کاملاً
 * غیرمسدودکننده: پس از هیدراته‌شدن پوسته بارگذاری می‌شود و اگر دیر برسد
 * فقط کش آفلاین دیر فعال می‌شود — هیچ اثری بر رندر ندارد (به همین دلیل
 * جزیرهٔ جداست، نه بخشی از پوستهٔ ورود).
 */

import { SwRegister } from "@/components/app/SwRegister";

export default function UpdateController() {
  return <SwRegister />;
}
