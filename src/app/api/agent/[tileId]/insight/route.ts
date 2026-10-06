/**
 * /api/agent/[tileId]/insight — GET
 * بینش‌های ایجنت کاشی: محاسبه + اعمال سیاست فعال + یادگیری از حافظه
 */

import { NextRequest } from "next/server";
import { getAgent } from "@/core/agent";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { requireTileAccessFor } from "@/lib/access/personnel-access";
import { ensureSeeded } from "@/lib/melk-api/sync";

export async function GET(request: NextRequest, { params }: { params: Promise<{ tileId: string }> }) {
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
    await ensureSeeded();
    const result = await agent.renderInsights();
    return Response.json({ ok: true, ...result, agentName: agent.name });
  } catch (err) {
    return errorResponse(new MelkApiError("UNKNOWN", `خطا در تولید بینش: ${(err as Error).message}`, 500, false));
  }
}
