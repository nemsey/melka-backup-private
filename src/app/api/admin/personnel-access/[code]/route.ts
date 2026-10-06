/**
 * DELETE /api/admin/personnel-access/[code] — PN-008 BLOCK 7 بند ۷.۲
 * حذف رکورد دسترسی (فقط OWNER) — کد بدون رکورد = none (امنیت پیش‌فرض)
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { audit } from "@/lib/auth/session";
import { deletePersonnelAccess } from "@/lib/access/personnel-access";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const role = await requireRole(request, "OWNER", "DELETE /api/admin/personnel-access/[code]");
  if (role instanceof MelkApiError) return errorResponse(role);
  const guard = role.ctx;

  const { code } = await params;
  const personnelCode = decodeURIComponent(code ?? "").trim();
  if (!personnelCode) {
    return errorResponse(new MelkApiError("UNKNOWN", "کد پرسنلی لازم است.", 400, false));
  }

  const deleted = await deletePersonnelAccess(personnelCode);
  await audit("PERSONNEL_ACCESS_DELETE", guard.personnelCode, `code=${personnelCode};existed=${deleted}`);
  return Response.json({ ok: true, deleted });
}
