/**
 * /api/users/lookup — جستجوی کاربر/مالک با شماره موبایل در سامانه آرم
 * ------------------------------------------------------
 * برای گام ۱ فرم ثبت دستی آگهی: بررسی اینکه مالک حضوری قبلاً در آرم ثبت شده است یا نه.
 * موبایل به فرمت آرم (بدون صفر ابتدایی) ارسال می‌شود — عین خود سامانه.
 */

import { NextRequest } from "next/server";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { MelkApiError } from "@/lib/melk-api/types";
import { armCall } from "@/lib/melk-api/client";
import { getMelkApiConfig } from "@/lib/melk-api/config";
import { execWithArmToken, toArmMobile } from "@/lib/listing/crm-transfer";

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  const url = new URL(request.url);
  const mobile = url.searchParams.get("mobile") ?? "";
  const digits = mobile.replace(/\D/g, "");
  if (!/^09\d{9}$/.test(digits)) {
    return errorResponse(new MelkApiError("UNKNOWN", "شماره موبایل نامعتبر است (۱۱ رقم، با ۰۹).", 400, false));
  }
  const armMobile = toArmMobile(digits);

  try {
    const data = await execWithArmToken(
      guard,
      (token) =>
        armCall<{ _id?: string; userId?: string; fullName?: string; firstName?: string; lastName?: string; mobileNumber?: string }>({
          method: "GET",
          path: `users/info/mobile-number/${encodeURIComponent(armMobile)}`,
          baseUrl: getMelkApiConfig().armApiBase,
          token,
          timeoutMs: 15000,
          maxRetries: 0,
        }).then((r) => r.data)
    );
    const found = Boolean(data && (data._id || data.userId));
    const name = data?.fullName ?? [data?.firstName, data?.lastName].filter(Boolean).join(" ") ?? undefined;
    return Response.json({ ok: true, found, name: found ? name : undefined, id: found ? (data.userId ?? data._id) : undefined });
  } catch (err) {
    const e = err instanceof MelkApiError ? err : new MelkApiError("UNKNOWN", (err as Error)?.message ?? "جستجو ناموفق", 502, false);
    // «یافت نشد» نتیجه معتبر جستجو است نه خطا (۴۰۴ / داده خالی)
    if (e.httpStatus === 404 || /یافت نشد|not found|وجود ندارد/i.test(e.message)) {
      return Response.json({ ok: true, found: false });
    }
    return errorResponse(e);
  }
}
