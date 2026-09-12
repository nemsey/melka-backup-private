/**
 * GET /api/health — وضعیت سامانه (عمومی، بدون احراز هویت)
 * حالت اتصال همیشه «real» است (اتصال واقعی به arus-api/pm-api).
 */

import { getMelkApiConfig } from "@/lib/melk-api/config";

export async function GET() {
  const cfg = getMelkApiConfig();
  return Response.json({
    ok: true,
    mode: cfg.mode,
    armApiBase: cfg.armApiBase,
    pmApiBase: cfg.pmApiBase,
    time: new Date().toISOString(),
  });
}
