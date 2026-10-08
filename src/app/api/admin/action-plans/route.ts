/**
 * /api/admin/action-plans — PN-019 فاز ۸: فهرست برنامه‌های اقدام (فقط OWNER)
 * هر برنامه: الگو + گام‌ها + rollback + شبیه‌سازی + اثر — autoExecute=false همیشه.
 * روت لاغر — منطق در decision-service (مرز مخزن).
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { listActionPlans } from "@/lib/services/decision-service";

export async function GET(request: NextRequest) {
  const guard = await requireRole(request, "OWNER", "GET /api/admin/action-plans");
  if (guard instanceof MelkApiError) return errorResponse(guard);
  const url = new URL(request.url);
  const rows = await listActionPlans({
    decisionId: url.searchParams.get("decisionId") ?? undefined,
    limit: Number(url.searchParams.get("limit") ?? 50),
  });
  return Response.json({ ok: true, rows });
}
