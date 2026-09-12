/**
 * GET /api/crm/meta
 * گزینه‌های فیلتر برای پرکردن دراپ‌داون کاشی‌ها:
 *   نقش‌های کاربران، کسب‌وکارها (شعبه‌ها)، ثبت‌کنندگان —
 *   همگی از داده واقعی استخراج‌شده کش می‌شوند.
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/lib/melk-api/sync";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  try {
    // کش فقط با داده واقعی سامانه ملک تبریز پر می‌شود
    await ensureSeeded(guard.armTokens?.accessToken);
    const [roles, businesses, creators] = await Promise.all([
      db.expertRecord.findMany({ distinct: ["role"], select: { role: true } }),
      db.expertRecord.findMany({ distinct: ["businessTitle"], select: { businessTitle: true } }),
      db.expertRecord.findMany({ distinct: ["creator"], select: { creator: true } }),
    ]);

    return Response.json({
      ok: true,
      roles: roles.map((r) => r.role).filter(Boolean).sort((a, b) => a.localeCompare(b, "fa")),
      businesses: businesses.map((b) => b.businessTitle).filter(Boolean).sort((a, b) => a.localeCompare(b, "fa")),
      creators: creators.map((c) => c.creator).filter((c): c is string => Boolean(c)).sort((a, b) => a.localeCompare(b, "fa")),
    });
  } catch (err) {
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در دریافت فراداده.", 500, false));
  }
}
