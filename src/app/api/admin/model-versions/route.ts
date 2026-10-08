/**
 * /api/admin/model-versions — PN-018 فاز ۷ (شورا-ن۰۲۲): رجیستری نسخه‌های مدل
 * ---------------------------------------------------------------------------
 * GET  — فهرست نسخه‌ها (فیلتر modelId/status) (فقط OWNER)
 * POST — ساخت/به‌روزرسانی چالشگر فعال (فقط OWNER)
 * روت لاغر — منطق در src/lib/services/model-versioning-service.ts (مرز مخزن).
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { ensureChallenger, listModelVersions } from "@/lib/services/model-versioning-service";

export async function GET(request: NextRequest) {
  const guard = await requireRole(request, "OWNER", "GET /api/admin/model-versions");
  if (guard instanceof MelkApiError) return errorResponse(guard);
  const url = new URL(request.url);
  const rows = await listModelVersions({
    modelId: url.searchParams.get("modelId") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
  });
  return Response.json({ ok: true, rows });
}

export async function POST(request: NextRequest) {
  const guard = await requireRole(request, "OWNER", "POST /api/admin/model-versions");
  if (guard instanceof MelkApiError) return errorResponse(guard);
  let raw: unknown = null;
  try {
    raw = await request.json();
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "بدنه درخواست نامعتبر است.", 400, false));
  }
  const body = (raw ?? {}) as { modelId?: string; weights?: Record<string, number>; notes?: string };
  try {
    const row = await ensureChallenger({
      modelId: String(body.modelId ?? ""),
      weights: body.weights,
      notes: body.notes ?? undefined,
      actor: guard.ctx.personnelCode,
    });
    return Response.json({ ok: true, version: row });
  } catch (e) {
    if (e instanceof MelkApiError) return errorResponse(e);
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در ساخت چالشگر.", 500, false));
  }
}
