/**
 * PN-082 — خوانش محلی انقضای توکن آرم (پیش‌پرواز، بدون تماس شبکه)
 * ---------------------------------------------------------------
 * زمینه (گزارش مالک ۱۴۰۵/۰۸/۲۰): پنج ثبت آگهی شکست‌خورده در کاشی
 * فایل‌یابی — توکن دسترسی آرم (JWT با عمر ۴۸ ساعت) بی‌آنکه کسی ببیند
 * منقضی شده بود؛ فرم پیش می‌رفت و شکست تنها در «ثبت نهایی» آشکار
 * می‌شد با پیام خام سامانه («عدم احراز هویت!»).
 *
 * این ماژول صرفاً بار مفیدی JWT (ادعای exp) را می‌خواند — هیچ
 * اعتبارسنجی امضا نمی‌کند؛ مرجع نهایی همچنان خود سامانه آرم است.
 * خروجی: ميلی‌ثانیهٔ epoch انقضا یا null (توکن نامفهوم/بدون exp).
 */

/** رمزگشایی base64url بدون وابستگی بیرونی */
function base64UrlDecodeToJson(segment: string): Record<string, unknown> | null {
  try {
    const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const text = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * زمان انقضای توکن آرم (ادعای exp در JWT) به ميلی‌ثانیهٔ epoch.
 * توکن نامعتبر، بدون exp یا exp غیرعددی → null (بی‌طرف؛ داوری با سرور).
 */
export function armTokenExpiresAtMs(token: string | null | undefined): number | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const payload = base64UrlDecodeToJson(parts[1]);
  if (!payload) return null;
  const exp = payload.exp;
  if (typeof exp !== "number" || !Number.isFinite(exp) || exp <= 0) return null;
  return Math.round(exp * 1000);
}

/** آیا توکن همین حالا (با حاشیهٔ ایمنی) معتبر است؟ null → نامعلوم */
export function isArmTokenLikelyValid(token: string | null | undefined, marginMs = 120_000): boolean | null {
  const expMs = armTokenExpiresAtMs(token);
  if (expMs === null) return null;
  return expMs - Date.now() > marginMs;
}

/** بازگرداندن متن فارسی فاصله تا انقضا برای نمایش در رابط (اختیاری) */
export function armTokenExpiryLabel(token: string | null | undefined): string | null {
  const expMs = armTokenExpiresAtMs(token);
  if (expMs === null) return null;
  const diffMin = Math.round((expMs - Date.now()) / 60_000);
  if (diffMin <= 0) return "منقضی شده";
  if (diffMin < 60) return `${diffMin} دقیقه تا انقضا`;
  return `${Math.floor(diffMin / 60)} ساعت تا انقضا`;
}

/**
 * پیام راهنمای ورود مجدد آرم — یک منبع واحد برای مسیر ثبت، مجری توکن
 * و رابط کاربری (PN-082: خطای خام «عدم احراز هویت!» راهنما نداشت).
 */
export const ARM_RELOGIN_MESSAGE =
  "نشست سامانه آرم منقضی شده است — یک‌بار با «کد پرسنلی + پیامک» وارد شوید تا ثبت آگهی انجام شود.";
