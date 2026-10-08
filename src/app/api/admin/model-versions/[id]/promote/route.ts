/**
 * /api/admin/model-versions/[id]/promote — PN-018 فاز ۷: ارتقای چالشگر به قهرمان
 * ---------------------------------------------------------------------------
 * دروازهٔ شورا (سند ۰۲۷ §۲.۴): بدنه باید councilApproval=true و approvalSource
 * (شماره سند/جلسه) داشته باشد — وگرنه ۴۲۲ با پیام صریح.
 * فقط OWNER · روت لاغر.
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { promoteModelVersion } from "@/lib/services/model-versioning-service";

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(request, "OWNER", "POST /api/admin/model-versions/[id]/promote");
  if (guard instanceof MelkApiError) return errorResponse(guard);
  const { id } = await ctx.params;

  let raw: unknown = null;
  try {
    raw = await request.json();
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "بدنه درخواست نامعتبر است.", 400, false));
  }
  const body = (raw ?? {}) as { councilApproval?: boolean; approvalSource?: string };

  try {
    const row = await promoteModelVersion(id, {
      councilApproval: body.councilApproval === true,
      approvalSource: body.approvalSource,
      actor: guard.ctx.personnelCode,
    });
    return Response.json({ ok: true, version: row });
  } catch (e) {
    if (e instanceof MelkApiError) return errorResponse(e);
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در ارتقای نسخه.", 500, false));
  }
}
