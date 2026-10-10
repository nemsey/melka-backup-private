/**
 * /api/admin/users/[id]/permissions — PN-016: ماتریس مجوزها (کاشی × عملیات)
 * PUT — بازنویسی کامل ماتریس مجوزهای کاربر (فقط OWNER؛ مالک از ماتریس عبور می‌کند)
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { audit } from "@/lib/auth/session";
import { setUserPermissions, getUserWithPermissions } from "@/lib/services/users-service";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(request, "OWNER", "PUT /api/admin/users/[id]/permissions");
  if (guard instanceof MelkApiError) return errorResponse(guard);
  const { id } = await params;

  let raw: unknown = null;
  try {
    raw = await request.json();
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "بدنه درخواست نامعتبر است.", 400, false));
  }
  const body = (raw ?? {}) as {
    permissions?: Array<{ tileId: string; canRead: boolean; canWrite: boolean; canDelete: boolean; canExport: boolean; canSync: boolean }>;
  };
  if (!Array.isArray(body.permissions)) {
    return errorResponse(new MelkApiError("UNKNOWN", "فهرست مجوزها لازم است.", 400, false));
  }

  try {
    await setUserPermissions(id, body.permissions, guard.ctx.personnelCode);
    const fresh = await getUserWithPermissions(id);
    await audit("USER_PERMISSIONS_SET", guard.ctx.personnelCode, `userId=${id}; count=${fresh.permissions.length}`);
    return Response.json({ ok: true, permissions: fresh.permissions });
  } catch (e) {
    if (e instanceof MelkApiError) return errorResponse(e);
    return errorResponse(new MelkApiError("UNKNOWN", "خطای غیرمنتظره در ذخیرهٔ مجوزها.", 500, false));
  }
}
