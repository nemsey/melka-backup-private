/**
 * GET /api/crm/experts
 * فهرست کارشناسان و کارکنان — P6530/گام ۴ (دستور مالک ۱۴۰۵/۰۷/۹)
 * ------------------------------------------------------
 * ستون‌های هشت‌گانهٔ فهرست عین دستور:
 *   ردیف · کارشناس (نام + موبایل زیر نام) · کد پرسنلی · شعبه ·
 *   مبایعه نامه (مبایعه‌نامه + پیش‌فروش — نکته ۳) ·
 *   اجاره نامه (اجاره + تمدید اجاره — نکته ۴) ·
 *   آدرس کارشناس · وضعیت (فعال/غیرفعال — نکته ۵)
 * فیلتر بر اساس تمام ستون‌ها (بند ۲): کارشناس (نام/موبایل) · کد پرسنلی ·
 *   شعبه (چهار شعبهٔ ملک تبریز + تعیین‌نشده) · مبایعه‌نامه از/تا ·
 *   اجاره‌نامه از/تا · آدرس · وضعیت
 *
 * P6.5-12 (حفظ‌شده): کد پرسنلی PM + موبایل ARM + شمارش معاملات خانواده‌ای
 * شعبه: زنجیرهٔ تفکیک src/lib/branches.ts (نقشهٔ مالک → businessId سامانه → تعیین‌نشده)
 * شاهد مالی کل کسب‌وکار (بند ۶ گام ۴): حذف از پاسخ — دیگر سرو نمی‌شود
 */

