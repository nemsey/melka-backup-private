/**
 * /api/admin/decisions/stats — PN-019 فاز ۸: شمارش تصمیم‌ها per وضعیت/نوع (فقط OWNER)
 */
import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { decisionStats } from "@/lib/services/decision-service";

export async function GET(request: NextRequest) {
  const guard = await requireRole(request, "OWNER", "GET /api/admin/decisions/stats");
  if (guard instanceof MelkApiError) return errorResponse(guard);
  const stats = await decisionStats();
  return Response.json({ ok: true, stats });
}
