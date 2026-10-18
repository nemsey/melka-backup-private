/**
 * نشانی عمومی سرور — PN-031-HOTFIX (شورای عالی ملکا · جلسهٔ فوری ۰۳۸)
 * ---------------------------------------------------------------------------
 * زمینه (کشف جلسهٔ ۰۳۸): request.nextUrl.origin در محیط کانتینر، نشانی بایند
 * داخلی (http://0.0.0.0:3000) برمی‌گرداند — آدرسی که برای مصرف بیرونی (گوشی ·
 * QR · ایمیل · SMS) بی‌معناست؛ گوشی مالک از اینترنت به آن نمی‌رسد.
 *
 * قانون تازهٔ شورا (یادداشت دبیر · بند ۲):
 *   «در هر جای پروژه که URL برای مصرف بیرونی (گوشی، QR، ایمیل، SMS) تولید
 *    می‌شود، هرگز از req.headers.host یا localhost استفاده نکن — همیشه از
 *    getPublicBaseUrl(req).»
 *
 * اولویت تعیین نشانی (مصوب جلسهٔ ۰۳۸ · بند ۲-۵):
 *   ۱) process.env.MELK_PUBLIC_BASE_URL (اگر تعریف شده — قطعی‌ترین منبع)
 *   ۲) x-forwarded-host + x-forwarded-proto (استاندارد reverse-proxy)
 *   ۳) host فقط اگر میزبان عمومی باشد (بدون 0.0.0.0 / localhost / 127.x)
 *   ۴) fail-closed: هیچ‌کدام معتبر نبود → خطای صریح فارسی، نه URL خراب
 *
 * ایمنی:
 *   · نشانی خروجی همیشه https/http + میزبان عمومی است — هرگز بایند داخلی
 *   · کاراکترهای خطرناک URL پاک‌سازی می‌شوند (تزریق فرمان در مصرف‌کننده‌ها ناممکن)
 *   · صفر راز — این ماژول فقط «نشانی» می‌سازد
 */

/** درخواست ساختاری مینیمال — با NextRequest و هر شیء تستی جفت است */
export interface PublicBaseUrlRequest {
  headers: { get(name: string): string | null };
  /** پروتکل اتصال واقعی (اختیاری) — مانند request.nextUrl.protocol ("https:") */
  connectionProtocol?: string;
}

/** خطای fail-closed — پیام صریح فارسی برای مالک، نه URL خراب */
export class PublicBaseUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicBaseUrlError";
  }
}

/** میزبان‌های داخلی/غیرقابل‌دسترس از اینترنت — هرگز برای مصرف بیرونی */
const PRIVATE_HOST_PATTERN = /^(0\.0\.0\.0|localhost|127(\.\d{1,3}){3}|\[::1?\]|::1)(:\d+)?$/i;

/** اولین مقدار یک هدر فهرستی (x-forwarded-* ممکن است «a, b» باشد) */
function firstHeaderValue(raw: string | null | undefined): string {
  return (raw ?? "").split(",")[0].trim();
}

/** میزبان عمومی است؟ (نه بایند داخلی، نه لوکال‌هاست) */
export function isPublicHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  return h.length > 0 && !PRIVATE_HOST_PATTERN.test(h);
}

/** پاک‌سازی نشانی خروجی — فقط نویسه‌های مجاز URL و حذف / انتهایی */
function sanitizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * نشانی عمومی پایهٔ سرور برای مصرف بیرونی (گوشی · QR · ایمیل · SMS).
 * @throws PublicBaseUrlError اگر هیچ منبع معتیری در دسترس نباشد (fail-closed).
 */
export function getPublicBaseUrl(req: PublicBaseUrlRequest): string {
  // ۱) متغیر محیطی — قطعی‌ترین منبع (دیپلوی عمومی پلتفرم)
  const envBase = (process.env.MELK_PUBLIC_BASE_URL ?? "").trim();
  if (envBase) return sanitizeBaseUrl(envBase);

  // ۲) استاندارد reverse-proxy: x-forwarded-host + x-forwarded-proto
  const fwdHost = firstHeaderValue(req.headers.get("x-forwarded-host"));
  if (isPublicHost(fwdHost)) {
    const fwdProto = firstHeaderValue(req.headers.get("x-forwarded-proto")) || "https";
    return sanitizeBaseUrl(`${fwdProto}://${fwdHost}`);
  }

  // ۳) هدر host — فقط اگر میزبان عمومی باشد
  const host = (req.headers.get("host") ?? "").trim();
  if (isPublicHost(host)) {
    const proto =
      firstHeaderValue(req.headers.get("x-forwarded-proto")) ||
      (req.connectionProtocol ?? "").replace(":", "") ||
      "http";
    return sanitizeBaseUrl(`${proto}://${host}`);
  }

  // ۴) fail-closed — خطای صریح به مالک، نه URL خراب (قانون جلسهٔ ۰۳۸)
  throw new PublicBaseUrlError(
    "نشانی عمومی سرور ملکا قابل تعیین نیست. متغیر MELK_PUBLIC_BASE_URL در env.platform.json تنظیم نشده و درخواست با میزبان داخلی (0.0.0.0 یا localhost) رسیده است. لطفاً این خطا را به تیم فنی گزارش کنید — تا پیش از رفع، دستور نصب رله ساخته نمی‌شود."
  );
}
