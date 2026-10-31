/**
 * /api/records/changes — فهرست تغییرات اخیر (PN-050 · دستور ۴)
 * ---------------------------------------------------------------------------
 * GET ?range=24h|7d|30d (پیش‌فرض ۲۴h) & type=expert_override|enrichment|manual_revert
 *    & countOnly=1 (فقط شمارش — badge داشبورد ملکتون) & entity=property|request
 *
 * منبع داده: fieldChanges رکوردهای ملکتون (provenance دستور ۲).
 * گارد: نشست + دسترسی یکی از کاشی‌های M7/M8 (آگهی/درخواست ملکتون).
 * مرز مخزن (PN-012 BLOCK 1): صفر db.* در روت — منطق در سرویس RecordsChanges.
 */

import { NextRequest } from "next/server";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { requireTileAccessFor } from "@/lib/access/personnel-access";
import { MelkApiError } from "@/lib/melk-api/types";
import { listRecentChanges, RecordsChangesError } from "@/lib/services/records-changes";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  // دسترسی: یکی از دو کاشی دادهٔ ملکتون کافی است (پنل متعلق به داشبورد ملکتون است)
  const tileA = await requireTileAccessFor(guard, "arm-listings");
  const tileB = await requireTileAccessFor(guard, "arm-requests");
  if (tileA instanceof MelkApiError && tileB instanceof MelkApiError) return errorResponse(tileA);

  const url = new URL(request.url);
  try {
    const result = await listRecentChanges(
      {
        range: url.searchParams.get("range") ?? "24h",
        type: url.searchParams.get("type"),
        entity: url.searchParams.get("entity"),
      },
      { countOnly: url.searchParams.get("countOnly") === "1" },
    );
    if (url.searchParams.get("countOnly") === "1") {
      return Response.json({ ok: true, range: result.range, count: result.count });
    }
    return Response.json(result);
  } catch (e) {
    if (e instanceof RecordsChangesError) {
      return errorResponse(new MelkApiError("UNKNOWN", e.message, e.status, false));
    }
    return errorResponse(new MelkApiError("UNKNOWN", (e as Error)?.message ?? "خطای فهرست تغییرات", 500, false));
  }
}
