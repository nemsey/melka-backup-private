/**
 * GET /api/crm/interactions
 * تعاملات مشاوران با یکدیگر — عین گزارش realtor-interactions خود سامانه ARM:
 * «مشاور درخواست» × «مشاور آگهی» × تعداد.
 * خوانده‌شده از کش محلی که فقط با داده واقعی سامانه ملک تبریز پر می‌شود.
 * پارامتر اختیاری realtor: فیلتر روی نام یکی از طرف‌ها (مثل خود سامانه).
 */

import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSyncState } from "@/lib/melk-api/sync";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  try {
    const syncState = await getSyncState();
    const sp = request.nextUrl.searchParams;

    const realtor = sp.get("realtor");
    let where: Prisma.InteractionRecordWhereInput = {};
    if (realtor) {
      where = {
        OR: [{ requestRealtorName: { contains: realtor } }, { propertyRealtorName: { contains: realtor } }],
      };
    }

    const [rows, total] = await Promise.all([
      db.interactionRecord.findMany({
        where,
        orderBy: { count: "desc" },
        take: 1000,
      }),
      db.interactionRecord.count({ where }),
    ]);

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
