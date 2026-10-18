/**
 * GET/POST /api/admin/diagnosis — PN-020/فاز ۱۰ (خودآگاهی)
 * ---------------------------------------------------------------------------
 * GET  → آخرین گزارش تشخیص + خلاصهٔ هفت اجرای اخیر + کاندیدهای ترمیم (فاز ۱۱)
 * POST → اجرای فوری چرخهٔ تشخیص دستی (OWNER-only)
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { getLatestDiagnosis, runDiagnosisCycle } from "@/lib/services/self-diagnosis-service";

export async function GET(request: NextRequest) {
  const guard = await requireRole(request, "OWNER", "/api/admin/diagnosis");
  if (guard instanceof MelkApiError) return errorResponse(guard);
  try {
    const data = await getLatestDiagnosis();
    return Response.json({ ok: true, ...data });
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در خواندن گزارش تشخیص خودآگاهی.", 500, false));
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireRole(request, "OWNER", "/api/admin/diagnosis");
  if (guard instanceof MelkApiError) return errorResponse(guard);
  try {
    const result = await runDiagnosisCycle("manual");
    return Response.json({ ok: true, ...result });
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "اجرای چرخهٔ تشخیص شکست خورد.", 500, false));
  }
}
