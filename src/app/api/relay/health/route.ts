/**
 * روت سلامت رله — GET /api/relay/health (PN-038 · فاز ۴ · بند ۴.۱)
 * ---------------------------------------------------------------------------
 * پایش ۲۴ ساعتهٔ رله — سه لایه (نبض/فعالیت/تازگی) + حکم 🟢/🟡/🔴.
 * محاسبهٔ زنده از DB — برای همهٔ نقش‌های واردشده (نمایش در RelayStatusCard).
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { computeRelayHealth } from "@/lib/relay/health";

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);
  try {
    const report = await computeRelayHealth();
    return Response.json({ ok: true, ...report });
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "محاسبهٔ سلامت رله ناموفق بود.", 500, false));
  }
}
