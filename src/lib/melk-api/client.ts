/**
 * کلاینت HTTP اتصال واقعی به سامانه‌های ملک تبریز
 * ------------------------------------------------------
 * قرارداد واقعی (کشف‌شده با تحلیل باندل + تست زنده):
 *   ARM API:  https://arus-api.melketabriz.ir/api/apm/     (NestJS)
 *   ARM Pub:  https://arus-api.melketabriz.ir/api/public/
 *   PM API:   https://pm-api.melketabriz.ir/api/            (NestJS)
 *
 * ویژگی‌ها:
 *  - Timeout با AbortController + تلاش مجدد نمایی برای خطاهای شبکه/5xx
 *  - تشخیص «قطعی پایگاه داده سامانه» (خطای Mongoose buffering / 502 HTML)
 *    و ترجمه به پیام فارسی دقیق
 *  - نرمال‌سازی پوشه پاسخ NestJS: { statusCode, status, data, message }
 *  - هدر Authorization: Bearer + businessId اختیاری
 */

import { MelkApiError, type NestEnvelope } from "./types";

export interface HttpRequestOptions {
  method?: "GET" | "POST" | "DELETE";
  path: string;
  baseUrl: string;
  body?: unknown;
  token?: string;
  timeoutMs: number;
  maxRetries: number;
  headers?: Record<string, string>;
  query?: Record<string, string | number | undefined | null>;
}

/** پوشه درخواست/پاسخ استانداردشده */
export interface ArmCallResult<T> {
  /** داده اصلی پاسخ (envelope.data) */
  data: T;
  /** پیام سامانه (envelope.message) */
  message?: string;
}

