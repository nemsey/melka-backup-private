/**
 * GET /api/crm/experts
 * فهرست کارشناسان/کاربران با فیلتر — خوانده‌شده از کش محلی
 * فیلترها (عین users-list خود سامانه + توسعه داشبورد):
 *   نام و نام خانوادگی، موبایل، کد پرسنلی، نقش، کسب‌وکار (شعبه)، وضعیت
 */

import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
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

    const where: Prisma.ExpertRecordWhereInput = {};
    const fullName = sp.get("fullName");
    if (fullName) where.fullName = { contains: fullName };
    const mobile = sp.get("mobile");
    if (mobile) where.mobile = { contains: mobile };
    const personnelCode = sp.get("personnelCode");
    if (personnelCode) where.personnelCode = { contains: personnelCode };
    const role = sp.get("role");
    if (role) where.role = { contains: role };
    const businessTitle = sp.get("businessTitle");
    if (businessTitle) where.businessTitle = { contains: businessTitle };
    const creator = sp.get("creator");
    if (creator) where.creator = { contains: creator };
    const active = sp.get("active");
    if (active === "true" || active === "false") where.active = active === "true";

    const limit = Math.min(Math.max(num(sp.get("limit")) ?? 50, 1), 1000);
    const offset = Math.max(num(sp.get("offset")) ?? 0, 0);

    const [rows, total] = await Promise.all([
      db.expertRecord.findMany({
        where,
        orderBy: { fullName: sp.get("sortDir") === "desc" ? "desc" : "asc" },
        take: limit,
        skip: offset,
      }),
      db.expertRecord.count({ where }),
    ]);

    // مجموع تعاملات هر مشاور (مجموع همکاری‌های منجر به تطبیق — از گزارش تعاملات سامانه)
    const names = rows.map((r) => r.fullName);
    const [reqGrouped, propGrouped] = await Promise.all([
      db.interactionRecord.groupBy({
        by: ["requestRealtorName"],
        where: { requestRealtorName: { in: names } },
        _sum: { count: true },
      }),
      db.interactionRecord.groupBy({
        by: ["propertyRealtorName"],
        where: { propertyRealtorName: { in: names } },
        _sum: { count: true },
      }),
    ]);
    const reqMap = new Map(reqGrouped.map((g) => [g.requestRealtorName, g._sum.count ?? 0]));
    const propMap = new Map(propGrouped.map((g) => [g.propertyRealtorName, g._sum.count ?? 0]));

    const enriched = rows.map((r) => {
      const asRequester = reqMap.get(r.fullName) ?? 0;
      const asPropertyRealtor = propMap.get(r.fullName) ?? 0;
      return {
        ...r,
        /** مجموع تعامل‌ها (نقش درخواست‌دهنده + نقش آگهی‌گذار) */
        interactionTotal: asRequester + asPropertyRealtor,
      };
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
