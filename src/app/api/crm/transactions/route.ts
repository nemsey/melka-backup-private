/**
 * GET /api/crm/transactions
 * فهرست معاملات (گزارش تطابق) با فیلترهای واقعی — خوانده‌شده از کش محلی
 * که «فقط» با داده واقعی استخراج‌شده از arus-api.melketabriz.ir پر می‌شود.
 * اگر کش خالی باشد و نشست دارای توکن ARM باشد، همگام‌سازی زنده انجام می‌شود.
 * فیلترها (عین خود سامانه + توسعه داشبورد):
 *   بازه تاریخ (جلالی در UI → ISO)، کد ملک، کد درخواست، شماره هولوگرام،
 *   نوع تطبیق (رویداد / آگهی پیشنهادی / هر دو)
 * P6530/گام ۳ (بند ۲ — فیلتر تمام ستون‌ها):
 *   فروشنده (نام/موبایل) · خریدار (نام/موبایل) · قیمت قرارداد از/تا ·
 *   فایل قرارداد (دارد/ندارد) — روی لایهٔ غنی‌سازی
 *
 * P6.5-11 (بند پ-۵) — ستون‌های جدید فهرست معاملات کاشی ادغامی
 * «معاملات و قراردادهای ملک تبریز»:
 *   بعد از کد ملک: نام+موبایل مالک · بعد از کد درخواست: نام+موبایل درخواست‌دهنده
 *   + ستون «متن قرارداد» + ستون «تجمیع حق‌السهم مشاوران»
 * P6.5-15 (ملکا-شورا-۱۴۰۵-۰۱۸) — پروندهٔ نهایی کاشی M3:
 *   · BLOCK F — رفع باگ فیلترها با تشخیص filter-bug-diagnosis.md:
 *       F1: نرمال‌سازی ارقام فارسی/عربی → لاتین در همهٔ فیلترهای کدی
 *       F2: نوع قرارداد چندگانه بر پایهٔ classifyContract (مقدار ناشناخته ⇒ 400، نه بی‌اثر)
 *       F3: تطبیق نام کارشناس روی فهرست کامل سهم‌ها (نه خلاصهٔ ۶تایی)
 *       F5: مرز بازهٔ تاریخ به وقت تهران (+03:30)
 *   · BLOCK D — contractType چندگانه: ?contractType=مبایعه‌نامه&contractType=پیش‌فروش · ?contractType=none
 *   · expertCode نام مستعار personnelCode است (پارامتر جلسه ۰۱۸)
 */

import { NextRequest } from "next/server";
import { getContractRepository, getExpertRepository, getPropertyRecordRepository, getRequestRepository, getTransactionRepository } from "@/core/repositories";
import { ensureSeeded, getSyncState } from "@/lib/melk-api/sync";
import { MelkApiError } from "@/lib/melk-api/types";
import { enrichTransactionRows, type ContractLookup, type AgencyLookup } from "@/lib/melk-api/tx-enrichment";
import { findExpertNameByPersonnelCode } from "@/lib/experts/profile-store";
// P6547/گام سوم-۴ — شعبهٔ مشاوران از سامانهٔ PM برای ستون تجمیع حق‌السهم
import { readPmBranchMap } from "@/lib/branch-store";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
// P6.5-04-i — دامنه فقط از helper مرکزی (تک‌نقطه تصمیم)
import { ownerLoginPath, resolveEntityAccess } from "@/lib/access/scope";
import { witnessScopedRead } from "@/lib/audit";
// P6.5-15 — قانون انواع معاملات ملکا + نرمال‌سازی ورودی فیلترها
import { classifyContract, normalizeFilterText, type ContractKind } from "@/lib/contract-classify";
// P6525 — قانون یکسان‌سازی ورودی: منبع یگانهٔ نگاشت ارقام/حروف
import { normalizeFilterInput } from "@/lib/normalize-input";
// P6527 — انتقال فشردهٔ فهرست سنگین برای موبایل
import { compressedJson } from "@/lib/http/compressed-json";