/** ساخت رشته کوئری بدون مقادیر خالی */
export function buildQuery(query: Record<string, string | number | undefined | null> | undefined): string {
  if (!query) return "";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

/**
 * آیا بدنه HTML خطای nginx است؟ (502/504 وقتی سرویس پشتیبان بالای nginx خاموش است)
 */
function looksLikeHtml(text: string): boolean {
  const t = text.trimStart().slice(0, 200).toLowerCase();
  return t.startsWith("<!doctype html") || t.startsWith("<html") || t.includes("<head>") || t.includes("502 bad gateway");
}

/**
 * ترجمه خطاهای شناخته‌شده سامانه به MelkApiError فارسی
 */
function classifyServerFailure(status: number, bodyText: string): MelkApiError {
  // خطای شناخته‌شده Mongoose: پایگاه داده سامانه در دسترس نیست
  if (bodyText.includes("MongooseError") || bodyText.includes("buffering timed out")) {
    return new MelkApiError(
      "DB_DOWN",
      "پایگاه داده سامانه ملک تبریز در حال حاضر در دسترس نیست (خطای سرور طرف ملک تبریز). لطفاً بعداً تلاش کنید.",
      status,
      true
    );
  }
  if (looksLikeHtml(bodyText) || status === 502 || status === 504 || status === 503) {
    return new MelkApiError(
      "DB_DOWN",
      "سرویس پشتیبان سامانه ملک تبریز موقتاً از دسترس خارج شده است. لطفاً چند دقیقه دیگر تلاش کنید.",
      status,
      true
    );
  }
  return new MelkApiError("SERVER_ERROR", `خطای سرور سامانه ملک تبریز (${status}).`, status, true);
}

/**
 * فراخوانی یک نقطه اتصال سامانه ملک تبریز با نرمال‌سازی کامل.
 * خطاهای ۴xx غیرقابل تلاش مجددند؛ ۵xx/شبکه با backoff تلاش می‌شوند.
 */
export async function armCall<T = unknown>(opts: HttpRequestOptions): Promise<ArmCallResult<T>> {
  const base = opts.baseUrl.replace(/\/$/, "");
  const qs = buildQuery(opts.query);
  const url = `${base}/${opts.path.replace(/^\//, "")}${qs}`;
  let lastError: MelkApiError | null = null;
  let lastBodyText = "";

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
    try {
      const res = await fetch(url, {
        method: opts.method ?? "GET",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...(opts.method === "POST" || opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
          ...(opts.headers ?? {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        cache: "no-store",
      });

      const text = await res.text().catch(() => "");
      lastBodyText = text;

      if (res.status === 401) {
        throw new MelkApiError("UNAUTHORIZED", "اعتبار نشست سامانه ملک تبریز منقضی شده است.", 401, false);
      }
      if (res.status >= 500) {
        throw classifyServerFailure(res.status, text);
      }

      // بدنه JSON نیست ولی وضعیت موفق است؟ (مثل HEAD)
      if (looksLikeHtml(text)) {
        if (res.ok) return { data: null as T };
        throw classifyServerFailure(res.status, text);
      }

      let envelope: NestEnvelope<T> | null = null;
      try {
        envelope = text ? (JSON.parse(text) as NestEnvelope<T>) : null;
      } catch {
        envelope = null;
      }

      if (!res.ok) {
        // خطاهای ۴xx سامانه — NestJS envelope
        const msg = envelope?.message;
        if (res.status === 412) {
          throw new MelkApiError(
            "PRECONDITION_FAILED",
            msg ?? "پیش‌نیاز ورود در سامانه ملک تبریز برقرار نیست.",
            412,
            false
          );
        }
        if (res.status === 429) {
          throw new MelkApiError("RATE_LIMITED", msg ?? "درخواست بیش از حد مجاز به سامانه ملک تبریز.", 429, false);
        }
        if (envelope?.status === false || (envelope?.statusCode && envelope.statusCode >= 400)) {
          // تشخیص خطای کد پرسنلی نامعتبر / کد پیامکی غلط از پیام سامانه
          throw new MelkApiError("OTP_INVALID", msg ?? `خطای سامانه ملک تبریز (${res.status}).`, res.status, false);
        }
        throw new MelkApiError("UNKNOWN", msg ?? `پاسخ نامعتبر از سامانه (${res.status}).`, res.status, false);
      }

      // موفق — NestJS گاهی status:false با 200/201 برمی‌گرداند
      if (envelope?.status === false) {
        throw new MelkApiError(
          "OTP_INVALID",
          envelope.message ?? "سامانه ملک تبریز درخواست را نپذیرفت.",
          envelope.statusCode ?? 400,
          false
        );
      }
      return { data: (envelope?.data ?? (envelope as unknown as T)) as T, message: envelope?.message };
    } catch (err) {
      if (err instanceof MelkApiError) {
        lastError = err;
        if (!err.retryable) throw err;
      } else if (err instanceof Error && (err.name === "AbortError" || err.message?.includes("abort"))) {
        lastError = new MelkApiError("TIMEOUT", "پاسخ سامانه ملک تبریز در مهلت مقرر دریافت نشد.", 504, true);
      } else {
        lastError = new MelkApiError("NETWORK_ERROR", "ارتباط با سامانه ملک تبریز برقرار نشد.", 0, true);
      }
      if (attempt === opts.maxRetries) break;
      // backoff نمایی: 800ms, 1600ms, ...
      await new Promise((r) => setTimeout(r, 800 * Math.pow(2, attempt)));
    } finally {
      clearTimeout(timer);
    }
  }

  // اگر خطای ۵xx بود و متن Mongoose داشت، دقیق‌تر گزارش شود
  if (lastError?.code === "SERVER_ERROR" && lastBodyText) {
    const refined = classifyServerFailure(lastError.httpStatus, lastBodyText);
    if (refined.code === "DB_DOWN") return Promise.reject(refined);
  }
  throw lastError ?? new MelkApiError("UNKNOWN", "خطای نامشخص در ارتباط با سامانه ملک تبریز.", 500, false);
}

/** سازگاری با کدهای قبلی — فراخوانی خام */
export async function melkFetch<T>(opts: HttpRequestOptions): Promise<T> {
  const r = await armCall<T>(opts);
  return r.data;
}

/** سنجش تک‌فراخوانی (GET) برای پایش زنده — بدون تلاش مجدد */
export async function probeGet(baseUrl: string, path: string, timeoutMs = 8000): Promise<{ ok: boolean; httpStatus: number; latencyMs: number; bodyText: string }> {
  const url = `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const bodyText = await res.text().catch(() => "");
    return { ok: res.ok || res.status < 500 || bodyText.length > 0, httpStatus: res.status, latencyMs: Date.now() - started, bodyText };
  } finally {
    clearTimeout(timer);
  }
}
