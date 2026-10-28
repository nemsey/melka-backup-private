/**
 * /api/sync/lcpp — GET وضعیت · POST بروزرسانی دستی (فرمان ۷ · فرمان ۴ بند ۴)
 * ---------------------------------------------------------------------------
 * GET  (نیازمند نشست): وضعیت فاز A/B هر پنج فهرست + آخرین چرخه —
 *      متن نشانگر UI از PHASE_LABELS: «در حال دریافت اطلاعات حیاتی…» /
 *      «در حال تکمیل جزئیات…» (خط قرمز: کاربر هرگز صفحهٔ خامو-silent نمی‌بیند)
 * POST (نیازمند مالک): پرچم Force Refresh → چرخهٔ فوری در ≤۶۰ث (lcppWatch).
 */

import { NextRequest } from "next/server";
import { errorResponse, requireRole, requireSessionAsync } from "@/lib/auth/guard";
import { MelkApiError } from "@/lib/melk-api/types";
import { readLcppStatus, requestForceRefresh, lcppCycleRunning, PHASE_LABELS } from "@/sync/lists";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);
  try {
    const status = readLcppStatus();
    return Response.json({
      ok: true,
      status: { ...status, labels: PHASE_LABELS, cycleRunning: lcppCycleRunning() },
    });
  } catch (e) {
    return Response.json({ ok: false, error: String((e as Error)?.message ?? e).slice(0, 200) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireRole(request, "OWNER", "/api/sync/lcpp");
  if (guard instanceof MelkApiError) return errorResponse(guard);
  try {
    const accepted = requestForceRefresh();
    if (!accepted) {
      return Response.json({ ok: false, error: "نوشتن پرچم درخواست ناموفق" }, { status: 500 });
    }
    return Response.json({
      ok: true,
      message: "درخواست بروزرسانی ثبت شد — چرخهٔ فوری حداکثر تا ۶۰ ثانیه دیگر آغاز می‌شود",
    });
  } catch (e) {
    return Response.json({ ok: false, error: String((e as Error)?.message ?? e).slice(0, 200) }, { status: 500 });
  }
}
