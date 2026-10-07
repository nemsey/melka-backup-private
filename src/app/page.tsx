/**
 * صفحهٔ اصلی — Server Shell + Client Islands (PN-013 فاز ۴)
 * ---------------------------------------------------------------------------
 * این فایل دیگر «use client» نیست: پوستهٔ سبکِ سرور است که تنها ریشهٔ
 * جزیرهٔ کلاینت را رندر می‌کند. HTML نخستین رنگ (اسپلش برند) بدون انتظار
 * برای هیچ JS به مرورگر می‌رسد؛ سپس هیدراته شدن، ماشین وضعیت
 * (boot → auth → otp → home ⇄ tile) را در MelkaApp زنده می‌کند.
 *
 * جزیره‌ها (dynamic، بدون SSR):
 *   · islands/AuthFlow        — فقط برای کاربرِ وارد‌نشده
 *   · islands/DashboardShell  — فقط پس از ورود (framer-motion + رجیستری کاشی)
 *   · islands/UpdateController— ثبت Service Worker (غیرمسدودکننده)
 *
 * کاشی‌ها: صفحهٔ هر کاشی از قبل تنبل است (lazyPage — قانون ۰۳۵-B-ح) و
 * فقط با باز شدن همان کاشی بارگذاری می‌شود.
 */

import { MelkaApp } from "@/components/app/MelkaApp";

export default function Page() {
  return <MelkaApp />;
}
