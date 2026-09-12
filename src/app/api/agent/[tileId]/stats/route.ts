/**
 * /api/agent/[tileId]/stats — GET
 * آمار یادگیری ایجنت برای نمایش شفافیت در UI کاشی
 */

import { NextRequest } from "next/server";
import { getAgent } from "@/core/agent";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";

export async function GET(request: NextRequest, { params }: { params: Promise<{ tileId: string }> }) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  const { tileId } = await params;
  const agent = getAgent(tileId);
  if (!agent) {
    return errorResponse(new MelkApiError("NOT_FOUND", `ایجنتی برای کاشی «${tileId}» ثبت نشده است.`, 404, false));
  }

  try {
    const stats = await agent.learningStats();
    return Response.json({ ok: true, stats, agentName: agent.name, domains: agent.insightDomains });
  } catch (err) {
    return errorResponse(new MelkApiError("UNKNOWN", `خطا در آمار ایجنت: ${(err as Error).message}`, 500, false));
  }
}
