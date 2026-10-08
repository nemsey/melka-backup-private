/**
 * /api/admin/drift-checks — PN-018 فاز ۷: تاریخ آشکارسازی رانش
 * ---------------------------------------------------------------------------
 * GET — فهرست DriftCheck (فیلتر modelId · limit) (فقط OWNER)
 * روت لاغر — منطق در src/lib/services/drift-service.ts.
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { listDriftChecks } from "@/lib/services/drift-service";

export async function GET(request: NextRequest) {
  const guard = await requireRole(request, "OWNER", "GET /api/admin/drift-checks");
  if (guard instanceof MelkApiError) return errorResponse(guard);
  const url = new URL(request.url);
  const rows = await listDriftChecks({
    modelId: url.searchParams.get("modelId") ?? undefined,
    limit: Number(url.searchParams.get("limit") ?? 50),
  });
  return Response.json({ ok: true, rows });
}
