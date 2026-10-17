/**
 * GET /api/admin/memory/stats — PN-025/ستون ۱ (حافظهٔ بلندمدت)
 * ---------------------------------------------------------------------------
 * آمار سه سطح (داغ/گرم/سرد) + توزیع امتیاز + سیاست‌ها + آخرین تثبیت.
 * OWNER-only — شفافیت کامل برای مالک (همان الگوی /api/admin/diagnosis).
 * POST → اجرای دستی تثبیت (تست/مایل به مالک).
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { memoryStats, runConsolidation, ensureRetentionSeeded } from "@/lib/services/memory-lifecycle-service";

export async function GET(request: NextRequest) {
  const guard = await requireRole(request, "OWNER", "/api/admin/memory/stats");
  if (guard instanceof MelkApiError) return errorResponse(guard);
  try {
    await ensureRetentionSeeded().catch(() => undefined);
    const data = await memoryStats();
    return Response.json({ ok: true, pillar: "memory", ...data }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در خواندن آمار حافظهٔ بلندمدت.", 500, false));
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireRole(request, "OWNER", "/api/admin/memory/stats");
  if (guard instanceof MelkApiError) return errorResponse(guard);
  try {
    const result = await runConsolidation();
    return Response.json({ ok: true, ran: "manual", ...result });
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "اجرای دستی تثبیت حافظه شکست خورد.", 500, false));
  }
}
