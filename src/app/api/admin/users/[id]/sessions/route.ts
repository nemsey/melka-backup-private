/**
 * /api/admin/users/[id]/sessions — PN-016: نشست‌های فعال کاربر
 * GET    — فهرست نشست‌های فعال (فقط OWNER)
 * DELETE — بستن همهٔ نشست‌های فعال از راه دور (Session اصلی + UserSession) (فقط OWNER)
 */

import { NextRequest } from "next/server";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { MelkApiError } from "@/lib/melk-api/types";
import { audit } from "@/lib/auth/session";
import { getUserSessions, revokeUserSessions } from "@/lib/services/users-service";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(request, "OWNER", "GET /api/admin/users/[id]/sessions");
  if (guard instanceof MelkApiError) return errorResponse(guard);
  const { id } = await params;
  const rows = await getUserSessions(id);
  return Response.json({ ok: true, rows });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(request, "OWNER", "DELETE /api/admin/users/[id]/sessions");
  if (guard instanceof MelkApiError) return errorResponse(guard);
  const { id } = await params;
  const closed = await revokeUserSessions(id);
  await audit("USER_SESSIONS_CLOSED", guard.ctx.personnelCode, `userId=${id}; closed=${closed}`);
  return Response.json({ ok: true, closed });
}
