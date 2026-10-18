#!/usr/bin/env bun
/** PN-026 · فاز ۴ — نقشهٔ سرعت (۱۰ گلوگاه · فقط شناسایی · صفر اجرا) */
import { writeFileSync } from "node:fs";

const speedMap = {
  phase: "فاز ۴ — نقشهٔ سرعت (فقط شناسایی)",
  rule: "قاعدهٔ ۷ — تصمیم با مالک · صفر اجرای خودکار",
  methodology: "اندازه‌گیری زنده در همین چک‌آپ (بُعد ۹: ۱۰ اجرا × ۱۲ endpoint + perf-budget ۱۲ سنجه + تحلیل کد مخزن) + ریشه‌یابی کد فیلترها",
  bottlenecks: [
    {
      num: 1, where: "GET /api/crm/arm-catalog/requests — فیلترهای متنی (customerName · sanad · realtorName)",
      evidence: "P95 = ۲٬۹۵۵ms · بیشینه ۷٬۱۵۹ms (سنجهٔ زندهٔ بُعد ۶/۹)",
      cause: "فیلتر متنی پس از واکشی در JS نرمال‌سازی می‌شود (request.repository.ts:224+) — نرمال‌سازی فارسی/ارقام روی ~۲۵٬۵۳۰ ردیف با آبجکت‌های سنگین",
      solution: "ستون‌های سایهٔ نرمال‌شدهٔ ازپیش‌محاسبه (customerNameNorm · sanadNorm · realtorNameNorm) + ایندکس SQLite → فیلتر در سطح SQL",
      gain: "~۹۰-۹۵٪ (۳۰۰ms → زیر ۱۰۰ms)", risk: "🟠 (افزودنی — مهاجرت داده + بازنویسی کوئری · نیازمند تست)", time: "~۹۰ دقیقه",
    },
    {
      num: 2, where: "GET /api/crm/arm-catalog/listings — فیلترهای متنی (realtorName · ownerName · address)",
      evidence: "P95 = ۱٬۲۵۳ms (۱۰ اجرا)",
      cause: "همان الگو — property.repository.ts:224 — records.filter با normalizeFilterInput روی ۲۷٬۷۸۰ ردیف",
      solution: "مانند گلوگاه ۱ (ستون نرمال + ایندکس) — زیرساخت مشترک",
      gain: "~۸۵-۹۰٪", risk: "🟠", time: "~۶۰ دقیقه (پس از ۱)",
    },
    {
      num: 3, where: "GET /api/market-index (شاخص بازار M7)",
      evidence: "P50 = ۷۹۳ms · P95 = ۹۲۱ms (۱۰ اجرا)",
      cause: "محاسبهٔ شاخص روی هر فراخوانی از ۲۷k آگهی + ۲۵k درخواست",
      solution: "کش TTL ۱۵-۶۰ دقیقه‌ای (Worker قبلاً چرخهٔ ۶۰ دقیقه دارد — کافی است نتیجه ذخیره و بازخوانی شود)",
      gain: "~۸۰٪ (پاسخ از کش < ۵۰ms)", risk: "🟢 (فقط خواندنی + انقضا)", time: "~۳۰ دقیقه",
    },
    {
      num: 4, where: "GET /api/crm/arm-catalog/requests — بدون فیلتر (فهرست کامل)",
      evidence: "P50 = ۱۴۴ms · P95 = ۱۶۱ms",
      cause: "سریال‌سازی ردیف‌های سنگین (detailsJson/inputsJson) برای ۵۰ ردیف + شمارش total روی ۲۵k",
      solution: "انتخاب ستون هدفمند (select سبک‌تر برای فهرست) + شمارش تقریبی کش‌شده",
      gain: "~۴۰٪", risk: "🟢", time: "~۴۵ دقیقه",
    },
    {
      num: 5, where: "GET /api/crm/arm-catalog/listings?code=… (جست‌وجو با کد)",
      evidence: "۲٬۰۴۹ms (بُعد ۶) — در برابر ۷۱ms بدون فیلتر",
      cause: "غنی‌سازی هدفمندِ زنده از ARM در هر جست‌وجوی کد (طراحی — enrichArmListings تا ۵ ردیف + تماس شبکه)",
      solution: "پرچم اختیاری enrich=0 برای جست‌وجوهای صرفاً محلی + کش غنی‌سازی ۵ دقیقه‌ای",
      gain: "~۸۰٪ برای جست‌وجوی محلی", risk: "🟢", time: "~۳۰ دقیقه",
    },
    {
      num: 6, where: "RAM فرایند تولید",
      evidence: "۵۷۸MB (هدف < ۵۰۰MB · perf-budget)",
      cause: "Bun + Next standalone + ۶۳ جدول + کش‌های درون-حافظهٔ گراف (۱۴۳k گره در peak rebuild)",
      solution: "بازبینی سقف کش گراف (generation size) + آزادسازی پس از ساخت — یا پذیرش بودجهٔ واقعی ۶۵۰MB",
      gain: "-۱۰۰ تا -۱۵۰MB", risk: "🟠", time: "~۶۰ دقیقه",
    },
    {
      num: 7, where: "RAM پیک بیلد",
      evidence: "۲٬۲۰۰MB (هدف < ۱۵۰۰MB)",
      cause: "tracing کامل Next + ۶۵۸ ماژول + آینهٔ PG اسکیما در پروژه",
      solution: "NODE_OPTIONS=--max-old-space-size=۱۵۳۶ برای build + پارک استاندارد (موجود) — فقط سقف‌گذاری، نه کاهش واقعی",
      gain: "سقف‌گذاری خطا-ایمن", risk: "🟡 (خطر OOM در بیلد اگر کم‌گذاشته شود)", time: "~۱۵ دقیقه",
    },
    {
      num: 8, where: "حلقهٔ نگهبان EADDRINUSE (کشف زندهٔ بُعد ۲)",
      evidence: "۱٬۱۹۹+ اسپاون بی‌اثر از 20:24:58 — هر ۵ ثانیه یک بوت ناموفق",
      cause: "تعارض دو ناظر (سرور دستی مراسم + نگهبان)",
      solution: "فاز ۵ باگ-رفع: خاتمهٔ سرور دستی → نگهبان جانشین (۵ ثانیه) — سپس صفر حلقه",
      gain: "۱۰۰٪ حذف نویز + CPU جزئی + ۱٫۴KB/min لاگ", risk: "🟢 (۱۰ ثانیه وقفه)", time: "~۱۰ دقیقه",
    },
    {
      num: 9, where: "GET /api/intelligence/status — فراخوانی سرد",
      evidence: "۸۱۱ms سرد → ۱۶۳ms گرم (۱۰ اجرا)",
      cause: "گردآوری ۱۶ موتور + گراف در فراخوانی نخست",
      solution: "پیش-گرمایش در بوت (instrumentation پس از بالا آمدن یک بار صدا بزند) — گرم از همان اول",
      gain: "سرد→گرم از ~۸۰۰ به ~۱۶۰ms", risk: "🟢", time: "~۲۰ دقیقه",
    },
    {
      num: 10, where: "بار اول JS (Initial JS)",
      evidence: "۲۸۱KB (بودجه ۳۰۰KB — ۹۴٪ مصرف)",
      cause: "چانک مشترک با همهٔ کاشی‌ها در باندل اولیه",
      solution: "تقسیم کد کاشی‌های کم‌بازدید (React.lazy برای صفحه‌های کاشی — معماری کاشی‌محور از قبل آماده)",
      gain: "-۲۰ تا -۳۰٪ (~۸۵KB)", risk: "🟡 (باید تست شود با قید تک-صفحه)", time: "~۹۰ دقیقه",
    },
  ],
  priorityOrder: [8, 1, 2, 3, 5, 9, 4, 6, 10, 7],
  rationale: "۸ = رفع باگ (سریع‌ترین برد) · ۱-۲ = بیشترین درد کاربر روزانه (فیلترهای پرکاربرد M1/M2) · ۳/۵/۹ = برد سریع کم‌ریسک · ۶/۷/۱۰ = بهینه‌سازی زیرساخت",
  totalEstimated: "~۷ ساعت اگر همه با مجوز اجرا شوند",
};

writeFileSync("/home/z/my-project/download/pn026/speed-map.json", JSON.stringify(speedMap, null, 1));
console.log("✓ speed-map.json — ۱۰ گلوگاه با شاهد و راهکار و اولویت");
