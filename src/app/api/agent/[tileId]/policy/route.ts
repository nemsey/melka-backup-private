/**
 * /api/agent/[tileId]/policy
 * GET  → فهرست نسخه‌های سیاست ایجنت (تاریخچه کامل)
 * POST → بازگشت به نسخه مشخص (فقط OWNER) — نسخه فعلی حذف نمی‌شود
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
    const versions = await agent.listPolicyVersions();
    return Response.json({ ok: true, versions });
  } catch (err) {
    return errorResponse(new MelkApiError("UNKNOWN", `خطا در فهرست سیاست‌ها: ${(err as Error).message}`, 500, false));
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ tileId: string }> }) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  // Rollback فقط برای مالک سامانه
  if (guard.role !== "OWNER") {
    return errorResponse(new MelkApiError("UNAUTHORIZED", "بازگشت سیاست فقط برای مالک سامانه مجاز است.", 403, false));
  }

  const { tileId } = await params;
  const agent = getAgent(tileId);
  if (!agent) {
    return errorResponse(new MelkApiError("NOT_FOUND", `ایجنتی برای کاشی «${tileId}» ثبت نشده است.`, 404, false));
  }

  try {
    const body = (await request.json().catch(() => null)) as { rollbackTo?: number } | null;
    const target = body?.rollbackTo;
    if (typeof target !== "number" || !Number.isInteger(target) || target < 1) {
      return errorResponse(new MelkApiError("UNKNOWN", "شماره نسخه نامعتبر است.", 400, false));
    }
    const activated = await agent.rollbackPolicy(target);
    return Response.json({ ok: true, activatedVersion: activated.version });
  } catch (err) {
    return errorResponse(
      new MelkApiError("UNKNOWN", `خطا در بازگشت سیاست: ${(err as Error).message}`, 400, false)
    );
  }
}
