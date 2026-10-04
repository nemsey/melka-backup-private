/**
 * GET /api/crm/arm-catalog/listings — کاتالوگ تک‌صفحه‌ای آگهی‌های سامانه ARM
 * ------------------------------------------------------
 * کاشی «آگهی ملک تبریز» (P6.5-10 + P6521/M1 + P6530/گام ۱):
 *   ستون‌های ده‌گانهٔ فهرست عین دستور مالک:
 *     ردیف · کد آگهی · کارشناس · شعبه · مالک (نام + موبایل زیر نام) ·
 *     قیمت ملک (تومان) · آدرس ملک (منطقه، کوی، پلاک) · دسته‌بندی ·
 *     وضعیت (ده‌حالته) · آخرین فعالیت
 *   فیلتر بر اساس «تمام ستون‌های فهرست» (بند ۲ دستور):
 *     code · realtorName · branch · ownerName · priceFrom/priceTo ·
 *     address · tradeType (چندگانه) · states (ده‌حالته) · activityFrom/To
 *   بینش: توزیع وضعیت ده‌حالته + سایر (بند ۳ دستور)
 *   بروزرسانی (بند ۴): خواندن checkpoint «listings» → تاریخ/ساعت دقیق آخرین
 *   بروزرسانی + نقطهٔ ادامه (remainingPages) برای «شروع از جایی که قطع شد»
 *
 * شعبه (نکته ۲ + P6547/گام یک-۵): زنجیرهٔ تفکیک src/lib/branches.ts —
 *   شعبهٔ PM (personnelInfo.branchId.title — منبع اصلی) → نقشهٔ مالک →
 *   businessId.title سامانه → «تعیین نشده»
 *
 * غنی‌سازی هدفمند: اگر فیلتر کدآگهی داده شده باشد و ردیف‌های یافته هنوز
 * لایه ۲ را نداشته باشند، همان ردیف‌ها زنده غنی می‌شوند (سقف ۵).
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { ownerLoginPath, resolveEntityAccess } from "@/lib/access/scope";
import { witnessScopedRead } from "@/lib/audit";
import { getPropertyRecordRepository, getIntegrationRepository, getExpertRepository } from "@/core/repositories";
import { enrichArmListings } from "@/lib/melk-api/arm-catalog";
import { execWithArmToken } from "@/lib/listing/crm-transfer";
import { listingStateRawValues, parseListingStateFilter, rollupStatusCounts } from "@/lib/listing-status";
// P6525 — قانون یکسان‌سازی ورودی: منبع یگانه (رفع باگ تاریخی ۴/۵ در این روت)
import { normalizeFilterInput } from "@/lib/normalize-input";
// P6527 — انتقال فشردهٔ فهرست سنگین (۵٫۹MB → ~۱MB) برای موبایل
import { compressedJson } from "@/lib/http/compressed-json";
// P6530/گام ۱ — شعبه: زنجیرهٔ تفکیک چهار شعبهٔ ملک تبریز
import { resolveExpertBranch, TABRIZ_BRANCHES, BRANCH_UNSET } from "@/lib/branches";
import { readOwnerBranchMap, readPmBranchMap } from "@/lib/branch-store";

function num(v: string | null): number | undefined {
  if (v === null || v.trim() === "") return undefined;
  // ارقام فارسی/عربی → لاتین (قانون یکسان‌سازی ورودی قیمت)
  const norm = normalizeFilterInput(v);
  const n = Number(norm);
  return Number.isFinite(n) ? n : undefined;
}

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  try {
    const sp = request.nextUrl.searchParams;
    // P6525 — نرمال‌سازی مرکزی: ارقام فارسی/عربی/لاتین + حروف ي/ك — نتیجه همیشه یکسان
    const code = normalizeFilterInput(sp.get("code")) || undefined;
    const realtorName = normalizeFilterInput(sp.get("realtorName")) || undefined;
    // P6530/گام ۱ — فیلترهای تمام ستون‌ها
    const ownerName = normalizeFilterInput(sp.get("ownerName")) || undefined;
    const address = normalizeFilterInput(sp.get("address")) || undefined;
    const priceFrom = num(sp.get("priceFrom"));
    const priceTo = num(sp.get("priceTo"));
    const tradeTypes = (sp.getAll("tradeType") || [])
      .map((t) => normalizeFilterInput(t))
      .filter(Boolean);
    const activityFrom = sp.get("activityFrom") || undefined;
    const activityTo = sp.get("activityTo") || undefined;
    const branchFilter = normalizeFilterInput(sp.get("branch")) || undefined;
    // P6521/M1 + P6530 — فیلتر ده‌حالتهٔ چندانتخابی: کلیدهای canonical → مقادیر خام قانون‌مند
    const stateKeys = parseListingStateFilter(sp.get("states"));
    const statuses = stateKeys.length > 0 ? listingStateRawValues(stateKeys) : undefined;
    // P6.5-10 — تک‌صفحه‌ای و بی‌نهایت: سقف سرور ۲۵٬۰۰۰ ردیف (کل کاتالوگ منبع ۱۱٬۴۵۶)
    const limit = Math.min(Math.max(num(sp.get("limit")) ?? 25000, 1), 25000);

    const repo = getPropertyRecordRepository();

    // ---- غنی‌سازی هدفمند ردیف‌های جست‌وجو‌شده با کد (زنده، سقف ۵) ----
    if (code && guard.armTokens?.accessToken) {
      try {
        const targeted = await repo.listArmCatalog({ code }, 5);
        const incompleteIds = targeted.rows.filter((r) => !r.enrichedAt).slice(0, 5).map((r) => r.id);
        if (incompleteIds.length > 0) {
          await execWithArmToken(guard, (t) => enrichArmListings(t, { maxRows: incompleteIds.length, rowIds: incompleteIds }));
        }
      } catch {
        /* غنی‌سازی هدفمند بهترین-تلاش است — فهرست بدون آن هم برگردانده می‌شود */
      }
    }

    // P6.5-04-i — دامنه فقط از helper مرکزی (تجمیعی §۵.۳؛ مالک ⇒ شاهد owner.read)
    const access = resolveEntityAccess(guard, "property");
    const { rows, total } = await repo.listArmCatalog(
      { code, realtorName, ownerName, priceFrom, priceTo, address, tradeTypes, statuses, activityFrom, activityTo },
      limit
    );

    // ---- P6530/گام ۱ + P6547/گام یک-۵ — شعبهٔ کارشناس هر ردیف (زنجیرهٔ تفکیک: PM ← مالک ← کسب‌وکار) ----
    const [ownerMap, experts, pmBranchMap] = await Promise.all([
      readOwnerBranchMap().catch(() => ({} as Record<string, string>)),
      getExpertRepository()
        .findAll()
        .catch(() => [] as Array<{ fullName: string; businessTitle: string | null }>),
      // P6547 — شعبهٔ واقعی از سامانهٔ PM (branchId.title از personnelInfo)
      readPmBranchMap().catch(() => ({} as Record<string, string>)),
    ]);
    const businessByExpert = new Map<string, string | null>();
    for (const e of experts) businessByExpert.set(e.fullName, e.businessTitle);
    const branchOf = (expertName: string | null): string =>
      expertName
        ? resolveExpertBranch(expertName, ownerMap, businessByExpert.get(expertName) ?? null, pmBranchMap).branch
        : BRANCH_UNSET;

    // فیلتر شعبه (نکته ۲) — بعد از تفکیک، روی ستون شعبه
    const rowsWithBranch = rows.map((r) => ({ ...r, branch: branchOf(r.realtorName) }));
    const filtered = branchFilter
      ? rowsWithBranch.filter((r) => {
          if (branchFilter === "unset") return r.branch === BRANCH_UNSET;
          return r.branch === branchFilter;
        })
      : rowsWithBranch;

    await witnessScopedRead(guard, "property", total, access.isOwnerRead, ownerLoginPath(guard));

    const counts = await repo.countEnrichment();
    // P6530/گام ۱ — بینش توزیع ده‌حالته (بند ۳ — همیشه از کل کاتالوگ، مستقل از فیلتر فعال)
    const breakdown = await repo.statusBreakdown();
    const statusCounts = rollupStatusCounts(breakdown.map((b) => [b.status, b.count] as [string | null, number]));

    // ---- P6530/گام ۱ — وضعیت بروزرسانی (بند ۴.۲: تاریخ/ساعت دقیق آخرین بروزرسانی + نقطهٔ ادامه) ----
    const checkpoint = await getIntegrationRepository()
      .getSyncCheckpoint("listings")
      .catch(() => null);

    // P6527 — فشردهٔ gzip وقتی کلاینت می‌پذیرد (بدون آن عین Response.json)
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
          // P6547 — تعداد شعبه‌های تفکیک‌شده از سامانهٔ PM (منبع اصلی)
          pmResolvedCount: filtered.filter((r) => Boolean(pmBranchMap[(r as { realtorName: string | null }).realtorName ?? ""])).length,
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
          layer1: "فهرست کامل آگهی‌ها — کد، عنوان، کارشناس، وضعیت، قیمت، دسته‌بندی، موقعیت",
          layer2: `مالک و آدرس دقیق (منطقه، کوی، پلاک) — ${counts.complete} از ${counts.total} تکمیل شده`,
        },
      },
      request.headers.get("accept-encoding")
    );
  } catch (err) {
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در خواندن کاتالوگ آگهی‌های ملک تبریز.", 500, false));
  }
}
