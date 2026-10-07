/**
 * /api/runtime/metrics — GET (PN-013 فاز ۴ · مرحلهٔ ۶)
 * ---------------------------------------------------------------------------
 * پانل رصدپذیری مالک (OWNER-only · خواندنی · بدون عارضه):
 *   • فرایند Web: pid/uptime/RSS/heap
 *   • متریک‌های استاندارد: api.latency · sync.duration · agent.latency · prediction.brier
 *     (هر خانواده با شمارش/میانگین/p50/p95/max + آخرین مقدار)
 *   • وضعیت زندهٔ Worker از فایل مشترک (upload/.runtime/runtime-status.json)
 *     — فرایند Worker خودش را می‌نویسد (سن ضربان، کارها با lastDurationMs)
 *
 * Correlation ID: همین روت با withRouteLog بسته‌بندی شده ⇒ هدر ‎x-request-id‎
 * کلاینت در پاسخ برگردانده می‌شود و لاگ/متریک با همان شناسه ثبت می‌شوند.
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { withRouteLog } from "@/lib/logger";
import { metricsSnapshot } from "@/lib/observability/metrics";
import { readWorkerStatus } from "@/core/runtime/worker-status";

export const dynamic = "force-dynamic";

export const GET = withRouteLog("runtime-metrics", async (request: Request): Promise<Response> => {
  const role = await requireRole(request as unknown as NextRequest, "OWNER", "GET /api/runtime/metrics");
  if (role instanceof MelkApiError) return errorResponse(role);

  const snapshot = metricsSnapshot();
  const worker = readWorkerStatus();

  return Response.json({
    ok: true,
    observability: snapshot,
    worker,
    familiesContract: {
      "api.latency": "مدت هر فراخوانی روت دارای withRouteLog (برچسب: مسیر)",
      "sync.duration": "مدت رویدادهای همگام‌سازی (برچسب: حالت/وضعیت)",
      "agent.latency": "مدت فراخوانی ایجنت‌ها (برچسب: کاشی/عملیات)",
      "prediction.brier": "امتیاز بریهٔ تازه‌ترین ارزیابی کالیبراسیون (برچسب: کاشی)",
    },
    note: "متریک‌ها درون‌حافظه‌ایِ همین فرایند Web‌اند (حلقهٔ ۵۰۰ نمونه)؛ سنجه‌های Worker از فایل وضعیت می‌آیند.",
  });
});
