/**
 * GET /api/admin/relay/status — PN-031 (شورا-ن۰۳۷)
 * ---------------------------------------------------------------------------
 * نمای وضعیت رله برای مالک (OWNER): دستگاه‌ها + صف + آمار ۲۴ساعته.
 * بدون هیچ رازی — فقط شمارندهها و زمانها (قانون «صفر لاگ محتوا»).
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { relayOverview } from "@/lib/melk-api/relay";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const guard = await requireRole(request, "OWNER", "/api/admin/relay/status");
  if (guard instanceof MelkApiError) return errorResponse(guard);
  const overview = await relayOverview();
  return Response.json({ ok: true, relay: overview }, { headers: { "cache-control": "no-store" } });
}
