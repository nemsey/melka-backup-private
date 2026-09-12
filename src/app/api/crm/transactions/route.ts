/**
 * GET /api/crm/transactions
 * فهرست معاملات با فیلترهای کامل — خوانده‌شده از کش محلی (همگام با سامانه ملک تبریز)
 * فیلترها: بازه تاریخ، نام کارشناس، کد آگهی، کد درخواست، بازه مبلغ، محله، نوع ملک
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

    const where: Prisma.TransactionRecordWhereInput = {};
    const dateFrom = sp.get("dateFrom");
    const dateTo = sp.get("dateTo");
    if (dateFrom || dateTo) {
      where.dealDate = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59.999Z`) } : {}),
      };
    }
    const expertName = sp.get("expertName");
    if (expertName) where.expertName = { contains: expertName };
    const expertCode = sp.get("expertCode");
    if (expertCode) where.expertCode = { contains: expertCode };
    const listingCode = sp.get("listingCode");
    if (listingCode) where.listingCode = { contains: listingCode };
    const requestCode = sp.get("requestCode");
    if (requestCode) where.requestCode = { contains: requestCode };
    const priceMin = num(sp.get("priceMin"));
    const priceMax = num(sp.get("priceMax"));
    if (priceMin !== undefined || priceMax !== undefined) {
      where.price = {
        ...(priceMin !== undefined ? { gte: priceMin } : {}),
        ...(priceMax !== undefined ? { lte: priceMax } : {}),
      };
    }
    const district = sp.get("district");
    if (district) where.district = { contains: district };
    const propertyType = sp.get("propertyType");
    if (propertyType) where.propertyType = { contains: propertyType };

    const limit = Math.min(Math.max(num(sp.get("limit")) ?? 50, 1), 2000);
    const offset = Math.max(num(sp.get("offset")) ?? 0, 0);
    const sortBy = (sp.get("sortBy") ?? "dealDate") as "dealDate" | "price" | "expertName";
    const sortDir: Prisma.SortOrder = sp.get("sortDir") === "asc" ? "asc" : "desc";

    const [rows, total] = await Promise.all([
      db.transactionRecord.findMany({
        where,
        orderBy: sortBy === "expertName" ? { expertName: sortDir } : { [sortBy]: sortDir },
        take: limit,
        skip: offset,
      }),
      db.transactionRecord.count({ where }),
    ]);

    return Response.json({ ok: true, rows, total, limit, offset });
  } catch (err) {
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در استخراج معاملات.", 500, false));
  }
}
