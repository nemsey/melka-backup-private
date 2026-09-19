/**
 * GET /api/crm/interactions
 * تعاملات مشاوران با یکدیگر — عین گزارش realtor-interactions خود سامانه ARM:
 * «مشاور درخواست» × «مشاور آگهی» × تعداد.
 * خوانده‌شده از کش محلی که فقط با داده واقعی سامانه ملک تبریز پر می‌شود.
 * پارامتر اختیاری realtor: فیلتر روی نام یکی از طرف‌ها (مثل خود سامانه).
 */

import { NextRequest } from "next/server";
import { getExpertRepository } from "@/core/repositories";
import { getSyncState } from "@/lib/melk-api/sync";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
// P6.5-04-i — دامنه فقط از helper مرکزی (تک‌نقطه تصمین)
import { ownerLoginPath, resolveEntityAccess } from "@/lib/access/scope";
import { witnessScopedRead } from "@/lib/audit";

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  try {
    const syncState = await getSyncState();
    const sp = request.nextUrl.searchParams;

    const realtor = sp.get("realtor");

    // P6.5-04-i — تعامل تجمیعی است (ماتریس §۵.۳): همه می‌بینند؛ مالک با شاهد owner.read
    const access = resolveEntityAccess(guard, "interaction");

    const { rows, total } = await getExpertRepository().listInteractions({ realtor: realtor ?? undefined });
    await witnessScopedRead(guard, "interaction", total, access.isOwnerRead, ownerLoginPath(guard));

    // تجمیع درجه همکاری هر مشاور (مجموع طرف درخواست + طرف آگهی)
    const degreeMap = new Map<string, number>();
    for (const r of rows) {
      degreeMap.set(r.requestRealtorName, (degreeMap.get(r.requestRealtorName) ?? 0) + r.count);
      degreeMap.set(r.propertyRealtorName, (degreeMap.get(r.propertyRealtorName) ?? 0) + r.count);
    }
    const topRealtors = [...degreeMap.entries()]
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    return Response.json({
      ok: true,
      rows,
      total,
      topRealtors,
      // شفافیت منبع داده برای UI
      dataSource: {
        real: true,
        cached: syncState.lastSuccessAt !== null,
        lastSuccessAt: syncState.lastSuccessAt,
        lastSyncedAt: syncState.lastSyncedAt,
        liveError: syncState.lastError,
        syncAttempts: syncState.attempts,
      },
    });
  } catch (err) {
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در استخراج تعاملات مشاوران.", 500, false));
  }
}
