/**
 * GET /api/connection/status
 * وضعیت زنده اتصال واقعی به سامانه‌های ملک تبریز:
 *   ARM_API  — arus-api.melketabriz.ir/api/apm (احراز هویت و داده)
 *   ARM_PUB  — arus-api.melketabriz.ir/api/public
 *   PM_API   — pm-api.melketabriz.ir/api (سامانه پرسنلی)
 * به‌همراه وضعیت آخرین همگام‌سازی داده واقعی.
 */

import { NextRequest } from "next/server";
import { getMelkProvider } from "@/lib/melk-api/provider";
import { getMelkApiConfig } from "@/lib/melk-api/config";
import { getSyncState } from "@/lib/melk-api/sync";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  try {
    const provider = getMelkProvider();
    const [status, syncState] = await Promise.all([provider.testConnection(), getSyncState()]);
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
    });
  } catch (err) {
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در بررسی اتصال.", 500, false));
  }
}
