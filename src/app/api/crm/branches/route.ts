/**
 * GET  /api/crm/branches — رجیستری چهار شعبه ملک تبریز + نقشهٔ مالک (P6530/گام ۱ نکته ۲)
 * PUT  /api/crm/branches — به‌روزرسانی نقشهٔ «کارشناس → شعبه» (فقط مالک)
 * DELETE /api/crm/branches — حذف انتساب‌های نام‌شده (فقط مالک)
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { sanitizeOwnerBranchMap } from "@/lib/branches";
import { branchesOverview, removeOwnerBranchAssignments, writeOwnerBranchMap } from "@/lib/branch-store";

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);
  try {
    const { registry, ownerMap } = await branchesOverview();
    return Response.json({
      ok: true,
      registry,
      ownerMap,
      branchesCount: registry.length,
    });
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در خواندن رجیستری شعب.", 500, false));
  }
}

export async function PUT(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);
  if (guard.role !== "OWNER") {
    return errorResponse(new MelkApiError("FORBIDDEN", "تنها مالک سامانه می‌تواند شعبه کارشناسان را تعیین کند.", 403, false));
  }
  try {
    const body = (await request.json()) as { map?: Record<string, string> };
    const clean = sanitizeOwnerBranchMap(body.map);
    if (Object.keys(clean).length === 0) {
      return errorResponse(new MelkApiError("UNPROCESSABLE", "نقشهٔ شعبه خالی یا دارای مقادیر نامعتبر است.", 400, false));
    }
    const merged = await writeOwnerBranchMap(clean);
    return Response.json({ ok: true, ownerMap: merged });
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در ذخیرهٔ نقشهٔ شعبه.", 500, false));
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);
  if (guard.role !== "OWNER") {
    return errorResponse(new MelkApiError("FORBIDDEN", "تنها مالک سامانه می‌تواند انتساب شعبه را حذف کند.", 403, false));
  }
  try {
    const body = (await request.json()) as { names?: string[] };
    const names = Array.isArray(body.names) ? body.names.filter((n) => typeof n === "string" && n.trim() !== "") : [];
    if (names.length === 0) {
      return errorResponse(new MelkApiError("UNPROCESSABLE", "فهرست نام‌ها برای حذف خالی است.", 400, false));
    }
    const ownerMap = await removeOwnerBranchAssignments(names);
    return Response.json({ ok: true, ownerMap });
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در حذف انتساب شعبه.", 500, false));
  }
}
