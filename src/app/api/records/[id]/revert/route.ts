/**
 * /api/records/[id]/revert — بازگردانی فیلد با تأیید (PN-050 · دستور ۴)
 * ---------------------------------------------------------------------------
 * POST { entity: "property" | "request", field: string, confirm: true }
 *
 * بازگردانی = نوشتن مقدارِ «پیش از آخرین تغییر پذیرفته‌شده» (from آخرین مدخل
 * fieldChanges؛ در نبود آن lastSyncedValue) + ثبت رد حسابرسی manual_revert.
 *
 * خط قرمز (قانون ۰۴): هدف null/تهی هرگز روی مقدار پر نمی‌نشیند → 409 با دلیل.
 * تأیید صریح (confirm=true) الزامی است — بازگردانی عملیات مالک است، نه سینک.
 *
 * گارد: نشست + دسترسی کاشی متناظر (M7/M8) — همان الگوی owner-notes.
 */

import { NextRequest } from "next/server";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { requireTileAccessFor } from "@/lib/access/personnel-access";
import { MelkApiError } from "@/lib/melk-api/types";
import { revertRecordField } from "@/lib/merge";

export const dynamic = "force-dynamic";

const ENTITY_TILE: Record<string, "arm-listings" | "arm-requests"> = {
  property: "arm-listings",
  request: "arm-requests",
};

const FA_REASON: Record<string, string> = {
  not_found: "رکورد موردنظر یافت نشد.",
  field_not_tracked: "این فیلد تحت پیگیری provenance نیست.",
  no_target: "مقدار پیشین برای بازگردانی موجود نیست (از پیش بازگردانی‌شده یا بدون تغییر).",
  null_on_filled: "بازگردانی ممنوع: مقدار پیشین تهی است و null روی دادهٔ پر نمی‌نشیند (قانون دادهٔ مقدس).",
};

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  const { id } = await ctx.params;
  let body: { entity?: unknown; field?: unknown; confirm?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "بدنه درخواست نامعتبر است.", 400, false));
  }

  const entity = typeof body.entity === "string" ? body.entity : null;
  const field = typeof body.field === "string" ? body.field : null;
  const tile = entity ? ENTITY_TILE[entity] : undefined;
  if (!tile || !field) {
    return errorResponse(new MelkApiError("UNKNOWN", "موجودیت (property | request) و نام فیلد الزامی است.", 400, false));
  }
  if (body.confirm !== true) {
    return errorResponse(new MelkApiError("UNKNOWN", "بازگردانی نیازمند تأیید صریح است (confirm: true).", 400, false));
  }
  const tileAccess = await requireTileAccessFor(guard, tile);
  if (tileAccess instanceof MelkApiError) return errorResponse(tileAccess);

  const outcome = await revertRecordField({
    entity: entity as "property" | "request",
    id,
    field,
    actor: guard.personnelCode,
  });

  if (!outcome.ok) {
    const reason = FA_REASON[outcome.reason] ?? "بازگردانی ناممکن.";
    return errorResponse(new MelkApiError("UNKNOWN", reason, outcome.reason === "not_found" ? 404 : 409, false));
  }

  return Response.json({
    ok: true,
    entity,
    id,
    field,
    revertedTo: outcome.revertedTo,
    change: outcome.change,
    message: "فیلد بازگردانی شد و رد حسابرسی (manual_revert) ثبت شد.",
  });
}
