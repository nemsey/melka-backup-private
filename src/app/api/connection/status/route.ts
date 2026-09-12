/**
 * GET /api/connection/status
 * وضعیت اتصال به سامانه ملک تبریز (تست زنده + پیکربندی جاری)
 */

import { NextRequest } from "next/server";
import { getMelkProvider } from "@/lib/melk-api/provider";
import { getMelkApiConfig } from "@/lib/melk-api/config";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  try {
    const provider = getMelkProvider();
    const status = await provider.testConnection();
    const cfg = getMelkApiConfig();
    return Response.json({
      ok: true,
      status,
      config: {
        mode: cfg.mode,
        armBaseUrl: cfg.armBaseUrl,
        pmBaseUrl: cfg.pmBaseUrl,
        timeoutMs: cfg.timeoutMs,
        maxRetries: cfg.maxRetries,
      },
    });
  } catch (err) {
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در بررسی اتصال.", 500, false));
  }
}
