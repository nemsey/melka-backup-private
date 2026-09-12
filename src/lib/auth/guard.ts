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
