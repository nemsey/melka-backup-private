/**
 * /api/runtime/health — GET (PN-010 / BLOCK 3)
 * ---------------------------------------------------------------------------
 * سلامت معماری «یک Web + یک Worker» از نگاه RuntimeSupervisor:
 *   • web: pid/uptime/memory/buildId
 *   • worker: زنده بودن (ضربان)، pid، شروع، سن آخرین ضربان
 *   • jobQueue: فهرست کارهای صف داخلی Worker با وضعیت اجرا
 *
 * فقط مالک (OWNER) — خواندنی، سبک، بدون عارضه.
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { RuntimeSupervisor } from "@/core/runtime/supervisor";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const role = await requireRole(request, "OWNER", "GET /api/runtime/health");
  if (role instanceof MelkApiError) return errorResponse(role);

  try {
    const supervisor = RuntimeSupervisor.getInstance();
    return Response.json(supervisor.health(), { headers: { "Cache-Control": "no-store, must-revalidate" } });
  } catch (err) {
    return errorResponse(
      new MelkApiError("UNKNOWN", `خطا در سلامت رانتایم: ${(err as Error).message}`, 500, false),
    );
  }
}
