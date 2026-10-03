/**
 * نگهبان احراز هویت مسیرهای API
 * استخراج توکن از هدر، اعتبارسنجی نشست و بازگرداندن زمینه کاربر.
 */

import { NextRequest } from "next/server";
import { extractBearer, validateSession, type SessionContext } from "./session";
import { MelkApiError } from "@/lib/melk-api/types";

/** اعتبارسنجی نشست — یا زمینه کاربر برمی‌گرداند یا خطای استاندارد */
export async function requireSessionAsync(request: NextRequest): Promise<SessionContext | MelkApiError> {
  const token = extractBearer(request.headers.get("authorization"));
  if (!token) {
    return new MelkApiError("UNAUTHORIZED", "برای این عملیات باید وارد حساب شوید.", 401, false);
  }
  const ctx = await validateSession(token);
  if (!ctx) {
    return new MelkApiError("UNAUTHORIZED", "نشست شما منقضی یا نامعتبر است. دوباره وارد شوید.", 401, false);
  }
  return ctx;
}

/** پاسخ خطای استاندارد JSON */
export function errorResponse(err: MelkApiError): Response {
  return Response.json(
    { ok: false, code: err.code, message: err.message, retryable: err.retryable },
    { status: err.httpStatus >= 400 && err.httpStatus < 600 ? err.httpStatus : 500 }
  );
}

/**
 * نگهبان نقش — HOTFIX-03 (SEC-6)
 * ------------------------------------------------------
 * روت‌های مدیریتی حساس فقط برای نقش OWNER.
 * هر رد دسترسی با personnelCode و مسیر در AuditLog ثبت می‌شود
 * ( Accountability — قابل راستی‌آزمایی در بازرسی امنیتی).
 * خروجی: passage=true یا خطای MelkApiError استاندارد 403 (FORBIDDEN).
 */
export async function requireRole(
  request: NextRequest,
  role: "OWNER",
  route: string
): Promise<{ ok: true; ctx: SessionContext } | MelkApiError> {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return guard; // 401 — قبل از بررسی نقش

  if (guard.role !== role) {
    // ثبت رد دسترسی — چه کسی، کجا، کِی
    const { audit } = await import("./session");
    await audit(
      "ACCESS_DENIED",
      guard.personnelCode,
      `route=${route}; requiredRole=${role}; actualRole=${guard.role}`
    ).catch(() => undefined);
    return new MelkApiError(
      "FORBIDDEN",
      "این عملیات مدیریتی فقط برای مالک سامانه (OWNER) مجاز است.",
      403,
      false
    );
  }
  return { ok: true, ctx: guard };
}
