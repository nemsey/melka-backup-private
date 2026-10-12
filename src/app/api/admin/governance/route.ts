/**
 * /api/admin/governance — PN-019 فاز ۹: آخرین بررسی ۱۵قاعده‌ای + تاریخچه (فقط OWNER)
 */
import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { latestGovernanceCheck, listGovernanceChecks } from "@/lib/services/governance-service";

export async function GET(request: NextRequest) {
  const guard = await requireRole(request, "OWNER", "GET /api/admin/governance");
  if (guard instanceof MelkApiError) return errorResponse(guard);
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 10), 1), 50);
  const latest = await latestGovernanceCheck();
  const history = await listGovernanceChecks(limit);
  return Response.json({ ok: true, latest, history });
}
