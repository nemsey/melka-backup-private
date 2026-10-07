/**
 * Logger ساختاریافته — P2-05
 * ------------------------------------------------------
 * یک خط JSON در هر رویداد (حالت JSON) با فیلدهای الزامی:
 *   ts, level, category, operation, status,
 *   requestId, traceId, userId, tenantId, agentId, tileId,
 *   duration, errorCode, detail
 *
 * اصول:
 *  ۱) تنها نقطهٔ خروجی لاگ در کل src/ — از process.stdout.write
 *     (نه console.*)؛ گارد: scripts/audit-log-safety.sh هر console.*
 *     خارج از این ماژول را خطا می‌دهد.
 *  ۲) پاک‌سازی تدافعی: هیچ توکن/OTP/شماره موبایل/کد ملی در خروجی
 *     نمی‌تواند نشت کند (sanitizeDetail) — حتی اگر فراخواننده اشتباه کند.
 *  ۳) بدون وابستگی به Next/Prisma — قابل استفاده در middleware،
 *     instrumentation، روت‌ها و lib.
 */

/** شناسه مستأجر — سامانه تک‌مستأجری (طراحی چندمستأجری PHASE 9+) */
const TENANT_ID = "melk-tabriz";

/** الگوی نام فیلد حساس — مقدارش هرگز ثبت نمی‌شود */
const SENSITIVE_KEY = /token|otp|secret|password|passwd|authorization|cookie/i;

/** شماره موبایل ایران (09xxxxxxxxx یا +989xxxxxxxxx) */
const MOBILE_PATTERN = /(\+98|0098|0)?9\d{9}\b/g;

/** رشته عددی بلند (کد ملی ۱۰ رقمی و امثال آن) */
const LONG_DIGITS_PATTERN = /\b\d{10,12}\b/g;

/** پاک‌سازی بازگشتی مقدارها + حذف فیلدهای حساس */
function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[deep]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return value.replace(MOBILE_PATTERN, "[masked-mobile]").replace(LONG_DIGITS_PATTERN, "[masked-number]");
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitizeValue(v, depth + 1));
  if (typeof value === "object") return sanitizeDetail(value as Record<string, unknown>, depth + 1);
  return String(value);
}

function sanitizeDetail(detail: Record<string, unknown>, depth = 0): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detail)) {
    if (SENSITIVE_KEY.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    out[key] = sanitizeValue(value, depth);
  }
  return out;
}

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogCategory = "auth" | "sync" | "agent" | "route" | "system";
export type LogStatus = "start" | "ok" | "fail";

export interface LogEventInput {
  level?: LogLevel;
  category: LogCategory;
  operation: string;
  status: LogStatus;
  /** شناسه درخواست — اگر داده نشود تولید می‌شود */
  requestId?: string;
  /** ردیابی زنجیره — پیش‌فرض همان requestId */
  traceId?: string;
  /** کد پرسنلی بازیگر (null برای رویدادهای سیستمی) */
  userId?: string | null;
  /** کاشی ایجنت مرتبط (null برای رویدادهای غیرایجنتی) */
  agentId?: string | null;
  tileId?: string | null;
  /** مدت عملیات به میلی‌ثانیه */
  duration?: number | null;
  /** کد خطای استاندارد (MelkErrorCode) */
  errorCode?: string | null;
  /** زمینه آزاد — پیش از نوشتن پاک‌سازی می‌شود */
  detail?: Record<string, unknown>;
}

