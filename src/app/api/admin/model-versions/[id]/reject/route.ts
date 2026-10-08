/**
 * /api/admin/model-versions/[id]/reject — PN-018 فاز ۷: رد چالشگر
 * ---------------------------------------------------------------------------
 * فقط بستن مسیر چالشگر (بدون تغییر قهرمان) — نیازمند شورا نیست.
 * فقط OWNER · روت لاغر.
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { rejectChallenger } from "@/lib/services/model-versioning-service";

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(request, "OWNER", "POST /api/admin/model-versions/[id]/reject");
  if (guard instanceof MelkApiError) return errorResponse(guard);
  const { id } = await ctx.params;

  let reason: string | undefined;
  try {
    const body = (await request.json()) as { reason?: string };
    reason = body.reason;
  } catch { /* بدنه اختیاری */ }

  try {
    const row = await rejectChallenger(id, guard.ctx.personnelCode, reason);
    return Response.json({ ok: true, version: row });
  } catch (e) {
    if (e instanceof MelkApiError) return errorResponse(e);
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در رد چالشگر.", 500, false));
  }
}
