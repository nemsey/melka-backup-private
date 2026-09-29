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

/** مهلت پیش‌فرض درخواست‌ها — میلی‌ثانیه (۹۰ ثانیه) */
const DEFAULT_TIMEOUT_MS = 90_000;

export async function api<T = unknown>(
  path: string,
  init: { method?: "GET" | "POST" | "PATCH" | "DELETE" | "PUT"; body?: unknown; auth?: boolean; timeoutMs?: number } = {}
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const useAuth = init.auth !== false;
  const token = tokenHolder?.() ?? null;
  if (useAuth && token) headers.Authorization = `Bearer ${token}`;

  // P6530/گام ۶ — مهلت الزامی: هیچ درخواستی بی‌پایان معلق نمی‌ماند
  const timeoutMs = init.timeoutMs ?? DEFAULT_TIMEOUT_MS;
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
      throw new ApiClientError(
        "TIMEOUT",
        "پاسخ سرور در مهلت مقرر دریافت نشد (مهلت ۹۰ ثانیه). بروزرسانی در پس‌زمینه ادامه دارد — دقایقی دیگر دوباره بروزرسانی را بزنید؛ عملیات از همان نقطهٔ قطع‌شده ادامه می‌یابد.",
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
