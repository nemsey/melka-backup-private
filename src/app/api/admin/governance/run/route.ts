/**
 * /api/admin/governance/run — PN-019 فاز ۹: اجرای دستی بررسی ۱۵قاعده‌ای (فقط OWNER)
 * زمینهٔ زندهٔ ۱۷فیلدی از DB واقعی — نتیجه در GovernanceCheckRecord ثبت می‌شود.
 */
import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { runGovernanceCheck } from "@/lib/services/governance-service";

export async function POST(request: NextRequest) {
  const guard = await requireRole(request, "OWNER", "POST /api/admin/governance/run");
  if (guard instanceof MelkApiError) return errorResponse(guard);
  const result = await runGovernanceCheck("manual");
  return Response.json({ ok: true, result });
}
