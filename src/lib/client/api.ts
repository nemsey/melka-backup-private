"use client";

/**
 * کلاینت API سمت مرورگر — نقطه اتصال واحد UI به مسیرهای داخلی
 * ویژگی‌ها: تزریق خودکار توکن، مدیریت خطای یکسان، خروج خودکار در 401.
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

export async function api<T = unknown>(
  path: string,
  init: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; auth?: boolean } = {}
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const useAuth = init.auth !== false;
  const token = tokenHolder?.() ?? null;
  if (useAuth && token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? "GET",
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiClientError("NETWORK_ERROR", "ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید.", 0);
  }

  if (res.status === 401 && useAuth) {
    onUnauthorized?.();
    throw new ApiClientError("UNAUTHORIZED", "نشست شما منقضی شده است.", 401);
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
