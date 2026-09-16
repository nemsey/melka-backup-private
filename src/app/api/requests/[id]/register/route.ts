/**
 * /api/requests/[id]/register — کلید «ثبت در سامانه ARM»
 * ------------------------------------------------------
 * GET  — آمادگی ۴ گامی + پیش‌نمایش جستجوی مشتری در آرم (بدون ایجاد)
 * POST — اجرای ثبت گام‌به‌گام عین کاربر عادی (هیچ گامی دور نمی‌شود):
 *        اعتبارسنجی → جستجو/ایجاد کاربر مشتری → شناسه‌های مکانی → جزییات → تکمیلی →
 *        POST requests/create (نهایی) یا requests/create/draft (پیش‌نویس)
 */

import { NextRequest } from "next/server";
import { getRequestRepository } from "@/core/repositories";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { MelkApiError } from "@/lib/melk-api/types";
import { audit } from "@/lib/auth/session";
import { registerRequestToArm } from "@/lib/request/arm-register";
import { execWithArmToken, toArmMobile } from "@/lib/listing/crm-transfer";
import { armCall } from "@/lib/melk-api/client";
import { getMelkApiConfig } from "@/lib/melk-api/config";
import { toRequestRow } from "@/lib/request/types";
import type { RequestRecordRow } from "@/lib/request/types";

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  const { id } = await ctx.params;
  const rec = await getRequestRepository().findById(id);
  if (!rec) return errorResponse(new MelkApiError("NOT_FOUND", "این درخواست یافت نشد.", 404, false));

  // پیش‌نمایش جستجوی مشتری — فقط وقتی توکن هست و موبایل معتبر است (عین owner-info-step)
  let customerPreview: { found: boolean; name?: string; id?: string; error?: string } | null = null;
  if (guard.armTokens?.accessToken && rec.customerMobile) {
    try {
      const armMobile = toArmMobile(rec.customerMobile);
      const res = await armCall<{ _id?: string; userId?: string; fullName?: string; firstName?: string; lastName?: string }>({
        method: "GET",
        path: `users/info/mobile-number/${encodeURIComponent(armMobile)}`,
        baseUrl: getMelkApiConfig().armApiBase,
        token: guard.armTokens.accessToken,
        timeoutMs: 12000,
        maxRetries: 0,
      });
      const data = res.data;
      if (data && (data._id || data.userId)) {
        customerPreview = {
          found: true,
          id: data.userId ?? data._id,
          name: data.fullName ?? [data.firstName, data.lastName].filter(Boolean).join(" "),
        };
      } else {
        customerPreview = { found: false };
      }
    } catch (err) {
      customerPreview = { found: false, error: (err as MelkApiError).message ?? "جستجو ناموفق" };
    }
  }

  return Response.json({
    ok: true,
    row: toRequestRow(rec as unknown as RequestRecordRow),
    customerPreview,
    lastRegistration: (() => {
      try {
        return rec.armRegistrationJson ? JSON.parse(rec.armRegistrationJson) : null;
      } catch {
        return null;
      }
    })(),
    requirements: {
      armToken: Boolean(guard.armTokens?.accessToken),
      message: guard.armTokens?.accessToken
        ? "توکن آرم موجود است — ثبت گام‌به‌گام آماده اجراست."
        : "برای ثبت در سامانه آرم باید با «کد پرسنلی + پیامک» وارد شوید (ورود مدیر محلی توکن آرم ندارد).",
    },
  });
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  const { id } = await ctx.params;

  let mode: "create" | "draft" = "create";
  try {
    const body = (await request.json()) as { mode?: string };
    if (body.mode === "draft") mode = "draft";
  } catch {
    // بدنه خالی — حالت پیش‌فرض ثبت نهایی
  }

  try {
    const result = await registerRequestToArm(guard, id, mode, (fn) => execWithArmToken(guard, fn));
    await audit(result.ok ? "REQUEST_ARM_REGISTER" : "REQUEST_ARM_REGISTER_FAIL", guard.personnelCode, `id=${id} mode=${mode} ok=${result.ok}`);
    return Response.json(
      {
        ok: result.ok,
        mode: result.mode,
        steps: result.steps,
        armRequestId: result.armRequestId ?? null,
        customerId: result.customerId ?? null,
        customerCreated: result.customerCreated ?? false,
        message: result.ok
          ? `درخواست در سامانه آرم ملک تبریز ${mode === "draft" ? "به‌عنوان پیش‌نویس" : "ثبت نهایی"} شد.`
          : result.error ?? "ثبت ناموفق بود.",
      },
      { status: result.ok ? 200 : result.error?.includes("کامل نیست") ? 400 : 502 }
    );
  } catch (err) {
    const e = err instanceof MelkApiError ? err : new MelkApiError("UNKNOWN", (err as Error)?.message ?? "خطای ثبت در آرم", 502, false);
    await audit("REQUEST_ARM_REGISTER_FAIL", guard.personnelCode, `id=${id} ${e.message.slice(0, 100)}`).catch(() => undefined);
    return errorResponse(e);
  }
}
