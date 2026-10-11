/**
 * GET /api/connection/status
 * وضعیت زنده اتصال واقعی به سامانه‌های ملک تبریز:
 *   ARM_API  — arus-api.melketabriz.ir/api/apm (احراز هویت و داده)
 *   ARM_PUB  — arus-api.melketabriz.ir/api/public
 *   PM_API   — pm-api.melketabriz.ir/api (سامانه پرسنلی)
 * به‌همراه وضعیت آخرین همگام‌سازی داده واقعی.
 *
 * PN-029 (سند شورا-ن۰۳۳):
 *   · ?live=1 — پروب واقعی (دکمهٔ «تست اتصال» مالک — اقدام آگاهانهٔ دستی).
 *     بدون live، در حالت آفلینی هیچ پروبی زده نمی‌شود (صفر تلاش خودکار).
 *   · پاسخ: وضعیت فیوزهای قطع‌کننده + IP کانتینر + پرچم حالت آفلینی —
 *     برای نمایش دقیق در تنظیمات عمومی (L5/L6).
 *
 * P2-03 (خلوص روت‌ها): دسترسی DB از لایهٔ کتابخانه (connection-overview) می‌آید.
 */

import { NextRequest } from "next/server";
import { getMelkProvider } from "@/lib/melk-api/provider";
import { getMelkApiConfig } from "@/lib/melk-api/config";
import { getSyncState } from "@/lib/melk-api/sync";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { getConnectionOverview } from "@/lib/melk-api/connection-overview";

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  try {
    const live = request.nextUrl.searchParams.get("live") === "1"; // PN-029 — دکمهٔ تست مالک
    const provider = getMelkProvider();
    const [status, syncState, overview] = await Promise.all([
      provider.testConnection({ live }),
      getSyncState(),
      getConnectionOverview(),
    ]);
    const cfg = getMelkApiConfig();

    return Response.json({
      ok: true,
      status,
      sync: syncState,
      config: {
        mode: cfg.mode,
        armApiBase: cfg.armApiBase,
        armPublicApiBase: cfg.armPublicApiBase,
        pmApiBase: cfg.pmApiBase,
        timeoutMs: cfg.timeoutMs,
        maxRetries: cfg.maxRetries,
        syncIntervalMinutes: cfg.syncIntervalMinutes,
      },
      // PN-029 — لایهٔ احتیاط اتصال خارجی (گارد P2-03: از لایهٔ lib)
      offlineMode: overview.offlineMode,
      circuitBreakers: overview.circuitBreakers,
      containerIp: overview.containerIp,
      // PN-030 (شورا-ن۰۳۵) — وضعیت لایهٔ پروکسی عبوری ابری (بدون افشای راز)
      proxy: overview.proxy,
    });
  } catch (err) {
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در بررسی اتصال.", 500, false));
  }
}
