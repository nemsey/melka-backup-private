/**
 * کلاینت HTTP برای حالت Real — اتصال به سامانه واقعی ملک تبریز
 * ------------------------------------------------------
 * الگوی Endpoint ها «فرض مستند» است (سند API ملک تبریز عمومی نیست)؛
 * پس از استعلام مستندات رسمی، فقط همین فایل و endpoints.ts ویرایش می‌شود.
 * ویژگی‌ها: Timeout با AbortController، تلاش مجدد نمایی، نرمال‌سازی خطا.
 */

import { MelkApiError } from "./types";
import type { MelkApiConfig } from "./config";

export interface HttpRequestOptions {
  method?: "GET" | "POST" | "DELETE";
  path: string;
  baseUrl: string;
  body?: unknown;
  token?: string;
  timeoutMs: number;
  maxRetries: number;
  headers?: Record<string, string>;
}

export async function melkFetch<T>(opts: HttpRequestOptions): Promise<T> {
  const url = `${opts.baseUrl.replace(/\/$/, "")}${opts.path}`;
  let lastError: MelkApiError | null = null;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
    try {
      const res = await fetch(url, {
        method: opts.method ?? "GET",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
          ...(opts.headers ?? {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        cache: "no-store",
      });

      if (res.status === 401) {
        throw new MelkApiError("UNAUTHORIZED", "اعتبار نشست منقضی شده است.", 401, false);
      }
      if (res.status === 404) {
        throw new MelkApiError("NOT_FOUND", "نقطه اتصال یافت نشد.", 404, false);
      }
      if (res.status >= 500) {
        throw new MelkApiError("SERVER_ERROR", `خطای سرور سامانه ملک تبریز (${res.status}).`, res.status, true);
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new MelkApiError("UNKNOWN", `پاسخ نامعتبر از سامانه: ${text.slice(0, 200)}`, res.status, false);
      }
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof MelkApiError) {
        lastError = err;
        if (!err.retryable) throw err;
      } else if (err instanceof Error && err.name === "AbortError") {
        lastError = new MelkApiError("TIMEOUT", "پاسخ سامانه ملک تبریز در مهلت مقرر دریافت نشد.", 504, true);
      } else {
        lastError = new MelkApiError("NETWORK_ERROR", "ارتباط با سامانه ملک تبریز برقرار نشد.", 0, true);
      }
      if (attempt === opts.maxRetries) break;
      // backoff نمایی: 400ms, 800ms, ...
      await new Promise((r) => setTimeout(r, 400 * Math.pow(2, attempt)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new MelkApiError("UNKNOWN", "خطای نامشخص در ارتباط با سامانه.", 500, false);
}

/** تست پایش اتصال (HEAD به ریشه‌ی سامانه) */
export async function probeHost(baseUrl: string, config: MelkApiConfig): Promise<number> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(config.timeoutMs, 6000));
  try {
    await fetch(baseUrl.replace(/\/$/, ""), { method: "HEAD", signal: controller.signal, cache: "no-store" });
    return Date.now() - started;
  } finally {
    clearTimeout(timer);
  }
}