import { NextRequest } from "next/server";
import { getExpertRepository } from "@/core/repositories";
import { ensureSeeded, getSyncState } from "@/lib/melk-api/sync";
import { MelkApiError } from "@/lib/melk-api/types";
import { enrichExpertRows } from "@/lib/melk-api/expert-enrichment";
// P6530/گام ۴ — شعبه: زنجیرهٔ تفکیک چهار شعبهٔ ملک تبریز
import { resolveExpertBranch, TABRIZ_BRANCHES, BRANCH_UNSET } from "@/lib/branches";
import { readOwnerBranchMap, readPmBranchMap } from "@/lib/branch-store";
import { normalizeFilterInput } from "@/lib/normalize-input";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
// P6.5-04-i — دامنه فقط از helper مرکزی (تک‌نقطه تصمیم)
import { ownerLoginPath, resolveEntityAccess } from "@/lib/access/scope";
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

    const fullName = sp.get("fullName") ?? undefined;
    const mobile = sp.get("mobile") ?? undefined;
    const personnelCode = sp.get("personnelCode") ?? undefined;
    const businessTitle = sp.get("businessTitle") ?? undefined;
    const creator = sp.get("creator") ?? undefined;
    const activeRaw = sp.get("active");
    const active = activeRaw === "true" || activeRaw === "false" ? activeRaw === "true" : undefined;
    // P6530/گام ۴ (بند ۲) — فیلترهای تمام ستون‌ها
    const branchFilter = normalizeFilterInput(sp.get("branch")) || undefined;
    const addressFilter = normalizeFilterInput(sp.get("address")) || undefined;
    const saleFrom = num(sp.get("saleFrom"));
    const saleTo = num(sp.get("saleTo"));
    const rentFrom = num(sp.get("rentFrom"));
    const rentTo = num(sp.get("rentTo"));

    // P6.5-09 — سقف تک‌صفحه‌ای: تا ۵۰۰۰ کارشناس (فهرست بدون صفحه‌بندی)
    const limit = Math.min(Math.max(num(sp.get("limit")) ?? 50, 1), 5000);
    const offset = Math.max(num(sp.get("offset")) ?? 0, 0);

    // P6.5-04-i — کارشناس دادهٔ مرجع سراسری است (ماتریس §۵.۳): همه می‌بینند؛
    // مالک با شاهد owner.read — صفر فیلتر (رفتار v1 حفظ)
    const access = resolveEntityAccess(guard, "expert");

    // فهرست + مجموع تعاملات هر مشاور — عین groupBy دوتایی روت قبلی
    const { rows, total } = await getExpertRepository().listWithInteractions({
      filter: { fullName, mobile, personnelCode, businessTitle, creator, active },
      sortDir: sp.get("sortDir") === "desc" ? "desc" : "asc",
      limit,
      offset,
    });

    // ---- P6.5-12: غنی‌سازی بین‌سامانه‌ای (کد پرسنلی PM + شمارش معاملات خانواده‌ای) ----
    const enriched = await enrichExpertRows(rows, guard.armTokens?.accessToken ?? null);

    // ---- P6530/گام ۴ + P6547/گام چهارم-۱ — شعبهٔ هر کارشناس (زنجیرهٔ تفکیک: PM ← مالک ← کسب‌وکار) + آدرس ----
    const [ownerMap, pmBranchMap] = await Promise.all([
      readOwnerBranchMap().catch(() => ({} as Record<string, string>)),
      // P6547 — شعبهٔ واقعی از سامانهٔ PM (personnelInfo.branchId.title — منبع اصلی)
      readPmBranchMap().catch(() => ({} as Record<string, string>)),
    ]);
    const rowsWithBranch = enriched.rows.map((r) => ({
      ...r,
      branch: resolveExpertBranch(r.fullName, ownerMap, r.businessTitle, pmBranchMap).branch,
      // P6549 — آدرس کارشناس از سامانهٔ PM (realtors/info/contactInfo → contactInfo.address؛
      // کشف زندهٔ ۱۴۰۵/۰۷/۱۲ — backfill p6549). رکوردهای بدون پرسنل PM → «-» صادقانه.
      address: (r.address as string | null) ?? null,
    }));

    // ---- P6530/گام ۴ (بند ۲) — فیلترهای لایهٔ شعبه/شمارش/آدرس ----
    const filtered = rowsWithBranch.filter((r) => {
      if (branchFilter) {
        if (branchFilter === "unset") {
          if (r.branch !== BRANCH_UNSET) return false;
        } else if (r.branch !== branchFilter) return false;
      }
      if (addressFilter && !(r.address ?? "").includes(addressFilter)) return false;
      if (saleFrom !== undefined && r.saleCount < saleFrom) return false;
      if (saleTo !== undefined && r.saleCount > saleTo) return false;
      if (rentFrom !== undefined && r.rentCount < rentFrom) return false;
      if (rentTo !== undefined && r.rentCount > rentTo) return false;
      return true;
    });

    await witnessScopedRead(guard, "expert", total, access.isOwnerRead, ownerLoginPath(guard));

    return Response.json({
      ok: true,
      rows: filtered,
      total: filtered.length,
      limit,
      offset,
      // P6530/گام ۴ — رجیستری شعب برای فیلتر UI
      branches: {
        registry: TABRIZ_BRANCHES,
        filter: branchFilter ?? null,
        resolvedCount: filtered.filter((r) => r.branch !== BRANCH_UNSET).length,
      },
      // شفافیت منبع داده برای UI
      dataSource: {
        real: true,
        cached: syncState.lastSuccessAt !== null,
        lastSuccessAt: syncState.lastSuccessAt,
        lastSyncedAt: syncState.lastSyncedAt,
        liveError: seed.liveError ?? syncState.lastError,
        syncAttempts: syncState.attempts,
      },
      // P6530/گام ۴ (بند ۴.۲) — تاریخ و ساعت دقیق آخرین بروزرسانی
      lastUpdate: {
        lastSuccessAt: syncState.lastSuccessAt,
        lastSyncedAt: syncState.lastSyncedAt,
        attempts: syncState.attempts,
      },
    });
  } catch (err) {
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در استخراج کارشناسان.", 500, false));
  }
}
