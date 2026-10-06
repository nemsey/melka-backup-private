/**
 * GET /api/crm/arm-catalog/requests — کاتالوگ تک‌صفحه‌ای درخواست‌های سامانه ARM
 * ------------------------------------------------------
 * کاشی «درخواست ملک تبریز» (P6.5-10 + P6521/M2 + P6530/گام ۲):
 *   ستون‌های ده‌گانهٔ فهرست عین دستور مالک:
 *     ردیف · کد درخواست · کارشناس · شعبه · متقاضی (نام + موبایل زیر نام) ·
 *     قیمت از...تا... (تومان) · مناطق · دسته‌بندی (خرید/پیش خرید/رهن و اجاره/
 *     مشارکت در ساخت) · وضعیت (شش‌حالته) · تاریخ ثبت
 *   فیلتر بر اساس «تمام ستون‌های فهرست» (بند ۲ دستور):
 *     code · realtorName · branch · customerName · priceFrom/priceTo ·
 *     areaName · tradeType (چندگانه) · states (شش‌حالته + سایر) · dateFrom/To
 *   بینش: توزیع وضعیت شش‌حالته (بند ۳)
 *   بروزرسانی (بند ۴): زنجیرهٔ عین سامانه ARM (لایه ۱ فهرست + لایه ۲ غنی‌سازی
 *   متقاضی/مناطق/قیمت/دسته‌بندی) + تاریخ و ساعت دقیق آخرین بروزرسانی + ادامه از
 *   آخرین صفحهٔ کامل (checkpoint) + گارد پوشش ۲۰٬۳۹۲ منبع (نکتهٔ بسیار مهم ۳)
 *
 * دامنه (P6.5-10): موجودیت arm-request تجمیعی است — مالک همه را بدون فیلتر
 * می‌بیند (شاهد owner.read).
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { requireTileAccessFor } from "@/lib/access/personnel-access";
import { ownerLoginPath, resolveEntityAccess } from "@/lib/access/scope";
import { witnessScopedRead } from "@/lib/audit";
import { getRequestRepository, getIntegrationRepository, getExpertRepository } from "@/core/repositories";
import { enrichArmRequests } from "@/lib/melk-api/arm-catalog";
import { execWithArmToken } from "@/lib/listing/crm-transfer";
// P6525 — قانون یکسان‌سازی ورودی: منبع یگانه (رفع باگ تاریخی ۴/۵ در این روت)
import { normalizeFilterInput } from "@/lib/normalize-input";
// P6527 — انتقال فشردهٔ فهرست سنگین (۲٫۸MB → ~۰٫۵MB) برای موبایل
import { compressedJson } from "@/lib/http/compressed-json";
// P6530/گام ۲ — وضعیت شش‌حالته + شعبه
import {
  parseRequestStateFilter,
  requestFilterIncludesOther,
  requestStateRawValues,
  rollupRequestStatusCounts,
  RequestStateKeyValues,
} from "@/lib/request-status";
import { resolveExpertBranch, TABRIZ_BRANCHES, BRANCH_UNSET } from "@/lib/branches";
import { readOwnerBranchMap, readPmBranchMap } from "@/lib/branch-store";

function num(v: string | null): number | undefined {
  if (v === null || v.trim() === "") return undefined;
  const norm = normalizeFilterInput(v); // ارقام فارسی/عربی → لاتین
  const n = Number(norm);
  return Number.isFinite(n) ? n : undefined;
}

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);
  // PN-008 BLOCK 7 (بند ۷.۴) — دسترسی کاشی («arm-requests») از PersonnelAccess
  const tileErr = await requireTileAccessFor(guard, "arm-requests");
  if (tileErr) return errorResponse(tileErr);

  try {
    const sp = request.nextUrl.searchParams;
    // P6525 — نرمال‌سازی مرکزی
    const code = normalizeFilterInput(sp.get("code")) || undefined;
    const realtorName = normalizeFilterInput(sp.get("realtorName")) || undefined;
    // P6530/گام ۲ — فیلترهای تمام ستون‌ها
    const customerName = normalizeFilterInput(sp.get("customerName")) || undefined;
    const areaName = normalizeFilterInput(sp.get("areaName")) || undefined;
    const priceFrom = num(sp.get("priceFrom"));
    const priceTo = num(sp.get("priceTo"));
    const tradeTypes = (sp.getAll("tradeType") || []).map((t) => normalizeFilterInput(t)).filter(Boolean);
    const dateFrom = sp.get("dateFrom") || undefined;
    const dateTo = sp.get("dateTo") || undefined;
    const branchFilter = normalizeFilterInput(sp.get("branch")) || undefined;
    // P6530/گام ۲ — فیلتر شش‌حالته + «سایر» (NOT IN):
    // «سایر» = نقیض پنج‌گانهٔ اصلی؛ فهرست مستثنی‌شده‌ها = پنج‌گانهٔ کامل منهای انتخاب‌شده‌ها
    const stateKeys = parseRequestStateFilter(sp.get("states"));
    const statuses = stateKeys.length > 0 ? requestStateRawValues(stateKeys) : undefined;
    const statusesIncludesOther = stateKeys.length > 0 ? requestFilterIncludesOther(stateKeys) : false;
    const allFiveRaws = requestStateRawValues(RequestStateKeyValues.filter((k) => k !== "other") as any);
    const statusesExcluded = statusesIncludesOther
      ? allFiveRaws.filter((v) => !(statuses ?? []).includes(v))
      : undefined;
    const limit = Math.min(Math.max(num(sp.get("limit")) ?? 25000, 1), 25000);
    // ===================== PN-002 گام ۲ — فیلتر ستون‌های تازه (تمام ستون‌ها) =====================
    const lineName = normalizeFilterInput(sp.get("lineName")) || undefined;
    const sanad = normalizeFilterInput(sp.get("sanad")) || undefined;
    const constructType = normalizeFilterInput(sp.get("constructType")) || undefined;
    const side = normalizeFilterInput(sp.get("side")) || undefined;
    const spaceFrom = num(sp.get("spaceFrom"));
    const spaceTo = num(sp.get("spaceTo"));
    const roomsFrom = num(sp.get("roomsFrom"));
    const roomsTo = num(sp.get("roomsTo"));
    const floorFrom = num(sp.get("floorFrom"));
    const floorTo = num(sp.get("floorTo"));
    const buildYearFrom = num(sp.get("buildYearFrom"));
    const buildYearTo = num(sp.get("buildYearTo"));
    const urgentOnly = sp.get("urgentOnly") === "1" || sp.get("urgentOnly") === "true";
    const luxuryOnly = sp.get("luxuryOnly") === "1" || sp.get("luxuryOnly") === "true";
    const occasionOnly = sp.get("occasionOnly") === "1" || sp.get("occasionOnly") === "true";
    const propertyTypes = (sp.getAll("propertyType") || []).map((t) => normalizeFilterInput(t)).filter(Boolean);
    const buildingTypes = (sp.getAll("buildingType") || []).map((t) => normalizeFilterInput(t)).filter(Boolean);

    const repo = getRequestRepository();

    // ---- غنی‌سازی هدفمند ردیف‌های جست‌وجو‌شده با کد (زنده، سقف ۵) ----
    if (code && guard.armTokens?.accessToken) {
      try {
        const targeted = await repo.listArmCatalog({ code }, 5);
        const incompleteIds = targeted.rows.filter((r) => !r.enrichedAt).slice(0, 5).map((r) => r.id);
        if (incompleteIds.length > 0) {
          await execWithArmToken(guard, (t) => enrichArmRequests(t, { maxRows: incompleteIds.length, rowIds: incompleteIds }));
        }
      } catch {
        /* بهترین-تلاش — فهرست بدون آن هم برگردانده می‌شود */
      }
    }

    const access = resolveEntityAccess(guard, "arm-request");
    const { rows, total } = await repo.listArmCatalog(
      {
        code, realtorName, customerName, areaName, priceFrom, priceTo, tradeTypes, statuses, statusesIncludesOther, statusesExcluded, dateFrom, dateTo,
        // PN-002 گام ۲ — ستون‌های تازه
        lineName, sanad, constructType, side,
        spaceFrom, spaceTo, roomsFrom, roomsTo, floorFrom, floorTo, buildYearFrom, buildYearTo,
        urgentOnly, luxuryOnly, occasionOnly,
        propertyTypes: propertyTypes.length > 0 ? propertyTypes : undefined,
        buildingTypes: buildingTypes.length > 0 ? buildingTypes : undefined,
      },
      limit
    );

    // ---- P6530/گام ۲ + P6547/گام دوم — شعبهٔ کارشناس هر ردیف (زنجیرهٔ تفکیک: PM ← مالک ← کسب‌وکار) ----
    const [ownerMap, experts, pmBranchMap] = await Promise.all([
      readOwnerBranchMap().catch(() => ({} as Record<string, string>)),
      getExpertRepository()
        .findAll()
        .catch(() => [] as Array<{ fullName: string; businessTitle: string | null }>),
      // P6547 — شعبهٔ واقعی از سامانهٔ PM (personnelInfo.branchId.title — منبع اصلی)
      readPmBranchMap().catch(() => ({} as Record<string, string>)),
    ]);
    const businessByExpert = new Map<string, string | null>();
    for (const e of experts) businessByExpert.set(e.fullName, e.businessTitle);
    const branchOf = (expertName: string | null): string =>
      expertName
        ? resolveExpertBranch(expertName, ownerMap, businessByExpert.get(expertName) ?? null, pmBranchMap).branch
        : BRANCH_UNSET;

    const rowsWithBranch = rows.map((r) => ({ ...r, branch: branchOf(r.actorName) }));
    const filtered = branchFilter
      ? rowsWithBranch.filter((r) => (branchFilter === "unset" ? r.branch === BRANCH_UNSET : r.branch === branchFilter))
      : rowsWithBranch;

    await witnessScopedRead(guard, "arm-request", total, access.isOwnerRead, ownerLoginPath(guard));

    const counts = await repo.countArmEnrichment();
    // P6530/گام ۲ (بند ۳) — بینش توزیع شش‌حالته از کل کاتالوگ
    const breakdown = await repo.statusBreakdownArm();
    const statusCounts = rollupRequestStatusCounts(breakdown.map((b) => [b.status, b.count] as [string | null, number]));

    // ---- P6530/گام ۲ (نکتهٔ بسیار مهم ۳ + بند ۴.۲) — وضعیت بروزرسانی و پوشش منبع ----
    const checkpoint = await getIntegrationRepository()
      .getSyncCheckpoint("requests")
      .catch(() => null);

    return await compressedJson(
      {
        ok: true,
        rows: filtered,
        total: filtered.length,
        limit,
        enrichment: counts,
        statusCounts,
        branches: {
          registry: TABRIZ_BRANCHES,
          filter: branchFilter ?? null,
          resolvedCount: filtered.filter((r) => r.branch !== BRANCH_UNSET).length,
        },
        lastUpdate: checkpoint
          ? {
              phase: checkpoint.phase,
              lastCompletedPage: checkpoint.lastCompletedPage,
              totalPages: checkpoint.totalPages,
              totalAtSource: checkpoint.totalAtSource,
              updatedAt: checkpoint.updatedAt,
              completedAt: checkpoint.completedAt,
            }
          : null,
        dataSource: {
          system: "سامانه مدیریت آگهی و درخواست ملک تبریز (ARM)",
          layer1: "فهرست کامل درخواست‌ها — کد، عنوان، کارشناس، وضعیت، تاریخ ثبت",
          layer2: `متقاضی و تماس او + مناطق + قیمت از/تا + دسته‌بندی — ${counts.complete} از ${counts.total} تکمیل شده`,
        },
      },
      request.headers.get("accept-encoding")
    );
  } catch (err) {
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در خواندن کاتالوگ درخواست‌های ملک تبریز.", 500, false));
  }
}
