/**
 * GET /api/crm/visits
 * فهرست بازدیدها و پیگیری‌ها — خوانده‌شده از کش محلی که فقط با داده واقعی
 * استخراج‌شده از arus-api.melketabriz.ir (visits/list) پر می‌شود.
 * فیلترها (عین خود سامانه + توسعه داشبورد):
 *   کد آگهی، نام درخواست‌دهنده، نام بررسی‌کننده، وضعیت، بازه تاریخ (هجری شمسی)
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

    const where: Prisma.VisitRecordWhereInput = {};
    const propertyCode = sp.get("propertyCode");
    if (propertyCode) where.propertyCode = { contains: propertyCode };
    const requester = sp.get("requester");
    if (requester) where.requesterName = { contains: requester };
    const checker = sp.get("checker");
    if (checker) where.checkerName = { contains: checker };
    const status = sp.get("status");
    if (status) where.status = { contains: status };

    const dateFrom = sp.get("dateFrom");
    const dateTo = sp.get("dateTo");
    if (dateFrom || dateTo) {
      where.createdAt = {
        ...(dateFrom ? { gte: new Date(`${dateFrom}T00:00:00`) } : {}),
        ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59.999`) } : {}),
      };
    }

    const limit = Math.min(Math.max(num(sp.get("limit")) ?? 200, 1), 5000);
    const offset = Math.max(num(sp.get("offset")) ?? 0, 0);

    const [rows, total] = await Promise.all([
      db.visitRecord.findMany({ where, orderBy: { createdAt: "desc" }, take: limit, skip: offset }),
      db.visitRecord.count({ where }),
    ]);

    // شاخص‌های تحلیلی برای ایجنت و کارت‌های شاخص
    const [checkedCount, distinctCodes, distinctRequesters] = await Promise.all([
      db.visitRecord.count({ where: { ...where, checkTime: { not: null } } }),
      db.visitRecord.findMany({ where, select: { propertyCode: true } }).then((rs) => new Set(rs.map((r) => r.propertyCode)).size),
      db.visitRecord.findMany({ where, select: { requesterName: true } }).then((rs) => new Set(rs.map((r) => r.requesterName)).size),
    ]);

    return Response.json({
      ok: true,
      rows,
      total,
      limit,
      offset,
      summary: {
        totalCount: total,
        checkedCount,
        distinctPropertyCodes: distinctCodes,
        distinctRequesters: distinctRequesters,
      },
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
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در دریافت بازدیدها.", 500, false));
  }
}
