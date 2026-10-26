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
import { tenantDbValue } from "@/lib/tenants";
import { requireTileAccessFor } from "@/lib/access/personnel-access";
import { ownerLoginPath, resolveEntityAccess, catalogUserScope } from "@/lib/access/scope";
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

// PN-027 · ۵-پ-۴ — کش ۵ دقیقه‌ای غنی‌سازی هدفمند جست‌وجوی کد (جلسهٔ ۰۳۴)
const ENRICH_CACHE_TTL_MS = 5 * 60 * 1000;
const enrichDoneAt = new Map<string, number>();
function enrichedRecently(code: string): boolean {
  const at = enrichDoneAt.get(code);
  if (at === undefined) return false;
  if (Date.now() - at > ENRICH_CACHE_TTL_MS) {
    enrichDoneAt.delete(code);
    return false;
  }
  return true;
}
function markEnriched(code: string): void {
  if (enrichDoneAt.size > 200) {
    // هرس ساده: قدیمی‌ترین نیمی که منقضی شده‌اند حذف می‌شوند
    const now = Date.now();
    for (const [k, at] of enrichDoneAt) if (now - at > ENRICH_CACHE_TTL_MS) enrichDoneAt.delete(k);
  }
  enrichDoneAt.set(code, Date.now());
}

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
  // PN-008 BLOCK 7 (بند ۷.۴) — دسترسی کاشی («arm-listings») از PersonnelAccess
  const tileErr = await requireTileAccessFor(guard, "arm-listings");
  if (tileErr) return errorResponse(tileErr);

  try {
    const sp = request.nextUrl.searchParams;
    // PN-044/فاز ۴ (شورا-ن۰۸۸) — tenant همین رندر: 'melketun' → دادهٔ ملکتون؛
    // پیش‌فرض/هر چیز دیگر → 'melk-tabriz' (رفتار فعلی — صفر شکستن).
    const tenantId = tenantDbValue(sp.get("tenantId"));
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
    // PN-011 ثالثاً — شعبه چندانتخابی (چیپ): branch تکرارشونده؛ سازگار با branch تک‌مقداری قبلی
    const branchFilters = (sp.getAll("branch") || [])
      .map((b) => normalizeFilterInput(b))
      .filter(Boolean);
    const branchFilter = branchFilters.length > 0 ? branchFilters[0] : normalizeFilterInput(sp.get("branch")) || undefined;
    const branchFilterSet = branchFilters.length > 0 ? new Set(branchFilters) : null;
    // P6521/M1 + P6530 — فیلتر ده‌حالتهٔ چندانتخابی: کلیدهای canonical → مقادیر خام قانون‌مند
    const stateKeys = parseListingStateFilter(sp.get("states"));
    const statuses = stateKeys.length > 0 ? listingStateRawValues(stateKeys) : undefined;
    // P6.5-10 — تک‌صفحه‌ای و بی‌نهایت: سقف سرور ۲۵٬۰۰۰ ردیف (کل کاتالوگ منبع ۱۱٬۴۵۶)
    const limit = Math.min(Math.max(num(sp.get("limit")) ?? 25000, 1), 25000);
    // ===================== PN-002 گام ۱ — فیلتر ستون‌های تازه (تمام ستون‌ها) =====================
    const rentalType = sp.get("rentalType") === "rental" ? "rental" : sp.get("rentalType") === "sale" ? "sale" : undefined;
    const viewCountFrom = num(sp.get("viewCountFrom"));
    const viewCountTo = num(sp.get("viewCountTo"));
    const meterageFrom = num(sp.get("meterageFrom"));
    const meterageTo = num(sp.get("meterageTo"));
    const roomsFrom = num(sp.get("roomsFrom"));
    const roomsTo = num(sp.get("roomsTo"));
    const addedToDivar = sp.get("addedToDivar") === "1" ? true : sp.get("addedToDivar") === "0" ? false : undefined;
    const addedToInsta = sp.get("addedToInsta") === "1" ? true : sp.get("addedToInsta") === "0" ? false : undefined;
    const lineName = normalizeFilterInput(sp.get("lineName")) || undefined;
    const stateName = normalizeFilterInput(sp.get("stateName")) || undefined;
    const propertyTypes = (sp.getAll("propertyType") || []).map((t) => normalizeFilterInput(t)).filter(Boolean);

    const repo = getPropertyRecordRepository();

    // ---- غنی‌سازی هدفمند ردیف‌های جست‌وجو‌شده با کد (زنده، سقف ۵) ----
    // PN-027 · ۵-پ-۴ (جلسهٔ ۰۳۴): پیش‌فرض خاموش — فقط با enrich=1 صریح.
    // کش ۵ دقیقه‌ای: همان کد در پنجرهٔ کش دوباره شبکه نمی‌زند (حذف enrichment اضافی).
    // پس‌زمینه: daemon کاتالوگ هر چرخه غنی‌سازی می‌کند — تازگی داده بدون هزینهٔ جست‌وجو.
    // غنی‌سازی هدفمند فقط برای tenant تبریز معنا دارد (زنجیرهٔ ARM) — ملکتون بی‌رابطه است
    const enrichExplicit = sp.get("enrich") === "1" && tenantId === "melk-tabriz";
    if (enrichExplicit && code && guard.armTokens?.accessToken && !enrichedRecently(code)) {
      try {
        const targeted = await repo.listArmCatalog({ code }, 5);
        const incompleteIds = targeted.rows.filter((r) => !r.enrichedAt).slice(0, 5).map((r) => r.id);
        if (incompleteIds.length > 0) {
          await execWithArmToken(guard, (t) => enrichArmListings(t, { maxRows: incompleteIds.length, rowIds: incompleteIds }));
        }
        markEnriched(code);
      } catch {
        /* غنی‌سازی هدفمند بهترین-تلاش است — فهرست بدون آن هم برگردانده می‌شود */
      }
    }

    // P6.5-04-i — دامنه فقط از helper مرکزی (تجمیعی §۵.۳؛ مالک ⇒ شاهد owner.read)
    const access = resolveEntityAccess(guard, "property");
    // PN-049/گام ۲-الف — قانون حساب کاربری: مالک همه؛ کاربر فقط رکوردهای خودش
    const catalogScope = catalogUserScope(guard);
    const { rows, total } = await repo.listArmCatalog(
      {
        tenantId,
        code, realtorName, ownerName, priceFrom, priceTo, address, tradeTypes, statuses, activityFrom, activityTo,
        // PN-002 گام ۱ — ستون‌های تازه
        rentalType, viewCountFrom, viewCountTo, meterageFrom, meterageTo, roomsFrom, roomsTo,
        addedToDivar, addedToInsta, lineName, stateName,
        propertyTypes: propertyTypes.length > 0 ? propertyTypes : undefined,
        // PN-049 — دامنهٔ حساب کاربری (مالک: undefined = صفر فیلتر)
        registrarNameNorm: catalogScope.kind === "OWN" ? catalogScope.nameNorm : undefined,
      },
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
    // PN-011 ثالثاً — چندانتخابی: عضویت در مجموعهٔ شعبه‌های انتخاب‌شده (unset = تعیین‌نشده)
    const rowsWithBranch = rows.map((r) => ({ ...r, branch: branchOf(r.realtorName) }));
    const filtered = branchFilterSet
      ? rowsWithBranch.filter((r) =>
          branchFilterSet.has("unset") && r.branch === BRANCH_UNSET
            ? true
            : branchFilterSet.has(r.branch)
        )
      : branchFilter
        ? rowsWithBranch.filter((r) => {
            if (branchFilter === "unset") return r.branch === BRANCH_UNSET;
            return r.branch === branchFilter;
          })
        : rowsWithBranch;

    await witnessScopedRead(guard, "property", total, access.isOwnerRead, ownerLoginPath(guard));

    // PN-046/گام اول-۱ — تجمع‌ها tenant-scoped: بینش وضعیت/غنی‌سازی هر داشبورد از دادهٔ خودش
    const counts = await repo.countEnrichment(tenantId);
    // P6530/گام ۱ — بینش توزیع ده‌حالته (بند ۳ — همیشه از کل کاتالوگ، مستقل از فیلتر فعال)
    const breakdown = await repo.statusBreakdown(tenantId);
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
