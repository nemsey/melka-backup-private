"use client";

/**
 * کلاینت API سمت مرورگر — نقطه اتصال واحد UI به مسیرهای داخلی
 * ویژگی‌ها: تزریق خودکار توکن، مدیریت خطای یکسان، خروج خودکار در 401.
 *
 * P6530 / گام ۶ (نکتهٔ بسیار مهم ۳ — رفع 502/504):
 *   مهلت پیش‌فرض ۹۰ ثانیه با AbortController — بروزرسانی‌های سنگین سامانهٔ
 *   ملک تبریز (فهرست‌های بزرگ) دیگر مرورگر را بی‌پایان معلق نمی‌کنند؛
 *   خطای 502/504 سامانه مبدأ با پیام فارسی شفاف و راهنمای ادامه (ازسرگیری
 *   از آخرین نقطه) به کاربر می‌رسد، نه هنگ بی‌پایان.
 *
 * P6546 / گام پنجم-پ-۳ — تاب‌آوری بروزرسانی (رفع کامل 502/504/مهلت):
 *   apiSync برای فراخوانی‌های بروزرسانیِ idempotent (برش‌های دارای checkpoint):
 *   تا ۳ تلاش خودکار — هر تلاش از آخرین نقطهٔ کامل ادامه می‌یابد (checkpoint)
 *   پس تلاش مجدد نه از صفر شروع می‌شود نه داده تکراری می‌سازد؛ خطای گذرای
 *   502/504/مهلت به همین ترتیب خوددرمان می‌شود و کاربر پیام خطا نمی‌بیند.
 */

export class ApiClientError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

let tokenHolder: (() => string | null) | null = null;
let onUnauthorized: (() => void) | null = null;

/** ثبت منبع توکن و رفتار خروج خودکار (توسط Store اصلی) */
export function bindAuth(getToken: () => string | null, handle401: () => void): void {
  tokenHolder = getToken;
  onUnauthorized = handle401;
}

/** مهلت پیش‌فرض درخواست‌های «سبک» — میلی‌ثانیه (۲۰ ثانیه · شورا-ن۰۶۸)
 * PN-041-R (فاز ۱·بند ۱.۵ + فاز ۲·بند ۲.۴): مهلت تطبیقی —
 *   · سبک (ورود/اعتبارسنجی/متادیتا): ۲۰ ثانیه — شکست سریع با پیام صادقانه
 *   · سنگین (فهرست‌ها/کاتالوگ/همگام‌سازی): ۱۵۰ ثانیه — زیر بودجهٔ رله
 * پیش از این همه‌چیز ۹۰ث صبر می‌کرد — با رلهٔ قطع، کاربر ۹۰ث در تاریکی می‌ماند. */
const LIGHT_TIMEOUT_MS = 20_000;
const HEAVY_TIMEOUT_MS = 150_000;
const DEFAULT_TIMEOUT_MS = LIGHT_TIMEOUT_MS;

/** مسیرهای «سنگین» — فهرست‌های صفحه‌بندی‌دار و همگام‌سازی (۱۵۰ث) */
const HEAVY_PATH_PATTERNS: readonly (string | RegExp)[] = [
  "/crm/arm-catalog/listings",
  "/crm/arm-catalog/requests",
  "/listings",
  "/requests",
  "/sync",
  "/experts",
  "/matching/search",
  "/graphs",
];

/** داوری مسیر → مهلت — سبک ۲۰ث · سنگین ۱۵۰ث (آزمون‌پذیر · خالص) */
export function getAdaptiveTimeoutMs(path: string): number {
  const p = path.split("?")[0];
  if (HEAVY_PATH_PATTERNS.some((pat) => (typeof pat === "string" ? p.includes(pat) : pat.test(p)))) {
    return HEAVY_TIMEOUT_MS;
  }
  return LIGHT_TIMEOUT_MS;
}

/** PN-013/مرحلهٔ ۶ — شناسهٔ همبستگی درخواست: هر فراخوانی UI یک شناسهٔ
 *  ‎x-request-id‎ می‌سازد؛ سرور همان را در لاگ/متریک و پاسخ برمی‌گرداند
 *  ⇒ ردیابی سرتاسری UI → proxy → روت → سرویس → لاگ. */
