/**
 * /api/requests/[id] — جزئیات و ویرایش یک درخواست (کلید «ویرایش»)
 * ------------------------------------------------------
 * GET   — جزئیات کامل درخواست + رویدادهایش + آخرین گزارش ثبت آرم
 * PATCH — ویرایش (۴ گام)؛ اگر درخواست در آرم ثبت شده، همگام با PUT requests/update/{id}
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { MelkApiError } from "@/lib/melk-api/types";
import { audit } from "@/lib/auth/session";
import { getRequestDetails, updateRequest } from "@/lib/request/store";
import { registerRequestToArm } from "@/lib/request/arm-register";
import { execWithArmToken } from "@/lib/listing/crm-transfer";
import type { RequestUpsertInput } from "@/lib/request/types";

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  const { id } = await ctx.params;
  const details = await getRequestDetails(id);
  if (!details) return errorResponse(new MelkApiError("NOT_FOUND", "این درخواست یافت نشد.", 404, false));

  const rec = await db.requestRecord.findUnique({ where: { id } });
  return Response.json({
    ok: true,
    row: details.row,
    events: details.events,
    lastRegistration: (() => {
      try {
        return rec?.armRegistrationJson ? JSON.parse(rec.armRegistrationJson) : null;
      } catch {
        return null;
      }
    })(),
    requirements: {
      armToken: Boolean(guard.armTokens?.accessToken),
      message: guard.armTokens?.accessToken
        ? "توکن سامانه آرم موجود است — ویرایش همگام و ثبت رویداد در آرم آماده است."
        : "برای همگام‌سازی ویرایش و ثبت رویداد در سامانه آرم باید با «کد پرسنلی + پیامک» وارد شوید.",
    },
  });
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  const { id } = await ctx.params;

  let body: RequestUpsertInput & { syncArm?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "بدنه درخواست نامعتبر است.", 400, false));
  }

  try {
    const result = await updateRequest(id, body, guard.personnelCode);
    if (!result.record) {
      return errorResponse(new MelkApiError("NOT_FOUND", "این درخواست یافت نشد.", 404, false));
    }

    // همگام‌سازی ویرایش با سامانه آرم — فقط اگر قبلاً ثبت شده و توکن موجود است
    let arm: Awaited<ReturnType<typeof registerRequestToArm>> | null = null;
    const shouldSync = body.syncArm && result.record.armRequestId && result.ok && guard.armTokens?.accessToken;
    if (shouldSync) {
      arm = await registerRequestToArm(guard, id, "update", (fn) => execWithArmToken(guard, fn));
    }

    await audit("REQUEST_UPDATE", guard.personnelCode, `id=${id} ok=${result.ok} sync=${shouldSync ? 1 : 0}`);

    return Response.json({
      ok: true,
      complete: result.ok,
      errors: result.errors,
      arm: arm ? { ok: arm.ok, steps: arm.steps, error: arm.error ?? null } : null,
      message: arm
        ? arm.ok
          ? "درخواست ویرایش شد و تغییرات با PUT خود سامانه در سامانه آرم همگام گردید."
          : `ویرایش محلی ثبت شد؛ همگام‌سازی با آرم ناموفق بود: ${arm.error ?? ""}`
        : result.ok
          ? "درخواست با هر ۴ گام کامل به‌روزرسانی شد."
          : "درخواست به‌عنوان پیش‌نویس به‌روزرسانی شد — گام‌های ناقص را ادامه دهید.",
    });
  } catch (err) {
    const e = err instanceof MelkApiError ? err : new MelkApiError("UNKNOWN", (err as Error)?.message ?? "خطای ویرایش", 500, false);
    return errorResponse(e);
  }
}
