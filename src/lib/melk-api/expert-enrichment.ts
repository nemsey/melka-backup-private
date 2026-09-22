/**
 * expert-enrichment.ts — P6.5-12: غنی‌سازی کاشی کارشناسان ملک تبریز
 * ------------------------------------------------------
 * دستور مالک ۱۴۰۵/۰۷/۰۱ (ثالثاً):
 *   الف) ستون کدپرسنلی فاقد اطلاعات ← منبع حقیقت: PM realtors/list (code)
 *        — اتصال PM↔ARM بر اساس _id مشترک (شاهد پروب: تطبیق ۱۰۰٪)
 *   ب) ستون موبایل فاقد اطلاعات ← رفع باگ آداپتور (mobileNumber) + پشتیبان PM
 *   ت) تعداد معامله مبایعه‌نامه / اجاره‌نامه هر کارشناس
 *   پ) بینش فعال‌ترین کارشناسان (۲۰ نفری) — با شاهد داشبورد مالی ACC (کل کسب‌وکار)
 *
 * منابع شمارش معاملات (شفاف و صادقانه):
 *   · مبایعه‌نامه: انتساب از گزارش تطابق معاملات (۷۲۷ فروش) از مسیر
 *     درخواست (actorName کارشناس درخواست) یا آگهی (ownerName کارشناس آگهی)
 *     + صورت‌وضعیت‌های با نوع «مبایعه نامه» (realtorShares)
 *   · اجاره‌نامه: صورت‌وضعیت‌های با نوع «اجاره نامه» (دامنهٔ حساب فعلی)
 *   · شاهد کل کسب‌وکار: dashboard/bestRealtor سامانهٔ مالی (tradeOverviewsCount)
 */

import { db } from "@/lib/db";
import { getAccBestRealtor, type AccBestRealtorEntry } from "./pm-acc-sync";

/** ردیف غنی‌شدهٔ کارشناس برای UI */
export interface ExpertEnrichedRow {
  id: string;
  personnelCode: string;
  fullName: string;
  mobile: string;
  role: string;
  businessTitle: string;
  creator: string | null;
  active: boolean;
  createdAt: Date;
  interactionTotal: number;
  /** P6.5-12 — کد پرسنلی از سامانهٔ PM (منبع حقیقت؛ تهی = در PM ثبت نشده) */
  pmCode: string | null;
  /** P6.5-12 — تعداد معامله مبایعه‌نامه (انتساب شفاف) */
  saleCount: number;
  /** P6.5-12 — تعداد معامله اجاره‌نامه (از صورت‌وضعیت‌ها) */
  rentCount: number;
  /** P6.5-12 — شمار کل قراردادهای ثبت‌شده در سامانهٔ مالی (کل کسب‌وکار — ۱۰ نفر برتر) */
  accContractCount: number | null;
}

export interface ExpertEnrichmentResult {
  rows: ExpertEnrichedRow[];
  /** منبع شمارش‌ها برای شفافیت UI */
  attribution: {
    salesTotal: number;
    salesAttributed: number;
    contractsSale: number;
    contractsRent: number;
    accTop: AccBestRealtorEntry[];
  };
}

interface ContractShareJson {
  name?: string;
  unitPercent?: number;
}

