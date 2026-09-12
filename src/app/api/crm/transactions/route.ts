/**
 * GET /api/crm/transactions
 * فهرست معاملات (گزارش تطابق) با فیلترهای واقعی — خوانده‌شده از کش محلی
 * که «فقط» با داده واقعی استخراج‌شده از arus-api.melketabriz.ir پر می‌شود.
 * اگر کش خالی باشد و نشست دارای توکن ARM باشد، همگام‌سازی زنده انجام می‌شود.
 * فیلترها (عین خود سامانه + توسعه داشبورد):
 *   بازه تاریخ (جلالی در UI → ISO)، کد ملک، کد درخواست، شماره هولوگرام،
 *   نوع تطبیق (رویداد / آگهی پیشنهادی / هر دو)
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

    const where: Prisma.TransactionRecordWhereInput = {};
    const dateFrom = sp.get("dateFrom");
    const dateTo = sp.get("dateTo");
    if (dateFrom || dateTo) {
      where.contractDate = {
        ...(dateFrom ? { gte: new Date(`${dateFrom}T00:00:00`) } : {}),
        ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59.999`) } : {}),
      };
    }
    const propertyCode = sp.get("propertyCode");
    if (propertyCode) where.propertyCode = { contains: propertyCode };
    const requestCode = sp.get("requestCode");
    if (requestCode) where.requestCode = { contains: requestCode };
    const contractHolo = sp.get("contractHolo");
    if (contractHolo) where.contractHolo = { contains: contractHolo };

    // نوع تطبیق — ترکیب رویداد/آگهی پیشنهادی (نقاط قوت داشبورد نسبت به سامانه اصلی)
    const matchKind = sp.get("matchKind");
    const baseAnd: Prisma.TransactionRecordWhereInput[] = Array.isArray(where.AND) ? where.AND : [];
    if (matchKind === "event") {
      where.eventsCount = { gt: 0 };
    } else if (matchKind === "suggested") {
      where.suggestedPropertyCount = { gt: 0 };
    } else if (matchKind === "both") {
      where.AND = [...baseAnd, { eventsCount: { gt: 0 } }, { suggestedPropertyCount: { gt: 0 } }];
    }

    const limit = Math.min(Math.max(num(sp.get("limit")) ?? 50, 1), 5000);
    const offset = Math.max(num(sp.get("offset")) ?? 0, 0);
    const sortBy = (sp.get("sortBy") ?? "contractDate") as "contractDate" | "eventsCount" | "suggestedPropertyCount";
    const sortDir: Prisma.SortOrder = sp.get("sortDir") === "asc" ? "asc" : "desc";

    const [rows, total] = await Promise.all([
      db.transactionRecord.findMany({
        where,
        orderBy: { [sortBy]: sortDir },
        take: limit,
        skip: offset,
      }),
      db.transactionRecord.count({ where }),
    ]);

    // خلاصه چهارگانه همان بازه (عین شاخص‌های بالای گزارش خود سامانه)
    const bothWhere: Prisma.TransactionRecordWhereInput = {
      ...where,
      AND: [...(Array.isArray(where.AND) ? where.AND : []), { eventsCount: { gt: 0 } }, { suggestedPropertyCount: { gt: 0 } }],
    };
    const [totalCount, hasRequestEvent, hasSuggestedProperty, hasBoth, withHolo, withRequest] = await Promise.all([
      db.transactionRecord.count({ where }),
      db.transactionRecord.count({ where: { ...where, eventsCount: { gt: 0 } } }),
      db.transactionRecord.count({ where: { ...where, suggestedPropertyCount: { gt: 0 } } }),
      db.transactionRecord.count({ where: bothWhere }),
      db.transactionRecord.count({ where: { ...where, contractHolo: { not: null } } }),
      db.transactionRecord.count({ where: { ...where, requestCode: { not: null } } }),
    ]);

    return Response.json({
      ok: true,
      rows,
      total,
      limit,
      offset,
      summary: { totalCount, hasRequestEvent, hasSuggestedProperty, hasBoth, withHolo, withRequest },
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
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در استخراج معاملات.", 500, false));
  }
}
