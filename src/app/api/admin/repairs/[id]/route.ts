/**
 * POST /api/admin/repairs/[id] — PN-020/فاز ۱۱ (خودترمیمی)
 * {action: "approve" | "reject" | "execute", reason?} — دروازهٔ شورا و مجری (OWNER-only)
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { approveRepairProposal, executeRepairProposal, rejectRepairProposal } from "@/lib/services/self-repair-service";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(request, "OWNER", "/api/admin/repairs/[id]");
  if (guard instanceof MelkApiError) return errorResponse(guard);
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { action?: string; reason?: string } | null;
  switch (body?.action) {
    case "approve":
      return Response.json({ ok: true, proposal: await approveRepairProposal(id, guard.ctx.personnelCode) });
    case "reject":
      return Response.json({
        ok: true,
        proposal: await rejectRepairProposal(id, guard.ctx.personnelCode, body.reason ?? "بدون دلیل ثبت‌شده"),
      });
    case "execute":
      return Response.json({ ok: true, ...(await executeRepairProposal(id, guard.ctx.personnelCode)) });
    default:
      return errorResponse(new MelkApiError("UNPROCESSABLE", "action باید approve | reject | execute باشد.", 400, false));
  }
}