function correlationId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `req-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export async function api<T = unknown>(
  path: string,
  init: { method?: "GET" | "POST" | "PATCH" | "DELETE" | "PUT"; body?: unknown; auth?: boolean; timeoutMs?: number } = {}
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  // PN-013/مرحلهٔ ۶ — شناسهٔ همبستگی UI (ردیابی سرتاسری همین فراخوانی)
  headers["x-request-id"] = correlationId();
  const useAuth = init.auth !== false;
  const token = tokenHolder?.() ?? null;
  if (useAuth && token) headers.Authorization = `Bearer ${token}`;

  // P6530/گام ۶ — مهلت الزامی: هیچ درخواستی بی‌پایان معلق نمی‌ماند
  // PN-041-R: مهلت تطبیقی مسیرمحور — مگر آنکه فراخواننده صریح تعیین کند
  const timeoutMs = init.timeoutMs ?? getAdaptiveTimeoutMs(path);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? "GET",
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      const isLight = timeoutMs <= LIGHT_TIMEOUT_MS;
      throw new ApiClientError(
        "TIMEOUT",
        isLight
          ? "پاسخ سرور در مهلت ۲۰ ثانیه دریافت نشد — رلهٔ گوشی خاموش یا بی‌پاسخ است. Termux را باز کنید و دوباره بزنید."
          : "پاسخ سرور در مهلت ۱۵۰ ثانیه دریافت نشد (فهرست سنگین). بروزرسانی در پس‌زمینه ادامه دارد — دقایقی دیگر دوباره بزنید؛ عملیات از همان نقطهٔ قطع‌شده ادامه می‌یابد.",
        504
      );
    }
    throw new ApiClientError("NETWORK_ERROR", "ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید.", 0);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 && useAuth) {
    onUnauthorized?.();
    throw new ApiClientError("UNAUTHORIZED", "نشست شما منقضی شده است.", 401);
  }

  // P6530/گام ۶ — 502/504 با پیام فارسی شفاف (خطای دروازه/سرور مبدأ)
  if (res.status === 502 || res.status === 504) {
    throw new ApiClientError(
      "UPSTREAM_UNAVAILABLE",
      `سامانه ملک تبریز موقتاً پاسخ نمی‌دهد (خطای ${res.status}). داده‌های فعلی نمایش داده می‌شوند؛ چند لحظه بعد دوباره بروزرسانی را بزنید — عملیات از همان نقطهٔ قطع‌شده ادامه می‌یابد.`,
      res.status
    );
  }

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const p = payload as { code?: string; message?: string } | null;
    throw new ApiClientError(p?.code ?? "UNKNOWN", p?.message ?? `خطای سرور (${res.status})`, res.status);
  }
  return payload as T;
}

/**
 * P6546/گام پنجم-پ-۳ — فراخوانی بروزرسانیِ تاب‌آور (برش‌های idempotent دارای checkpoint).
 * تا `maxAttempts` تلاش خودکار روی خطاهای گذرای TIMEOUT / UPSTREAM_UNAVAILABLE (502/504)
 * با وقفهٔ نمایی؛ هر تلاش از آخرین نقطهٔ کامل ادامه می‌یابد (قانون داده اول، سپس checkpoint).
 * خطای ۴xx (غیرقابل تلاش) و UNAUTHORIZED هرگز تلاش مجدد نمی‌شوند.
 */
export async function apiSync<T = unknown>(
  path: string,
  init: { method?: "GET" | "POST" | "PATCH" | "DELETE" | "PUT"; body?: unknown; timeoutMs?: number; maxAttempts?: number } = {},
  onRetry?: (attempt: number, error: ApiClientError) => void
): Promise<T> {
  const maxAttempts = Math.min(Math.max(init.maxAttempts ?? 3, 1), 5);
  let lastError: ApiClientError | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await api<T>(path, init);
    } catch (err) {
      const e = err as ApiClientError;
      const transient = e.code === "TIMEOUT" || e.code === "UPSTREAM_UNAVAILABLE" || e.code === "NETWORK_ERROR";
      if (!transient || attempt === maxAttempts) throw err;
      lastError = e;
      onRetry?.(attempt, e);
      // وقفهٔ نمایی مهربان: ۳ث · ۸ث — سرور مبدأ در ساعت اوج نیاز به نفس دارد
      await new Promise((r) => setTimeout(r, attempt === 1 ? 3000 : 8000));
    }
  }
  throw lastError ?? new ApiClientError("UNKNOWN", "خطای نامشخص در بروزرسانی.", 0);
}

/**
 * PN-002 گام ۶-۲ — دانلود فایل باینری احراز‌هویت‌شده (خروجی اکسل کل فهرست).
 * هم‌کلاف api() از توکن سراسری استفاده می‌کند؛ خروجی Blob برای لینک دانلود.
 */
export async function apiBlob(path: string, timeoutMs = 120_000): Promise<Blob> {
  const headers: Record<string, string> = {};
  const token = tokenHolder?.() ?? null;
  if (token) headers.Authorization = `Bearer ${token}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(path, { headers, signal: controller.signal });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string; code?: string } | null;
      throw new ApiClientError(body?.code ?? "UNKNOWN", body?.message ?? "خطا در دریافت فایل.", res.status);
    }
    return await res.blob();
  } catch (err) {
    if (err instanceof ApiClientError) throw err;
    if ((err as Error)?.name === "AbortError") throw new ApiClientError("TIMEOUT", "دریافت فایل بیش از حد طول کشید.", 0);
    throw new ApiClientError("NETWORK_ERROR", "خطای شبکه در دریافت فایل.", 0);
  } finally {
    clearTimeout(timer);
  }
}

/** PN-002 گام ۶-۲ — راه‌انداز دانلود Blob به صورت فایل (کلاینت) */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * PN-003 گام ۴-۲ — بارگذاری فایل (multipart/form-data) به سرور
 * برای «آپلود اطلاعات کل فهرست به صورت فایل اکسل» (ایمپورت).
 */
export async function apiUpload<T = unknown>(
  path: string,
  file: File,
  timeoutMs = 300_000
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = tokenHolder?.() ?? null;
  if (token) headers.Authorization = `Bearer ${token}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(path, { method: "POST", headers, body: form, signal: controller.signal });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string; code?: string } | null;
      throw new ApiClientError(body?.code ?? "UNKNOWN", body?.message ?? "بارگذاری فایل ناموفق بود.", res.status);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof ApiClientError) throw err;
    if ((err as Error)?.name === "AbortError") throw new ApiClientError("TIMEOUT", "بارگذاری فایل بیش از حد طول کشید.", 0);
    throw new ApiClientError("NETWORK_ERROR", "خطای شبکه در بارگذاری فایل.", 0);
  } finally {
    clearTimeout(timer);
  }
}
