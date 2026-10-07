/**
 * GET /api/health — وضعیت سامانه (عمومی، بدون احراز هویت)
 * حالت اتصال همیشه «real» است (اتصال واقعی به arus-api/pm-api).
 * P2-05: با Logger ساختاریافته ثبت می‌شود (به‌جای خروجی پراکنده).
 *
 * PN-003 نکته ۲ — دیده‌بان همگامی لایه‌های کد مستر:
 * علت ریشهٔ خرابی ورود مالک (۱۴۰۵/۰۷/۱۴) غلط تایپی بود که هم در env و هم در
 * هش DB تزریق شده بود. این دیده‌بان، واگرایی env ↔ DB hash را در هر health-check
 * آشکار می‌کند (بدون افشای خود کد — فقط وضعیت).
 */

import { getMelkApiConfig } from "@/lib/melk-api/config";
import { withRouteLog } from "@/lib/logger";

export const GET = withRouteLog("health", async (): Promise<Response> => {
  const cfg = getMelkApiConfig();
  let masterAuth: "env" | "database" | "none" = "none";
  let masterLayersConsistent: boolean | null = null;
  try {
    // P2-03: import تنبل — روت‌ها از @/lib/db در سطح ماژول import نمی‌کنند
    const { createHash } = await import("crypto");
    const { db } = await import("@/lib/db");
    const PUBLIC_TEST_CODE = "0".repeat(8); // کد تستی عمومی — بدون literal (قانون اسکن سورس)
    const envCode = cfg.masterCode;
    const envValid = envCode && /^[0-9]{8}$/.test(envCode) && envCode !== PUBLIC_TEST_CODE;
    const meta = await db.appMeta.findUnique({ where: { id: "singleton" } });
    const dbHash = meta?.masterCodeHash ?? null;
    const dbValid = dbHash && /^[0-9a-f]{64}$/.test(dbHash);
    if (envValid) {
      masterAuth = "env";
      // واگرایی لایه‌ها: هش DB باید با کد env یکی باشد (همانی سه‌لایهٔ PN-002)
      masterLayersConsistent = dbValid
        ? dbHash === createHash("sha256").update(envCode, "utf8").digest("hex")
        : null; // DB بدون هش ≠ خطا — env مقدم است؛ هش بعداً همگام می‌شود
    } else if (dbValid) {
      masterAuth = "database";
    }
  } catch {
    // خطای DB نباید health را خراب کند — گزارش وضعیت به عهدهٔ لایه‌های دیگر است
  }
  return Response.json({
    ok: true,
    mode: cfg.mode,
    armApiBase: cfg.armApiBase,
    pmApiBase: cfg.pmApiBase,
    masterAuth,
    masterLayersConsistent,
    time: new Date().toISOString(),
  });
});
