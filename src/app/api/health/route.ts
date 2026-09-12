/**
 * GET /api/health — وضعیت سامانه (عمومی، بدون احراز هویت)
 * شامل حالت اتصال (mock/real) برای نمایش راهنمای دمو در صفحه ورود.
 */

import { getMelkApiConfig } from "@/lib/melk-api/config";

export async function GET() {
  const cfg = getMelkApiConfig();
  return Response.json({
    ok: true,
    mode: cfg.mode,
    armBaseUrl: cfg.armBaseUrl,
    time: new Date().toISOString(),
  });
}
