/**
 * /api/admin/policy-evaluations — PN-019 فاز ۹: فهرست ارزیابی‌های سیاست (فقط OWNER)
 */
import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { listPolicyEvaluations } from "@/lib/services/governance-service";

export async function GET(request: NextRequest) {
  const guard = await requireRole(request, "OWNER", "GET /api/admin/policy-evaluations");
  if (guard instanceof MelkApiError) return errorResponse(guard);
  const url = new URL(request.url);
  const rows = await listPolicyEvaluations(url.searchParams.get("policyId") ?? undefined);
  return Response.json({ ok: true, rows });
}
