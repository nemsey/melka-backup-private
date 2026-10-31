/**
 * /api/records/[id]/changes — تاریخچهٔ کامل یک رکورد (PN-050 · دستور ۴)
 * ---------------------------------------------------------------------------
 * GET ?entity=property|request
 * پاسخ: snapshot فیلدهای tracked + fieldChanges کامل + lastSyncedValue (provenance)
 * — مبنا برای دکمهٔ «بازگردانی» در پنل «تغییرات اخیر».
 *
 * گارد: نشست + دسترسی کاشی متناظر (M7 آگهی / M8 درخواست).
 * مرز مخزن (PN-012 BLOCK 1): صفر db.* در روت — منطق در سرویس RecordsChanges.
 */

import { NextRequest } from "next/server";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { requireTileAccessFor } from "@/lib/access/personnel-access";
import { MelkApiError } from "@/lib/melk-api/types";
import { getRecordChanges, RecordsChangesError } from "@/lib/services/records-changes";

export const dynamic = "force-dynamic";

const ENTITY_TILE: Record<string, "arm-listings" | "arm-requests"> = {
  property: "arm-listings",
  request: "arm-requests",
};

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  const { id } = await ctx.params;
  const entity = new URL(request.url).searchParams.get("entity") ?? "property";
  const tile = ENTITY_TILE[entity];
  if (!tile) {
    return errorResponse(new MelkApiError("UNKNOWN", "موجودیت نامعتبر (property | request).", 400, false));
  }
  const tileAccess = await requireTileAccessFor(guard, tile);
  if (tileAccess instanceof MelkApiError) return errorResponse(tileAccess);

  try {
    const result = await getRecordChanges(id, entity);
    return Response.json(result);
  } catch (e) {
    if (e instanceof RecordsChangesError) {
      return errorResponse(new MelkApiError("UNKNOWN", e.message, e.status, false));
    }
    return errorResponse(new MelkApiError("UNKNOWN", (e as Error)?.message ?? "خطای تاریخچهٔ رکورد", 500, false));
  }
}
