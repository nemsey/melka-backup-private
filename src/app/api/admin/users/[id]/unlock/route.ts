/**
 * /api/admin/users/[id]/unlock — PN-016: بازنشانی قفل حساب و OTP
 * POST — صفر کردن failedAttempts + lockedUntil (نرخ‌سنج ورود) (فقط OWNER)
 *       — OTP مهمان درون‌حافظه با انقضای طبیعی خودش رها می‌شود (کدی برای بازنشانی نیست)
 * روت لاغر — منطق در users-service (مرز مخزن).
 */

import { NextRequest } from "next/server";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { MelkApiError } from "@/lib/melk-api/types";
import { audit } from "@/lib/auth/session";
import { unlockUser } from "@/lib/services/users-service";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(request, "OWNER", "POST /api/admin/users/[id]/unlock");
  if (guard instanceof MelkApiError) return errorResponse(guard);
  const { id } = await params;
  try {
    await unlockUser(id, guard.ctx.personnelCode);
    await audit("USER_UNLOCKED", guard.ctx.personnelCode, `userId=${id}`);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof MelkApiError) return errorResponse(e);
    return errorResponse(new MelkApiError("UNKNOWN", "خطای غیرمنتظره در بازنشانی قفل.", 500, false));
  }
}
