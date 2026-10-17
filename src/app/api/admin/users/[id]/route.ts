/**
 * /api/admin/users/[id] — PN-016: پروفایل یک کاربر
 * ---------------------------------------------------------------------------
 * GET    — کاربر + ماتریس مجوزهای فعلی (فقط OWNER)
 * PATCH  — ویرایش پروفایل/نقش + بازنشانی اختیاری مجوزها (فقط OWNER)
 * DELETE — غیرفعال‌سازی + بستن همهٔ نشست‌ها (صفر حذف فیزیکی — دادهٔ مقدس؛ فقط OWNER)
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { audit } from "@/lib/auth/session";
import { getUserWithPermissions, updateUser, deactivateUser } from "@/lib/services/users-service";
import { isUserRole, isUserVisibility, type UserRole, type UserVisibility } from "@/lib/users/user-model";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(request, "OWNER", "GET /api/admin/users/[id]");
  if (guard instanceof MelkApiError) return errorResponse(guard);
  const { id } = await params;
  try {
    return Response.json({ ok: true, ...(await getUserWithPermissions(id)) });
  } catch (e) {
    if (e instanceof MelkApiError) return errorResponse(e);
    return errorResponse(new MelkApiError("UNKNOWN", "خطای غیرمنتظره.", 500, false));
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(request, "OWNER", "PATCH /api/admin/users/[id]");
  if (guard instanceof MelkApiError) return errorResponse(guard);
  const { id } = await params;

  let raw: unknown = null;
  try {
    raw = await request.json();
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "بدنه درخواست نامعتبر است.", 400, false));
  }
  const body = (raw ?? {}) as {
    fullName?: string; role?: string; branchTitle?: string | null;
    roleTitleFa?: string | null; isActive?: boolean; resetPermissions?: boolean;
    visibility?: string;
  };

  if (body.role !== undefined && !isUserRole(body.role)) {
    return errorResponse(new MelkApiError("UNKNOWN", "نقش نامعتبر است.", 400, false));
  }
  // PN-021 — تغییر دیده‌شدن (نمایان/پنهان) — اعتبارسنجی سطح روت + قواعد سرویس
  if (body.visibility !== undefined && !isUserVisibility(body.visibility)) {
    return errorResponse(new MelkApiError("UNKNOWN", "مقدار دیده‌شدن نامعتبر است (VISIBLE | HIDDEN).", 400, false));
  }

  try {
    const user = await updateUser(id, {
      fullName: body.fullName,
      role: body.role as UserRole | undefined,
      branchTitle: body.branchTitle,
      roleTitleFa: body.roleTitleFa,
      isActive: body.isActive,
      resetPermissions: body.resetPermissions,
      visibility: body.visibility as UserVisibility | undefined,
    }, guard.ctx.personnelCode);
    await audit("USER_UPDATED", guard.ctx.personnelCode, `userId=${id}; role=${user.role}; active=${user.isActive}; visibility=${user.visibility}`);
    return Response.json({ ok: true, user });
  } catch (e) {
    if (e instanceof MelkApiError) return errorResponse(e);
    return errorResponse(new MelkApiError("UNKNOWN", "خطای غیرمنتظره در ویرایش کاربر.", 500, false));
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(request, "OWNER", "DELETE /api/admin/users/[id]");
  if (guard instanceof MelkApiError) return errorResponse(guard);
  const { id } = await params;
  try {
    await deactivateUser(id, guard.ctx.personnelCode);
    await audit("USER_DEACTIVATED", guard.ctx.personnelCode, `userId=${id}`);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof MelkApiError) return errorResponse(e);
    return errorResponse(new MelkApiError("UNKNOWN", "خطای غیرمنتظره در غیرفعال‌سازی.", 500, false));
  }
}
