/**
 * /api/listings/[id]/transfer-crm — کلید «انتقال به CRM» (بخش «ت»)
 * ------------------------------------------------------
 * GET  — آمادگی ۵ گامی + پیش‌نمایش جستجوی مشتری در آرم (بدون ایجاد)
 * POST — اجرای انتقال گام‌به‌گام عین کاربر عادی:
 *        اعتبارسنجی → جستجو/ایجاد کاربر مالک → شناسه‌های مکانی → معامله → رسانه →
 *        توضیحات → POST properties/create (نهایی یا پیش‌نویس)
 */

import { NextRequest } from "next/server";
import { getListingRepository } from "@/core/repositories";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { MelkApiError } from "@/lib/melk-api/types";
import { audit } from "@/lib/auth/session";
import { listingReadiness, toListingRowSafe } from "@/lib/listing/api-helpers";
import { transferListingToCrm, execWithArmToken, toArmMobile } from "@/lib/listing/crm-transfer";
import { armCall } from "@/lib/melk-api/client";
import { getMelkApiConfig } from "@/lib/melk-api/config";

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  const { id } = await ctx.params;
  const rec = await getListingRepository().findById(id);
  if (!rec) return errorResponse(new MelkApiError("NOT_FOUND", "این فایل آگهی یافت نشد.", 404, false));

  const readiness = listingReadiness(rec);

  // پیش‌نمایش جستجوی مشتری — فقط وقتی توکن هست و موبایل معتبر است
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
    listing: toListingRowSafe(rec),
    readiness,
    customerPreview,
    lastTransfer: (() => {
      try {
        return rec.crmTransferJson ? JSON.parse(rec.crmTransferJson) : null;
      } catch {
        return null;
      }
    })(),
    requirements: {
      armToken: Boolean(guard.armTokens?.accessToken),
      message: guard.armTokens?.accessToken
        ? "توکن آرم موجود است — انتقال گام‌به‌گام آماده اجراست."
        : "برای انتقال به CRM باید با «کد پرسنلی + پیامک» وارد شوید (ورود مدیر محلی توکن آرم ندارد).",
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
    const result = await transferListingToCrm(guard, id, mode, (fn) => execWithArmToken(guard, fn));
    await audit(result.ok ? "LISTING_CRM_TRANSFER" : "LISTING_CRM_TRANSFER_FAIL", guard.personnelCode, `id=${id} mode=${mode} ok=${result.ok}`);
    return Response.json(
      {
        ok: result.ok,
        mode: result.mode,
        steps: result.steps,
        armPropertyId: result.armPropertyId ?? null,
        customerId: result.customerId ?? null,
        customerCreated: result.customerCreated ?? false,
        message: result.ok
          ? `آگهی در سامانه آرم ملک تبریز ${mode === "draft" ? "به‌عنوان پیش‌نویس" : "ثبت نهایی"} شد.`
          : result.error ?? "انتقال ناموفق بود.",
      },
      { status: result.ok ? 200 : result.error?.includes("کامل نیست") ? 400 : 502 }
    );
  } catch (err) {
    const e = err instanceof MelkApiError ? err : new MelkApiError("UNKNOWN", (err as Error)?.message ?? "خطای انتقال", 502, false);
    await audit("LISTING_CRM_TRANSFER_FAIL", guard.personnelCode, `id=${id} ${e.message.slice(0, 100)}`).catch(() => undefined);
    return errorResponse(e);
  }
}
