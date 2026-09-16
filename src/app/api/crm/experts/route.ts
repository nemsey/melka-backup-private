/**
 * GET /api/crm/experts
 * فهرست کارشناسان/کاربران با فیلتر — خوانده‌شده از کش محلی
 * فیلترها (عین users-list خود سامانه + توسعه داشبورد):
 *   نام و نام خانوادگی، موبایل، کد پرسنلی، نقش، کسب‌وکار (شعبه)، وضعیت
 */

import { NextRequest } from "next/server";
import { getExpertRepository } from "@/core/repositories";
import { ensureSeeded, getSyncState } from "@/lib/melk-api/sync";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";

function num(v: string | null): number | undefined {
  if (v === null || v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  try {
    // تلاش برای استخراج زنده در صورت خالی‌بودن کش (فقط داده واقعی)
    const seed = await ensureSeeded(guard.armTokens?.accessToken);
    const syncState = await getSyncState();
    const sp = request.nextUrl.searchParams;

    const fullName = sp.get("fullName") ?? undefined;
    const mobile = sp.get("mobile") ?? undefined;
    const personnelCode = sp.get("personnelCode") ?? undefined;
    const role = sp.get("role") ?? undefined;
    const businessTitle = sp.get("businessTitle") ?? undefined;
    const creator = sp.get("creator") ?? undefined;
    const activeRaw = sp.get("active");
    const active = activeRaw === "true" || activeRaw === "false" ? activeRaw === "true" : undefined;

    const limit = Math.min(Math.max(num(sp.get("limit")) ?? 50, 1), 1000);
    const offset = Math.max(num(sp.get("offset")) ?? 0, 0);

    // فهرست + مجموع تعاملات هر مشاور — عین groupBy دوتایی روت قبلی
    const { rows: enriched, total } = await getExpertRepository().listWithInteractions({
      filter: { fullName, mobile, personnelCode, role, businessTitle, creator, active },
      sortDir: sp.get("sortDir") === "desc" ? "desc" : "asc",
      limit,
      offset,
    });

    return Response.json({
      ok: true,
      rows: enriched,
      total,
      limit,
      offset,
      // شفافیت منبع داده برای UI
      dataSource: {
        real: true,
        cached: syncState.lastSuccessAt !== null,
        lastSuccessAt: syncState.lastSuccessAt,
        lastSyncedAt: syncState.lastSyncedAt,
        liveError: seed.liveError ?? syncState.lastError,
        syncAttempts: syncState.attempts,
      },
    });
  } catch (err) {
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در استخراج کارشناسان.", 500, false));
  }
}
