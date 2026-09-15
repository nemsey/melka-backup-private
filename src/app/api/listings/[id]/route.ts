/**
 * /api/listings/[id] — یک فایل آگهی
 * ------------------------------------------------------
 * GET   — جزییات کامل ۵ گامی + آمادگی انتقال
 * PATCH — تکمیل/ویرایش گام‌های ناقص
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { MelkApiError } from "@/lib/melk-api/types";
import { audit } from "@/lib/auth/session";
import { updateListing, listingReadiness } from "@/lib/listing/store";
import { toListingRow, validateListing, type ListingUpsertInput } from "@/lib/listing/types";

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  const { id } = await ctx.params;
  const rec = await db.listingRecord.findUnique({ where: { id } });
  if (!rec) return errorResponse(new MelkApiError("NOT_FOUND", "این فایل آگهی یافت نشد.", 404, false));

  const readiness = listingReadiness(rec);
  return Response.json({
    ok: true,
    listing: toListingRow(rec),
    raw: {
      priceEvaluation: rec.priceEvaluation,
      desirabilityLevel: rec.desirabilityLevel,
      userSeriousness: rec.userSeriousness,
      sellReason: rec.sellReason,
    },
    readiness,
    crmTransfer: (() => {
      try {
        return rec.crmTransferJson ? JSON.parse(rec.crmTransferJson) : null;
      } catch {
        return null;
      }
    })(),
    requirements: {
      armToken: Boolean(guard.armTokens?.accessToken),
      message: guard.armTokens?.accessToken
        ? "توکن آرم موجود است."
        : "برای انتقال به CRM باید با «کد پرسنلی + پیامک» وارد شوید.",
    },
  });
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  const { id } = await ctx.params;
  let body: ListingUpsertInput;
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "بدنه درخواست نامعتبر است.", 400, false));
  }

  try {
    const updated = await updateListing(id, body);
    if (!updated) return errorResponse(new MelkApiError("NOT_FOUND", "این فایل آگهی یافت نشد.", 404, false));
    await audit("LISTING_UPDATE", guard.personnelCode, `id=${id}`);

    const merged = {
      customerName: updated.customerName,
      customerMobile: updated.customerMobile,
      areaId: updated.areaId,
      lineId: updated.lineId,
      address: updated.address,
      postalCode: updated.postalCode,
      tradeTypeId: updated.tradeTypeId,
      buildingTypeId: updated.buildingTypeId,
      propertyTypeId: updated.propertyTypeId,
      changeWith: JSON.parse(updated.changeWithJson ?? "[]"),
      inputs: JSON.parse(updated.inputsJson ?? "{}"),
      priceEvaluation: updated.priceEvaluation,
      fileFinding: updated.fileFinding,
      fileType: JSON.parse(updated.fileTypeJson ?? "[]"),
      userSeriousness: updated.userSeriousness,
    };
    const v = validateListing(merged);
    return Response.json({
      ok: true,
      listing: toListingRow(updated),
      complete: v.ok,
      errors: v.errors,
      message: v.ok ? "هر ۵ گام فایل کامل است." : "به‌روزرسانی شد — گام‌های ناقص باقی مانده‌اند.",
    });
  } catch (err) {
    const e = err instanceof MelkApiError ? err : new MelkApiError("UNKNOWN", (err as Error)?.message ?? "خطای به‌روزرسانی", 500, false);
    return errorResponse(e);
  }
}
