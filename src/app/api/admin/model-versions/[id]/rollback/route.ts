/**
 * /api/admin/model-versions/[id]/rollback — PN-018 فاز ۷: بازگشت به نسخهٔ بازنشسته
 * ---------------------------------------------------------------------------
 * هم‌رتبهٔ ارتقا: نیازمند تأیید شورا + منبع + دلیل.
 * بدنه: { targetId, councilApproval, reason } — id مسیر = مدل نیست؛ نسخهٔ هدف از بدنه می‌آید.
 * فقط OWNER · روت لاغر.
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { rollbackChampion } from "@/lib/services/model-versioning-service";

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(request, "OWNER", "POST /api/admin/model-versions/[id]/rollback");
  if (guard instanceof MelkApiError) return errorResponse(guard);
  const { id: modelId } = await ctx.params;

  let raw: unknown = null;
  try {
    raw = await request.json();
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "بدنه درخواست نامعتبر است.", 400, false));
  }
  const body = (raw ?? {}) as { targetId?: string; councilApproval?: boolean; approvalSource?: string; reason?: string };
  if (!body.targetId) {
    return errorResponse(new MelkApiError("UNKNOWN", "targetId (نسخهٔ هدف بازگشت) الزامی است.", 400, false));
  }

  try {
    const row = await rollbackChampion(modelId, {
      targetId: body.targetId,
      councilApproval: body.councilApproval === true,
      approvalSource: body.approvalSource,
      reason: body.reason,
      actor: guard.ctx.personnelCode,
    });
    return Response.json({ ok: true, version: row });
  } catch (e) {
    if (e instanceof MelkApiError) return errorResponse(e);
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در بازگشت نسخه.", 500, false));
  }
}
