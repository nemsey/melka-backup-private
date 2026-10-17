/**
 * GET/POST /api/admin/repairs — PN-020/فاز ۱۱ (خودترمیمی)
 * GET  ?status=proposed|approved|executed|rejected|rolled_back → فهرست پیشنهادهای ترمیم
 * POST {action: "generate"} → ساخت پیشنهاد از آخرین گزارش تشخیص (OWNER-only)
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { generateRepairProposals, listRepairProposals } from "@/lib/services/self-repair-service";

export async function GET(request: NextRequest) {
  const guard = await requireRole(request, "OWNER", "/api/admin/repairs");
  if (guard instanceof MelkApiError) return errorResponse(guard);
  const status = request.nextUrl.searchParams.get("status") ?? undefined;
  const rows = await listRepairProposals(status);
  return Response.json({ ok: true, count: rows.length, proposals: rows });
}

export async function POST(request: NextRequest) {
  const guard = await requireRole(request, "OWNER", "/api/admin/repairs");
  if (guard instanceof MelkApiError) return errorResponse(guard);
  const body = (await request.json().catch(() => null)) as { action?: string } | null;
  if (body?.action !== "generate") {
    return errorResponse(new MelkApiError("UNPROCESSABLE", "action باید «generate» باشد.", 400, false));
  }
  const result = await generateRepairProposals(guard.ctx.personnelCode);
  return Response.json({ ok: true, ...result });
}
