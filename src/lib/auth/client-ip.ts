/**
 * client-ip.ts — PN-008 BLOCK 3: استخراج IP کلاینت با احترام به Trusted Proxy
 * ---------------------------------------------------------------------------
 * مدل تهدید (شواهد تجربی ۱۴۰۵/۰۷/۱۶ — download/pn008/trusted-proxy-test.json):
 *   · مسیر عمومی (preview/publish): Caddy پلتفرم X-Forwarded-For را با IP واقعی
 *     کلاینت «بازنویسی» می‌کند (آزمون جعل 5.6.7.8 → ثبت 21.0.0.1 واقعی) — مطمئن.
 *   · دسترسی مستقیم به :3000 فقط از «درون کانتینر» ممکن است (پورت publicly
 *     اکسپوز نیست) — در آن مسیر XFF قابل جعل است (آزمون 1.2.3.4 ثبت شد).
 *
 * تصمیم (بند ۳.۳ دستور + شواهد):
 *   ۱) X-Real-IP — اولویت مطلق (اگر پروکسی رسمی بگذارد؛ غیرقابل‌جعل از بیرون)
 *   ۲) نخستین مدخل X-Forwarded-For پاک‌سازی‌شده — فقط ارزش‌های محدود IP؛
 *      در تولید این مقدار عین IP واقعی است چون Caddy بازنویسی می‌کند
 *   ۳) بدون هیچ‌کدام = undefined (نرخ‌سنج به سبد کدپرسنلی برمی‌گردد — امن)
 * تک‌نقطه تصمیم: همهٔ روت‌ها فقط از این helper می‌خوانند (الگوی scope.ts).
 */

const IP_LIKE = /^[0-9a-fA-F.:]{3,45}$/;

export function clientIp(request: Request): string | undefined {
  // ۱) X-Real-IP — عین پروکسی مطمئن (اگر وجود داشته باشد)
  const real = request.headers.get("x-real-ip")?.trim();
  if (real && IP_LIKE.test(real)) return real;

  // ۲) X-Forwarded-For — فقط نخستین مدخل با اعتبارسنجی شکل IP
  //    (در تولید: مقدار عین Caddy بازنویسی‌شده است؛ جعل چندتایی هم به مدخل نخستِ
  //    نامعتبر محدود می‌شود؛ در توسعه: رفتار پیشین حفظ می‌شود)
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim() ?? "";
    if (first && IP_LIKE.test(first)) return first;
  }
  return undefined;
}
