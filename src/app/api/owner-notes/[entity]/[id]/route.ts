/**
 * /api/owner-notes/[entity]/[id] — یادداشت مالک (PN-039 · گام ۴)
 * ---------------------------------------------------------------------------
 * ستون «یادداشت» فهرست آگهی (M1) و فهرست درخواست (M2) — ویرایش مالک.
 *
 * PATCH { note: string } — ثبت/پاک‌سازی یادداشت (رشتهٔ خالی = پاک کردن)
 *   · entity: "property" (کاشی arm-listings) | "request" (کاشی arm-requests)
 *   · گارد: نشست + دسترسی کاشی (همان دروازهٔ دیدن فهرست)
 *   · مرز مخزن (PN-012/۱.۳): نوشتن از طریق updateOwnerNote مخزن — صفر db.* در روت
 *   · قانون دادهٔ مقدس: سینک ARM هرگز این ستون را نمی‌نویسد — تنها مسیر نوشتن همینجاست
 *   · صفر حذف: به‌روزرسانی نقطه‌ای یک ستون (بدون بازنویسی ردیف)
 */

import { NextRequest } from "next/server";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { requireTileAccessFor } from "@/lib/access/personnel-access";
import { MelkApiError } from "@/lib/melk-api/types";
import { audit } from "@/lib/auth/session";
import { getPropertyRecordRepository, getRequestRepository } from "@/core/repositories";

/** سقف طول یادداشت — مالک آزاد است اما سقف معقول برای ردیف فهرست */
const OWNER_NOTE_MAX = 2000;

const ENTITY_TILE: Record<string, "arm-listings" | "arm-requests"> = {
  property: "arm-listings",
  request: "arm-requests",
};

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ entity: string; id: string }> }) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  const { entity, id } = await ctx.params;
  const tile = ENTITY_TILE[entity];
  if (!tile) {
    return errorResponse(new MelkApiError("UNKNOWN", "موجودیت یادداشت نامعتبر است (property | request).", 400, false));
  }
  const tileAccess = await requireTileAccessFor(guard, tile);
  if (tileAccess instanceof MelkApiError) return errorResponse(tileAccess);

  let body: { note?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "بدنه درخواست نامعتبر است.", 400, false));
  }
  if (typeof body.note !== "string") {
    return errorResponse(new MelkApiError("UNKNOWN", "یادداشت باید رشتهٔ متنی باشد.", 400, false));
  }
  const note = body.note.trim().slice(0, OWNER_NOTE_MAX);

  try {
    const row =
      entity === "property"
        ? await getPropertyRecordRepository().updateOwnerNote(id, note || null)
        : await getRequestRepository().updateOwnerNote(id, note || null);
    await audit("OWNER_NOTE_UPDATE", guard.personnelCode, `${entity} id=${id} len=${note.length}`);
    return Response.json({
      ok: true,
      entity,
      id: row.id,
      ownerNote: row.ownerNote,
      message: entity === "property" ? "یادداشت آگهی ذخیره شد." : "یادداشت درخواست ذخیره شد.",
    });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "P2025") {
      return errorResponse(new MelkApiError("NOT_FOUND", "رکورد موردنظر یافت نشد.", 404, false));
    }
    return errorResponse(new MelkApiError("UNKNOWN", (err as Error)?.message ?? "خطای ثبت یادداشت", 500, false));
  }
}
