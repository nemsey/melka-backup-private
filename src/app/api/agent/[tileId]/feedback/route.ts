/**
 * /api/agent/[tileId]/feedback — POST
 * ثبت بازخورد کاربر روی بینش (Append-only) + تحریک بازبینی سیاست
 */

import { NextRequest } from "next/server";
import { getAgent } from "@/core/agent";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { requireTileAccessFor } from "@/lib/access/personnel-access";

export async function POST(request: NextRequest, { params }: { params: Promise<{ tileId: string }> }) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  const { tileId } = await params;
  // PN-008 BLOCK 7 (بند ۷.۴) — دسترسی کاشی از PersonnelAccess (tileId پویا)
  const tileErr = await requireTileAccessFor(guard, tileId);
  if (tileErr) return errorResponse(tileErr);
  const agent = getAgent(tileId);
  if (!agent) {
    return errorResponse(new MelkApiError("NOT_FOUND", `ایجنتی برای کاشی «${tileId}» ثبت نشده است.`, 404, false));
  }

  try {
    const body = (await request.json().catch(() => null)) as
      | { insightKey?: string; insightTitle?: string; domain?: string; rating?: number; comment?: string }
      | null;

    const rating = body?.rating;
    if (!body?.insightKey || !body.insightTitle || (rating !== 1 && rating !== -1)) {
      return errorResponse(
        new MelkApiError("UNKNOWN", "بازخورد نامعتبر است (insightKey و rating الزامی؛ rating باید ‎+1‎ یا ‎-1‎ باشد).", 400, false)
      );
    }

    const result = await agent.submitFeedback({
      insightKey: body.insightKey,
      insightTitle: body.insightTitle,
      domain: body.domain ?? "UNKNOWN",
      rating,
      comment: body.comment?.slice(0, 500),
      contextSnapshot: { by: guard.personnelCode, role: guard.role },
    });

    const policy = await agent.getActivePolicy();
    return Response.json({
      ok: true,
      totalFeedback: result.totalFeedback,
      activePolicyVersion: policy.version,
    });
  } catch (err) {
    return errorResponse(new MelkApiError("UNKNOWN", `خطا در ثبت بازخورد: ${(err as Error).message}`, 500, false));
  }
}
