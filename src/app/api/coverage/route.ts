/**
 * /api/coverage — GET (P6545/گام۲ BLOCK 2.3)
 * پوشش اطلاعات هر ستون در چهار کاشی M1-M4.
 *
 * PN-012 · BLOCK 1 — روت لاغر: Auth + Service + Response.
 * منطق دامنه به ‎src/lib/services/coverage.ts‎ منتقل شد (بند ۱.۲ دستور).
 */
import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { getCoverageReport } from "@/lib/services/coverage";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  try {
    const report = await getCoverageReport();
    return Response.json(report);
  } catch (e) {
    return Response.json({ ok: false, message: (e as Error).message }, { status: 500 });
  }
}
