/**
 * GET /api/crm/meta
 * گزینه‌های فیلتر (محله‌ها، انواع ملک، شعبه‌ها) برای پرکردن دراپ‌داون کاشی‌ها
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/lib/melk-api/sync";
import { PROPERTY_TYPES } from "@/lib/melk-api/types";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  try {
    // کش فقط با داده واقعی سامانه ملک تبریز پر می‌شود
    await ensureSeeded(guard.armTokens?.accessToken);
    const [districts, branches] = await Promise.all([
      db.transactionRecord.findMany({ distinct: ["district"], select: { district: true } }),
      db.expertRecord.findMany({ distinct: ["branch"], select: { branch: true } }),
    ]);

    return Response.json({
      ok: true,
      districts: districts.map((d) => d.district).sort((a, b) => a.localeCompare(b, "fa")),
      propertyTypes: [...PROPERTY_TYPES],
      branches: branches.map((b) => b.branch).sort((a, b) => a.localeCompare(b, "fa")),
    });
  } catch (err) {
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در دریافت فراداده.", 500, false));
  }
}
