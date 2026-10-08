/**
 * /api/admin/melk-users — PN-017 (شورا-ن۰۲۱): دفترچهٔ «مدیریت کاربران ملک تبریز»
 * ---------------------------------------------------------------------------
 * GET — تجمیع چندوجهی دپارتمان ملک تبریز (فقط OWNER):
 *   · پرسنل PM (سامانهٔ ملک تبریز — آینهٔ محلی ExpertProfile) با پیوند حساب اپ
 *   · آمار: شعبه‌ها · سمت‌ها · پوشش حساب‌ها · آخرین همگام‌سازی
 *   · وضعیت اتصال PM + نمای کلی کاربران اپ
 * روت لاغر — تمام منطق در src/lib/services/users-service.ts (مرز مخزن).
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { melkUsersDirectory } from "@/lib/services/users-service";

export async function GET(request: NextRequest) {
  const guard = await requireRole(request, "OWNER", "GET /api/admin/melk-users");
  if (guard instanceof MelkApiError) return errorResponse(guard);

  const url = new URL(request.url);
  const result = await melkUsersDirectory({
    q: url.searchParams.get("q") ?? undefined,
    branch: url.searchParams.get("branch") ?? undefined,
    role: url.searchParams.get("role") ?? undefined,
    onlyWithoutAccount: url.searchParams.get("onlyWithoutAccount") === "1",
  });

  return Response.json({ ok: true, ...result });
}
