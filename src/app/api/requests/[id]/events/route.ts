/**
 * /api/requests/[id]/events — کلید «ثبت رویداد»
 * ------------------------------------------------------
 * GET  — رویدادهای درخواست + انواع رویداد زنده از خود سامانه (request-event-types)
 * POST — ثبت رویداد (عین فرم خود سامانه: نوع + تاریخ + ساعت + کدآگهی + پیام)
 *        ذخیره محلی + اگر درخواست در آرم ثبت شده و توکن هست → POST request-events/create
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { MelkApiError } from "@/lib/melk-api/types";
import { audit } from "@/lib/auth/session";
import { createRequestEvent, toEventRow, type CreateEventInput } from "@/lib/request/store";
import { syncEventToArm, fetchEventTypes } from "@/lib/request/arm-register";
import { execWithArmToken } from "@/lib/listing/crm-transfer";

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  const { id } = await ctx.params;
  const rec = await db.requestRecord.findUnique({ where: { id }, include: { events: { orderBy: { createdAt: "desc" } } } });
  if (!rec) return errorResponse(new MelkApiError("NOT_FOUND", "این درخواست یافت نشد.", 404, false));

  // انواع رویداد — زنده از خود سامانه (توکن‌دار، عین صفحه رویداد آرم)
  let eventTypes: Awaited<ReturnType<typeof fetchEventTypes>> | null = null;
  if (guard.armTokens?.accessToken) {
    eventTypes = await fetchEventTypes((fn) => execWithArmToken(guard, fn));
  }

  return Response.json({
    ok: true,
    events: rec.events.map(toEventRow),
    armRequestId: rec.armRequestId,
    eventTypes: eventTypes
      ? { types: eventTypes.types, live: eventTypes.live, error: eventTypes.error ?? null }
      : { types: [], live: false, error: "برای دریافت انواع رویداد از خود سامانه آرم، با «کد پرسنلی + پیامک» وارد شوید." },
    requirements: {
      armToken: Boolean(guard.armTokens?.accessToken),
      message: guard.armTokens?.accessToken
        ? "توکن آرم موجود است — رویدادها همزمان در سامانه آرم نیز ثبت می‌شوند."
        : "رویداد به‌صورت محلی ثبت می‌شود؛ برای ثبت همزمان در سامانه آرم با «کد پرسنلی + پیامک» وارد شوید.",
    },
  });
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  const { id } = await ctx.params;

  let body: CreateEventInput;
  try {
    body = (await request.json()) as CreateEventInput;
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "بدنه درخواست نامعتبر است.", 400, false));
  }

  if (!body.eventTypeId || !body.eventTypeName) {
    return errorResponse(new MelkApiError("UNKNOWN", "نوع رویداد (عین خود سامانه) الزامی است.", 400, false));
  }

  // اعتبارسنجی عین خود سامانه: نوع رویداد نیاز به تاریخ/ساعت/آگهی دارد؟
  const flags = body.flags ?? {};
  if (flags.needTime && !body.date) {
    return errorResponse(new MelkApiError("UNKNOWN", "این نوع رویداد به «تاریخ» نیاز دارد (عین خود سامانه).", 400, false));
  }
  if (flags.needHour && !body.hour) {
    return errorResponse(new MelkApiError("UNKNOWN", "این نوع رویداد به «ساعت» نیاز دارد (عین خود سامانه).", 400, false));
  }
  if (flags.needProperty && !body.propertyCode) {
    return errorResponse(new MelkApiError("UNKNOWN", "این نوع رویداد به «کدآگهی» نیاز دارد (عین خود سامانه).", 400, false));
  }

  try {
    const rec = await db.requestRecord.findUnique({ where: { id } });
    if (!rec) return errorResponse(new MelkApiError("NOT_FOUND", "این درخواست یافت نشد.", 404, false));

    // ثبت همزمان در سامانه آرم (اگر درخواست آنجا ثبت شده و توکن هست)
    let arm: Awaited<ReturnType<typeof syncEventToArm>> | null = null;
    if (rec.armRequestId && guard.armTokens?.accessToken) {
      arm = await syncEventToArm(
        guard,
        {
          requestId: id,
          eventTypeId: body.eventTypeId,
          date: body.date ?? null,
          hour: body.hour ?? null,
          propertyCode: body.propertyCode ?? null,
          message: body.message ?? null,
        },
        (fn) => execWithArmToken(guard, fn)
      );
      // اگر آگهی معتبر بود، شناسه‌اش را روی رویداد محلی نگه می‌داریم
      if (arm.ok || arm.armPropertyId) {
        body.armPropertyId = arm.armPropertyId ?? null;
      }
    }

    // ثبت محلی (همیشه)
    const event = await createRequestEvent(
      { ...body, armPropertyId: body.armPropertyId ?? null },
      guard.personnelCode
    );

    // نتیجه همگام‌سازی آرم را روی رکورد رویداد ذخیره کن
    if (arm) {
      await db.requestEventRecord
        .update({
          where: { id: event.id },
          data: {
            armEventId: arm.ok ? arm.armEventId ?? null : null,
            armSyncedAt: arm.ok ? new Date() : null,
            armPropertyId: arm.armPropertyId ?? null,
            armSyncJson: JSON.stringify({
              at: new Date().toISOString(),
              ok: arm.ok,
              armEventId: arm.armEventId ?? null,
              propertyTitle: arm.propertyTitle ?? null,
              error: arm.error ?? null,
            }),
          },
        })
        .catch(() => undefined);
    }

    await audit("REQUEST_EVENT_CREATE", guard.personnelCode, `request=${id} type=${body.eventTypeName} arm=${arm ? (arm.ok ? "ok" : "fail") : "local"}`);

    return Response.json({
      ok: true,
      event: toEventRow(event),
      arm: arm ? { ok: arm.ok, armEventId: arm.armEventId ?? null, propertyTitle: arm.propertyTitle ?? null, error: arm.error ?? null } : null,
      message: arm
        ? arm.ok
          ? `رویداد «${body.eventTypeName}» ثبت و در سامانه آرم همگام شد.`
          : `رویداد محلی ثبت شد؛ همگام‌سازی با آرم ناموفق بود: ${arm.error ?? ""}`
        : `رویداد «${body.eventTypeName}» ثبت شد.`,
    });
  } catch (err) {
    const e = err instanceof MelkApiError ? err : new MelkApiError("UNKNOWN", (err as Error)?.message ?? "خطای ثبت رویداد", 500, false);
    return errorResponse(e);
  }
}