function num(v: string | null): number | undefined {
  if (v === null || v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** پارس فیلتر نوع قرارداد چندگانه (D.۱) — ۴ kind + none؛ مقدار ناشناخته ⇒ خطای 400 شفاف (رفع F2) */
function parseContractTypeFilter(values: string[]): { kinds: Set<ContractKind>; includeNone: boolean } | { error: string } {
  const kinds = new Set<ContractKind>();
  let includeNone = false;
  for (const raw of values) {
    const v = normalizeFilterText(raw);
    if (!v) continue;
    if (v === "none" || v === "بدون قرارداد" || v === "نامشخص") {
      includeNone = true;
      continue;
    }
    const { kind } = classifyContract(v);
    if (kind === "ثبت‌نشده") {
      return { error: `نوع قرارداد «${raw}» شناخته نشد. مقادیر مجاز: مبایعه‌نامه، پیش‌فروش، اجاره، تمدید اجاره، none (بدون قرارداد).` };
    }
    kinds.add(kind);
  }
  return { kinds, includeNone };
}

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  try {
    // تلاش برای استخراج زنده در صورت خالی‌بودن کش (فقط داده واقعی)
    const seed = await ensureSeeded(guard.armTokens?.accessToken);
    const syncState = await getSyncState();
    const sp = request.nextUrl.searchParams;

    // P6525 — قانون فهرست: تمام ردیف‌ها بدون محدودیت؛ سقف ۲۵٬۰۰۰ فقط گارد ایمنی سرور است (عین دو کاتالوگ ARM)
    const limit = Math.min(Math.max(num(sp.get("limit")) ?? 25000, 1), 25000);
    const offset = Math.max(num(sp.get("offset")) ?? 0, 0);
    const sortBy = (sp.get("sortBy") ?? "contractDate") as "contractDate" | "eventsCount" | "suggestedPropertyCount";
    const sortDir: "asc" | "desc" = sp.get("sortDir") === "asc" ? "asc" : "desc";

    // P6.5-04-i — معامله تجمیعی است (ماتریس §۵.۳): همهٔ دامنه‌ها همهٔ ردیف‌ها؛
    // مالک با شاهد owner.read — صفر فیلتر برای همه (رفتار v1 حفظ)
    const access = resolveEntityAccess(guard, "transaction");

    // P6.5-15 (BLOCK F — رفع F1) — نرمال‌سازی ورودی فیلترهای کدی/متنی: ارقام فارسی → لاتین + نیم‌فاصله → فاصله
    const propertyCode = normalizeFilterText(sp.get("propertyCode")) || undefined;
    const requestCode = normalizeFilterText(sp.get("requestCode")) || undefined;
    const contractHolo = normalizeFilterText(sp.get("contractHolo")) || undefined;
    const expertName = normalizeFilterText(sp.get("expertName")) || undefined;
    // expertCode — نام مستعار جلسه ۰۱۸ برای همان فیلتر کد پرسنلی
    const personnelCode = normalizeFilterText(sp.get("personnelCode") ?? sp.get("expertCode")) || undefined;

    // فیلتر + خلاصه چهارگانه از انبار — عین منطق where قبلی (buildTransactionWhere)
    const { rows, total, summary } = await getTransactionRepository().listWithSummary({
      filter: {
        dateFrom: sp.get("dateFrom") ?? undefined,
        dateTo: sp.get("dateTo") ?? undefined,
        propertyCode,
        requestCode,
        contractHolo,
        matchKind: (sp.get("matchKind") as "event" | "suggested" | "both" | null) ?? undefined,
      },
      sortBy,
      sortDir,
      limit,
      offset,
    });

    // ---- P6.5-11 (بند پ-۵): غنی‌سازی تحلیلی ستون‌های جدید (فقط خواندن) ----
    // P6.5-14 (BLOCK C — ملکا-شورا-۱۴۰۵-۰۱۷) — غنی‌سازی معامله‌محور trade-overviews/info
    const txInfo = await getTransactionRepository().findInfoEnrichmentsByTxIds(rows.map((r) => r.id));
    const propertyCodes = [...new Set(rows.map((r) => r.propertyCode).filter(Boolean))];
    const requestCodes = [...new Set(rows.map((r) => r.requestCode).filter((c): c is string => Boolean(c)))];
    const [owners, requesters, contractRows, agencyRows] = await Promise.all([
      getPropertyRecordRepository().findOwnerContactsByCodes(propertyCodes),
      getRequestRepository().findArmRequesterContactsByCodes(requestCodes),
      getContractRepository().findAll(),
      // P6.5-12 — کارگزاری‌های مرتبط (فایل قرارداد — بند ت)
      getContractRepository().listAgencyLookups(),
    ]);
    const contracts: ContractLookup[] = contractRows.map((c) => ({
      contractHolo: c.contractHolo,
      propertyCode: c.propertyCode,
      requestCode: c.requestCode,
      contractType: c.contractType,
      contractDate: c.contractDate,
      documentDate: c.documentDate,
      deliveryDate: c.deliveryDate,
      propertyTitle: c.propertyTitle,
      propertyAddress: c.propertyAddress,
      buyerListJson: c.buyerListJson,
      sellerListJson: c.sellerListJson,
      realtorListJson: c.realtorListJson,
      status: c.status,
      // P6.5-12 — مبالغ مالی
      contractPrice: c.contractPrice,
      rawContractPrice: c.rawContractPrice,
      comisionOfContract: c.comisionOfContract,
      taxOfContract: c.taxOfContract,
    }));
    const agencies: AgencyLookup[] = agencyRows.map((a) => ({
      id: a.id,
      propertyCode: a.propertyCode,
      propertyId: a.propertyId,
      realtorName: a.realtorName,
      creatorName: a.creatorName,
      payPercent: a.payPercent,
      sellPrice: a.sellPrice,
      detailsJson: a.detailsJson,
      createdAt: a.createdAt,
    }));
    let enrichedRows = enrichTransactionRows(rows, {
      owners,
      requesters,
      contracts,
      agencies,
      txInfo,
      // P6547/گام سوم-۴ — شعبهٔ هر مشاور از branchId.title واقعی سامانهٔ PM (قالب: نام + شعبه + درصد)
      branchByConsultant: await readPmBranchMap().catch(() => ({} as Record<string, string>)),
    });

    // ---- P6.5-15 (BLOCK D + F — ملکا-شورا-۱۴۰۵-۰۱۸) — فیلترهای لایهٔ غنی‌سازی ----
    // نوع قرارداد: چندگانه (۴ kind + none) بر پایهٔ classifyContract — رفع F2
    const contractTypeParams = sp.getAll("contractType").map((v) => v.trim()).filter(Boolean);
    const contractFilter = contractTypeParams.length > 0 ? parseContractTypeFilter(contractTypeParams) : null;
    if (contractFilter && "error" in contractFilter) {
      return errorResponse(new MelkApiError("UNPROCESSABLE", contractFilter.error, 400, false));
    }
    // P6530/گام ۳ (بند ۲) — فیلترهای تمام ستون‌ها روی لایهٔ غنی‌سازی
    const sellerName = normalizeFilterInput(sp.get("sellerName")) || undefined;
    const buyerName = normalizeFilterInput(sp.get("buyerName")) || undefined;
    const priceFrom = (() => { const v = sp.get("priceFrom"); if (!v) return undefined; const n = Number(normalizeFilterInput(v)); return Number.isFinite(n) ? n : undefined; })();
    const priceTo = (() => { const v = sp.get("priceTo"); if (!v) return undefined; const n = Number(normalizeFilterInput(v)); return Number.isFinite(n) ? n : undefined; })();
    const hasContractParam = sp.get("hasContract");
    const hasContract = hasContractParam === "yes" || hasContractParam === "no" ? hasContractParam : undefined;
    const hasEnrichFilters = Boolean(expertName || personnelCode || contractFilter || sellerName || buyerName || priceFrom !== undefined || priceTo !== undefined || hasContract);

    // نگاشت کد پرسنلی → نام کارشناس: PM (نام مستقیم) + رکورد کارشناسان (personnelCode) — رفع F3-دامنه
    let codeNames: Set<string> | null = null;
    if (personnelCode) {
      codeNames = new Set<string>();
      const pmName = await findExpertNameByPersonnelCode(personnelCode);
      if (pmName) codeNames.add(pmName.replace(/\s+/g, " ").trim());
      const expertByCode = await getExpertRepository().findAll();
      for (const e of expertByCode) {
        if (e.personnelCode && normalizeFilterText(e.personnelCode) === personnelCode && e.fullName) {
          codeNames.add(e.fullName.replace(/\s+/g, " ").trim());
        }
      }
    }

    if (hasEnrichFilters) {
      enrichedRows = enrichedRows.filter((r) => {
        // نوع قرارداد — تطبیق با kind (مستقل از فاصله/نیم‌فاصله)
        if (contractFilter && !("error" in contractFilter)) {
          const { kind } = classifyContract(r.contractType);
          const pass = contractFilter.kinds.has(kind) || (contractFilter.includeNone && kind === "ثبت‌نشده");
          if (!pass) return false;
        }
        // نام کارشناس / کد پرسنلی — تطبیق روی فهرست «کامل» سهم‌ها (رفع F3) + نام‌های کارگزاری
        // P6525 — نرمال‌سازی دوطرفه (ي/ی، ك/ک، ارقام): نتیجهٔ ورودی فارسی/عربی/لاتین یکسان
        if (expertName || codeNames) {
          const hay = normalizeFilterInput(
            [
              ...(r.consultantsShareSummary?.allNames ?? r.consultantsShareSummary?.names ?? []),
              r.agency?.realtorName ?? "",
              r.agency?.creatorName ?? "",
            ].join(" ")
          );
          if (expertName && !hay.includes(expertName)) return false;
          if (codeNames && codeNames.size > 0 && ![...codeNames].some((n) => hay.includes(normalizeFilterInput(n)))) return false;
          if (codeNames && codeNames.size === 0) return false; // کد در هیچ منبعی شناخته نشد
        }
        // P6530/گام ۳ — فروشنده: نام یا موبایل (ستون ۴)
        if (sellerName) {
          const hay = normalizeFilterInput(`${r.sellerName ?? ""} ${r.ownerName ?? ""} ${r.sellerMobile ?? ""}`);
          if (!hay.includes(sellerName)) return false;
        }
        // P6530/گام ۳ — خریدار: نام یا موبایل (ستون ۶)
        if (buyerName) {
          const hay = normalizeFilterInput(`${r.buyerName ?? ""} ${r.requesterName ?? ""} ${r.buyerMobile ?? ""}`);
          if (!hay.includes(buyerName)) return false;
        }
        // P6530/گام ۳ — قیمت قرارداد از/تا (ستون ۸ — تومان)
        if (priceFrom !== undefined && (r.contractAmount === null || r.contractAmount < priceFrom)) return false;
        if (priceTo !== undefined && (r.contractAmount === null || r.contractAmount > priceTo)) return false;
        // P6530/گام ۳ — فایل قرارداد دارد/ندارد (ستون ۱۱)
        if (hasContract === "yes" && !r.contractMatchBy && !r.contractText) return false;
        if (hasContract === "no" && (r.contractMatchBy || r.contractText)) return false;
        return true;
      });
    }

    await witnessScopedRead(guard, "transaction", total, access.isOwnerRead, ownerLoginPath(guard));

    // P6.5-15 — اگر فیلتر لایهٔ غنی‌سازی فعال است، شمارش منطبق واقعی همان ردیف‌های باقی‌مانده است
    // P6527 — فشردهٔ gzip وقتی کلاینت می‌پذیرد (بدون آن عین Response.json)
    return await compressedJson({
      ok: true,
      rows: enrichedRows,
      total: hasEnrichFilters ? enrichedRows.length : total,
      limit,
      offset,
      summary,
      // شفافیت منبع داده برای UI
      dataSource: {
        real: true,
        cached: syncState.lastSuccessAt !== null,
        lastSuccessAt: syncState.lastSuccessAt,
        lastSyncedAt: syncState.lastSyncedAt,
        // P6546/گام سوم-۳ (رفع ریشه‌ای): خطای زنده فقط وقتی گزارش می‌شود که «هیچ» دادهٔ
        // کش‌شده‌ای برای نمایش نباشد؛ با وجود کش سالم، خطای قدیمی/گذرا هرگز فهرست را
        // با بنر «استخراج زنده در دسترس نیست» آلوده نمی‌کند.
        liveError: summary.totalCount === 0 ? (seed.liveError ?? syncState.lastError) : null,
        syncAttempts: syncState.attempts,
      },
      // P6530/گام ۳ (بند ۴.۲) — تاریخ و ساعت دقیق آخرین بروزرسانی موفق + نقطهٔ ادامه
      lastUpdate: {
        lastSuccessAt: syncState.lastSuccessAt,
        lastSyncedAt: syncState.lastSyncedAt,
        attempts: syncState.attempts,
      },
    }, request.headers.get("accept-encoding"));
  } catch (err) {
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در استخراج معاملات.", 500, false));
  }
}
