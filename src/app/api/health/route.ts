/**
 * GET /api/health — وضعیت سامانه (عمومی، بدون احراز هویت)
 * حالت اتصال همیشه «real» است (اتصال واقعی به arus-api/pm-api).
 * P2-05: با Logger ساختاریافته ثبت می‌شود (به‌جای خروجی پراکنده).
 */

import { getMelkApiConfig } from "@/lib/melk-api/config";
import { withRouteLog } from "@/lib/logger";

export const GET = withRouteLog("health", async (): Promise<Response> => {
  const cfg = getMelkApiConfig();
  return Response.json({
    ok: true,
    mode: cfg.mode,
    armApiBase: cfg.armApiBase,
    pmApiBase: cfg.pmApiBase,
    time: new Date().toISOString(),
  });
});