/** ساخت شناسه درخواست تازه */
export function newLogId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `log-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

let minLevel: LogLevel = (process.env.MELK_LOG_LEVEL as LogLevel) || "info";
const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * رویداد ساختاریافته — تنها نقطهٔ خروجی لاگ سامانه.
 * خروجی: یک خط JSON در stdout.
 */
export function logEvent(input: LogEventInput): void {
  const level = input.level ?? "info";
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;

  const requestId = input.requestId ?? newLogId();
  const line = {
    ts: new Date().toISOString(),
    level,
    category: input.category,
    operation: input.operation,
    status: input.status,
    requestId,
    traceId: input.traceId ?? requestId,
    userId: input.userId ?? null,
    tenantId: TENANT_ID,
    agentId: input.agentId ?? null,
    tileId: input.tileId ?? null,
    duration: input.duration ?? null,
    errorCode: input.errorCode ?? null,
    ...(input.detail ? { detail: sanitizeDetail(input.detail) } : {}),
  };
  process.stdout.write(JSON.stringify(line) + "\n");
}

/** تغییر حداقل سطح لاگ (تست) */
export function setMinLogLevel(level: LogLevel): void {
  minLevel = level;
}

// ==========================================================================
// پوشش‌های رایی برای رویدادهای الزامی P2-05
// ==========================================================================

import { recordMetric } from "@/lib/observability/metrics";

/** رویداد احراز هویت — ورود/خروج/شکست OTP (بدون داده حساس) */
export function logAuth(operation: "login" | "logout" | "otp-failed", opts: { userId?: string | null; status: LogStatus; errorCode?: string | null; requestId?: string; detail?: Record<string, unknown> } & Partial<LogEventInput> = { status: "ok" }): void {
  logEvent({
    category: "auth",
    operation,
    status: opts.status,
    userId: opts.userId ?? null,
    errorCode: opts.errorCode ?? null,
    requestId: opts.requestId,
    traceId: opts.traceId,
    level: opts.status === "fail" ? "warn" : "info",
    detail: opts.detail,
  });
}

/** رویداد همگام‌سازی — آغاز/پایان/شکست (روی هر دو مسیر legacy و incremental) */
export function logSync(operation: "sync-run", opts: { status: LogStatus; mode: "legacy" | "incremental"; duration?: number | null; errorCode?: string | null; detail?: Record<string, unknown> } & Partial<LogEventInput>): void {
  // PN-013/مرحلهٔ ۶ — متریک استاندارد sync.duration (فقط رویدادهای دارای مدت)
  if (typeof opts.duration === "number" && Number.isFinite(opts.duration)) {
    recordMetric("sync.duration", opts.duration, { mode: opts.mode, status: opts.status });
  }
  logEvent({
    category: "sync",
    operation,
    status: opts.status,
    duration: opts.duration ?? null,
    errorCode: opts.errorCode ?? null,
    requestId: opts.requestId,
    traceId: opts.traceId,
    level: opts.status === "fail" ? "error" : "info",
    detail: { mode: opts.mode, ...(opts.detail ?? {}) },
  });
}

/** رویداد فراخوانی ایجنت — شروع/پایان/شکست با کاشی و مدت */
export function logAgentCall(opts: { tileId: string; agentName?: string; operation: string; status: LogStatus; duration?: number | null; errorCode?: string | null; userId?: string | null } & Partial<LogEventInput>): void {
  // PN-013/مرحلهٔ ۶ — متریک استاندارد agent.latency (فقط رویدادهای دارای مدت)
  if (typeof opts.duration === "number" && Number.isFinite(opts.duration)) {
    recordMetric("agent.latency", opts.duration, { tileId: opts.tileId, operation: opts.operation });
  }
  logEvent({
    category: "agent",
    operation: opts.operation,
    status: opts.status,
    tileId: opts.tileId,
    agentId: opts.tileId,
    duration: opts.duration ?? null,
    errorCode: opts.errorCode ?? null,
    userId: opts.userId ?? null,
    requestId: opts.requestId,
    traceId: opts.traceId,
    level: opts.status === "fail" ? "error" : "info",
    detail: opts.agentName ? { agentName: opts.agentName } : undefined,
  });
}

/** رویداد پوشش روت — آغاز/پایان با مدت (middleware) */
export function logRoute(opts: { method: string; path: string; status: LogStatus; httpStatus?: number; duration?: number | null; requestId?: string; userId?: string | null; errorCode?: string | null }): void {
  logEvent({
    category: "route",
    operation: `${opts.method} ${opts.path}`,
    status: opts.status,
    duration: opts.duration ?? null,
    errorCode: opts.errorCode ?? null,
    requestId: opts.requestId,
    userId: opts.userId ?? null,
    level: opts.status === "fail" ? "warn" : "info",
    detail: { httpStatus: opts.httpStatus ?? null },
  });
}

// ==========================================================================
// withRouteLog — پوشش کامل آغاز/پایان/مدت برای روت‌های دارای رویداد الزامی
// ==========================================================================

/**
 * بسته‌بندی handler روت با لاگ کامل: start → ok|fail + duration واقعی.
 * پاسخ HTTP عیناً عبور داده می‌شود (صفر تغییر در قرارداد).
 *
 * PN-013/مرحلهٔ ۶ — Correlation ID سرتاسری + متریک api.latency:
 *   · شناسهٔ درخواست = هدر ‎x-request-id‎ کلاینت (اگر فرستاده شده) یا تازه؛
 *     همین شناسه در پاسخ به‌عنوان هدر برگردانده می‌شود (ردیابی UI → روت → لاگ).
 *   · مدت هر فراخوانی در متریک استاندارد api.latency ثبت می‌شود (برچسب: مسیر).
 */
export function withRouteLog<Ctx = unknown>(
  operation: string,
  handler: (request: Request, ctx: Ctx) => Promise<Response>
): (request: Request, ctx: Ctx) => Promise<Response> {
  return async (request: Request, ctx: Ctx): Promise<Response> => {
    // Correlation ID — از UI می‌آید یا همین‌جا ساخته می‌شود
    const requestId = request.headers.get("x-request-id") ?? newLogId();
    const startedAt = Date.now();
    const url = new URL(request.url);
    logRoute({ method: request.method, path: url.pathname, status: "start", requestId });

    // پاسخ با هدر شناسه — بدون دست‌کوردن بدنه/وضعیت (رونوشت تازهٔ سرصفحه‌ها)
    const withCorrelationHeader = (response: Response): Response => {
      try {
        const headers = new Headers(response.headers);
        headers.set("x-request-id", requestId);
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      } catch {
        return response; // اگر بدنهٔ جریانی قابل رونوشت نبود — همان پاسخ خام
      }
    };

    try {
      const response = await handler(request, ctx);
      const duration = Date.now() - startedAt;
      recordMetric("api.latency", duration, { path: url.pathname });
      logRoute({
        method: request.method,
        path: url.pathname,
        status: response.status >= 500 ? "fail" : "ok",
        httpStatus: response.status,
        duration,
        requestId,
        errorCode: response.status >= 500 ? "HTTP_" + response.status : null,
      });
      return withCorrelationHeader(response);
    } catch (err) {
      const duration = Date.now() - startedAt;
      recordMetric("api.latency", duration, { path: url.pathname, status: "fail" });
      logRoute({
        method: request.method,
        path: url.pathname,
        status: "fail",
        httpStatus: 500,
        duration,
        requestId,
        errorCode: "ROUTE_THROW",
      });
      throw err;
    }
  };
}
