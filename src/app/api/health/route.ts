/**
 * GET /api/health — وضعیت سامانه (عمومی، بدون احراز هویت)
 * حالت اتصال همیشه «real» است (اتصال واقعی به arus-api/pm-api).
 * P2-05: با Logger ساختاریافته ثبت می‌شود (به‌جای خروجی پراکنده).
 *
 * PN-003 نکته ۲ — دیده‌بان همگامی لایه‌های کد مستر:
 * علت ریشهٔ خرابی ورود مالک (۱۴۰۵/۰۷/۱۴) غلط تایپی بود که هم در env و هم در
 * هش DB تزریق شده بود. این دیده‌بان، واگرایی env ↔ DB hash را در هر health-check
 * آشکار می‌کند (بدون افشای خود کد — فقط وضعیت).
 *
 * PN-012 · BLOCK 1 — روت لاغر: منطق appMeta به ‎src/lib/services/master-auth.ts‎ منتقل شد.
 */

import { getMelkApiConfig } from "@/lib/melk-api/config";
import { getMasterCodeState } from "@/lib/services/master-auth";
import { withRouteLog } from "@/lib/logger";

export const GET = withRouteLog("health", async (): Promise<Response> => {
  const cfg = getMelkApiConfig();
  const state = await getMasterCodeState(cfg.masterCode);
  return Response.json({
    ok: true,
    mode: cfg.mode,
    armApiBase: cfg.armApiBase,
    pmApiBase: cfg.pmApiBase,
    masterAuth: state.masterAuth,
    masterLayersConsistent: state.masterLayersConsistent,
    time: new Date().toISOString(),
  });
});