function norm(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

/**
 * غنی‌سازی دسته‌ای ردیف‌های کارشناسان — فقط خواندن (قانون دادهٔ مقدس).
 * rows = خروجی listWithInteractions مخزن (دست‌نخورده).
 */
export async function enrichExpertRows(
  rows: Array<{
    id: string;
    personnelCode: string;
    fullName: string;
    mobile: string;
    role: string;
    businessTitle: string;
    creator: string | null;
    active: boolean;
    createdAt: Date;
    interactionTotal: number;
  }>,
  armToken: string | null
): Promise<ExpertEnrichmentResult> {
  // ---------- ۱) پرسنل PM: نگاشت _id → code ----------
  const pmRows = await db.pmPersonnelRecord.findMany({ select: { id: true, code: true, mobileNumber: true } });
  const pmCodeById = new Map<string, string>();
  const pmMobileById = new Map<string, string>();
  for (const p of pmRows) {
    if (p.code) pmCodeById.set(p.id, p.code);
    if (p.mobileNumber) pmMobileById.set(p.id, p.mobileNumber);
  }

  // ---------- ۲) انتساب فروش‌ها (۷۲۷ معاملهٔ گزارش تطابق) ----------
  // نام کارشناس درخواست (actorName در رجیستری درخواست‌های ARM) و کارشناس آگهی (ownerName)
  const txs = await db.transactionRecord.findMany({ select: { requestCode: true, propertyCode: true } });
  const reqCodes = [...new Set(txs.map((t) => t.requestCode).filter((c): c is string => Boolean(c)))];
  const propCodes = [...new Set(txs.map((t) => t.propertyCode).filter(Boolean))];

  const [reqActors, propOwners] = await Promise.all([
    db.requestRecord.findMany({ where: { requestCode: { in: reqCodes } }, select: { requestCode: true, actorName: true } }),
    db.propertyRecord.findMany({ where: { propertyCode: { in: propCodes } }, select: { propertyCode: true, ownerName: true } }),
  ]);
  const actorByReq = new Map(reqActors.map((r) => [r.requestCode as string, norm(r.actorName)]));
  const ownerByProp = new Map(propOwners.map((p) => [p.propertyCode as string, norm(p.ownerName)]));

  // شمار فروش به تفکیک نام کارشناس (نرمال‌شده)
  const saleCountByName = new Map<string, number>();
  let attributed = 0;
  for (const t of txs) {
    const actor = t.requestCode ? actorByReq.get(t.requestCode) : "";
    const owner = t.propertyCode ? ownerByProp.get(t.propertyCode) : "";
    const names = new Set<string>();
    if (actor) names.add(actor);
    if (owner) names.add(owner);
    if (names.size === 0) continue;
    attributed += 1;
    for (const n of names) saleCountByName.set(n, (saleCountByName.get(n) ?? 0) + 1);
  }

  // ---------- ۳) صورت‌وضعیت‌ها: نوع قرارداد + سهم مشاوران ----------
  const contracts = await db.contractRecord.findMany({
    select: { contractType: true, realtorListJson: true, buyerListJson: true, sellerListJson: true },
  });
  const saleCountByContract = new Map<string, number>();
  const rentCountByContract = new Map<string, number>();
  for (const c of contracts) {
    let shares: ContractShareJson[] = [];
    try {
      shares = JSON.parse(c.realtorListJson ?? "[]") as ContractShareJson[];
    } catch {
      shares = [];
    }
    const isRent = (c.contractType ?? "").includes("اجاره");
    for (const s of shares) {
      const name = norm(s.name);
      if (!name) continue;
      if (isRent) rentCountByContract.set(name, (rentCountByContract.get(name) ?? 0) + 1);
      else saleCountByContract.set(name, (saleCountByContract.get(name) ?? 0) + 1);
    }
  }

  // ---------- ۴) شاهد کل کسب‌وکار از سامانهٔ مالی ----------
  let accTop: AccBestRealtorEntry[] = [];
  try {
    accTop = await getAccBestRealtor(armToken);
  } catch {
    accTop = [];
  }
  const accCountById = new Map(accTop.map((a) => [a.realtorId, a.tradeOverviewsCount]));

  // ---------- ۵) ترکیب ----------
  const enriched: ExpertEnrichedRow[] = rows.map((r) => {
    const name = norm(r.fullName);
    const saleFromReport = saleCountByName.get(name) ?? 0;
    const saleFromContract = saleCountByContract.get(name) ?? 0;
    const rentFromContract = rentCountByContract.get(name) ?? 0;
    // مبایعه‌نامه: حداکثر دو منبع مستقل (انتساب گزارش vs صورت‌وضعیت) — نه جمع (خطر دوگانگی)
    const saleCount = Math.max(saleFromReport, saleFromContract);
    return {
      ...r,
      createdAt: r.createdAt,
      pmCode: pmCodeById.get(r.id) ?? null,
      mobile: r.mobile !== "—" ? r.mobile : pmMobileById.get(r.id) ?? "—",
      saleCount,
      rentCount: rentFromContract,
      accContractCount: accCountById.get(r.id) ?? null,
    };
  });

  return {
    rows: enriched,
    attribution: {
      salesTotal: txs.length,
      salesAttributed: attributed,
      contractsSale: contracts.filter((c) => !(c.contractType ?? "").includes("اجاره")).length,
      contractsRent: contracts.filter((c) => (c.contractType ?? "").includes("اجاره")).length,
      accTop,
    },
  };
}

/**
 * بینش «فعال‌ترین کارشناسان» (بند پ دستور):
 * ۲۰ نفر برتر مبایعه‌نامه + ۲۰ نفر برتر اجاره‌نامه + شاهد ACC کل کسب‌وکار.
 */
export function buildTopExpertsInsight(
  rows: ExpertEnrichedRow[],
  attribution: ExpertEnrichmentResult["attribution"]
): {
  topSale: { name: string; count: number; pmCode: string | null }[];
  topRent: { name: string; count: number; pmCode: string | null }[];
  accTop: AccBestRealtorEntry[];
  coverage: { salesTotal: number; salesAttributed: number };
} {
  const withCode = (r: ExpertEnrichedRow) => ({ name: r.fullName, count: r.saleCount, pmCode: r.pmCode });
  const topSale = [...rows]
    .sort((a, b) => b.saleCount - a.saleCount || a.fullName.localeCompare(b.fullName, "fa"))
    .filter((r) => r.saleCount > 0)
    .slice(0, 20)
    .map(withCode);
  const topRent = [...rows]
    .sort((a, b) => b.rentCount - a.rentCount || a.fullName.localeCompare(b.fullName, "fa"))
    .filter((r) => r.rentCount > 0)
    .slice(0, 20)
    .map((r) => ({ name: r.fullName, count: r.rentCount, pmCode: r.pmCode }));
  return {
    topSale,
    topRent,
    accTop: attribution.accTop,
    coverage: { salesTotal: attribution.salesTotal, salesAttributed: attribution.salesAttributed },
  };
}
