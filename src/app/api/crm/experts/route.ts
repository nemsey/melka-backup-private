/**
 * GET /api/crm/experts
 * فهرست کارشناسان با فیلتر — خوانده‌شده از کش محلی
 * فیلترها: نام و نام خانوادگی، موبایل، کد پرسنلی، آدرس، شعبه، وضعیت
 */

import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/lib/melk-api/sync";
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
    await ensureSeeded();
    const sp = request.nextUrl.searchParams;

    const where: Prisma.ExpertRecordWhereInput = {};
    const fullName = sp.get("fullName");
    if (fullName) where.fullName = { contains: fullName };
    const mobile = sp.get("mobile");
    if (mobile) where.mobile = { contains: mobile };
    const personnelCode = sp.get("personnelCode");
    if (personnelCode) where.personnelCode = { contains: personnelCode };
    const address = sp.get("address");
    if (address) where.address = { contains: address };
    const branch = sp.get("branch");
    if (branch) where.branch = { contains: branch };
    const active = sp.get("active");
    if (active === "true" || active === "false") where.active = active === "true";

    const limit = Math.min(Math.max(num(sp.get("limit")) ?? 50, 1), 500);
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

    // آمار معاملاتی هر کارشناس برای نمایش عملکرد
    const codes = rows.map((r) => r.personnelCode);
    const grouped = await db.transactionRecord.groupBy({
      by: ["expertCode"],
      where: { expertCode: { in: codes } },
      _count: { id: true },
      _sum: { price: true },
    });
    const perfMap = new Map(grouped.map((g) => [g.expertCode, g]));

    const enriched = rows.map((r) => {
      const g = perfMap.get(r.personnelCode);
      return {
        ...r,
        dealCount: g?._count.id ?? 0,
        totalVolume: g?._sum.price ?? 0,
      };
    });

    return Response.json({ ok: true, rows: enriched, total, limit, offset });
  } catch (err) {
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در استخراج کارشناسان.", 500, false));
  }
}
