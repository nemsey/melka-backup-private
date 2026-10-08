/**
 * /api/admin/decisions — PN-019 فاز ۸ (شورا-ن۰۲۳): رجیستری تصمیم‌های سایه
 * ---------------------------------------------------------------------------
 * GET  — فهرست تصمیم‌ها (فیلتر status) (فقط OWNER)
 * POST — ساخت تصمیم سایه از predictionId (فقط OWNER — mode=shadow اجباری)
 * روت لاغر — منطق در src/lib/services/decision-service.ts (مرز مخزن).
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { createDecisionFromPrediction, listDecisions } from "@/lib/services/decision-service";

export async function GET(request: NextRequest) {
  const guard = await requireRole(request, "OWNER", "GET /api/admin/decisions");
  if (guard instanceof MelkApiError) return errorResponse(guard);
  const url = new URL(request.url);
  const rows = await listDecisions({
    status: url.searchParams.get("status") ?? undefined,
    limit: Number(url.searchParams.get("limit") ?? 50),
  });
  return Response.json({ ok: true, rows });
}

export async function POST(request: NextRequest) {
  const guard = await requireRole(request, "OWNER", "POST /api/admin/decisions");
  if (guard instanceof MelkApiError) return errorResponse(guard);
  let raw: unknown = null;
  try {
    raw = await request.json();
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "بدنه درخواست نامعتبر است.", 400, false));
  }
  const body = (raw ?? {}) as {
    predictionId?: string;
    probability?: number;
    context?: Record<string, unknown>;
    tierAtCreation?: number;
  };
  try {
    const row = await createDecisionFromPrediction({
      predictionId: String(body.predictionId ?? ""),
      probability: Number(body.probability ?? 0.5),
      context: body.context as never,
      tierAtCreation: Number(body.tierAtCreation ?? 0),
      actor: guard.ctx.personnelCode,
      mode: "shadow",
    });
    return Response.json({ ok: true, decision: row });
  } catch (e) {
    if (e instanceof MelkApiError) return errorResponse(e);
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در ساخت تصمیم سایه.", 500, false));
  }
}
