/**
 * GET /api/crm/visits
 * فهرست بازدیدها و پیگیری‌ها — خوانده‌شده از کش محلی که فقط با داده واقعی
 * استخراج‌شده از arus-api.melketabriz.ir (visits/list) پر می‌شود.
 * فیلترها (عین خود سامانه + توسعه داشبورد):
 *   کد آگهی، نام درخواست‌دهنده، نام بررسی‌کننده، وضعیت، بازه تاریخ (هجری شمسی)
 */

import { NextRequest } from "next/server";
import { getVisitRepository } from "@/core/repositories";
import { ensureSeeded, getSyncState } from "@/lib/melk-api/sync";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
// P6.5-04-i — دامنه فقط از helper مرکزی (تک‌نقطه تصمیم)
import { ownerLoginPath, personalScopeWhere, resolveEntityAccess } from "@/lib/access/scope";
import { witnessScopedRead } from "@/lib/audit";

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

    const limit = Math.min(Math.max(num(sp.get("limit")) ?? 200, 1), 5000);
    const offset = Math.max(num(sp.get("offset")) ?? 0, 0);

    // فهرست فیلترشده + شاخص‌ها — عین منطق where قبلی (buildVisitWhere)
    // P6.5-04-i — دامنه از helper مرکزی: مالک ⇒ صفر فیلتر؛ مشاور ⇒ فقط بازدیدهای خودش (ownerCode)
    const access = resolveEntityAccess(guard, "visit");
    const scopeWhere = personalScopeWhere(access);
    if (scopeWhere === null) {
      await witnessScopedRead(guard, "visit", 0, access.isOwnerRead, ownerLoginPath(guard));
      return Response.json({ ok: true, rows: [], total: 0, limit, offset, summary: { totalCount: 0, checkedCount: 0, distinctPropertyCodes: 0, distinctRequesters: 0 }, dataSource: { real: true, cached: syncState.lastSuccessAt !== null, lastSuccessAt: syncState.lastSuccessAt, lastSyncedAt: syncState.lastSyncedAt, liveError: seed.liveError ?? syncState.lastError, syncAttempts: syncState.attempts } });
    }
    const scopeInput =
      scopeWhere && ("ownerCode" in scopeWhere || "branchId" in scopeWhere)
        ? { ownerCode: (scopeWhere as { ownerCode?: string }).ownerCode, branchId: (scopeWhere as { branchId?: string }).branchId }
        : undefined;
    const { rows, total, summary } = await getVisitRepository().listWithSummary(
      {
        propertyCode: sp.get("propertyCode") ?? undefined,
        requester: sp.get("requester") ?? undefined,
        checker: sp.get("checker") ?? undefined,
        status: sp.get("status") ?? undefined,
        dateFrom: sp.get("dateFrom") ?? undefined,
        dateTo: sp.get("dateTo") ?? undefined,
      },
      limit,
      offset,
      scopeInput
    );
    await witnessScopedRead(guard, "visit", total, access.isOwnerRead, ownerLoginPath(guard));

    return Response.json({
      ok: true,
      rows,
      total,
      limit,
      offset,
      summary: {
        totalCount: summary.totalCount,
        checkedCount: summary.checkedCount,
        distinctPropertyCodes: summary.distinctPropertyCodes,
        distinctRequesters: summary.distinctRequesters,
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
