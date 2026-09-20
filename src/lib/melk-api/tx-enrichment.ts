/**
 * غنی‌سازی فهرست معاملات — P6.5-11 (بند پ-۵)
 * ------------------------------------------------------
 * ستون‌های جدید فهرست معاملات کاشی «معاملات و قراردادهای ملک تبریز»:
 *   بعد از ستون کد ملک:      «نام و نام خانوادگی مالک» + «موبایل مالک»
 *   بعد از ستون کد درخواست:  «نام و نام خانوادگی درخواست‌دهنده» + «موبایل درخواست‌دهنده»
 *   ستون‌های تکمیلی:          «متن قرارداد» + «تجمیع حق‌السهم مشاوران»
 *
 * 🔒 قانون دادهٔ مقدس ملک تبریز (بند الف P6.5-11):
 *   این ماژول کاملاً «لایهٔ تحلیل/نمایش» است — فقط می‌خواند و ترکیب می‌کند؛
 *   هرگز هیچ ستونی از لایهٔ دادهٔ خام (raw*) را نمی‌نویسد یا تغییر نمی‌دهد.
 *   «متن قرارداد» از فیلدهای واقعیِ ذخیره‌شده «ساخته» می‌شود (ARM فیلد متن
 *   مستقل ندارد — شاهد Recon: trade-overviews فقط هولوگرام/نوع/طرفین/
 *   مشاوران/تاریخ دارد) و برچسب «تولیدی از داده‌های ثبت‌شده» شفاف است.
 */

import type { ContractRealtorShare } from "./types";

// ==========================================================================
// ورودی/خروجی
// ==========================================================================

/** ردیف معامله عین TransactionRecord (خوانده‌شده از انبار — دست‌نخورده) */
export interface TxSourceRow {
  id: string;
  contractDate: Date | string;
  propertyCode: string;
  propertyCustomer: string | null;
  requestCode: string | null;
  requestCustomer: string | null;
  contractHolo: string | null;
  suggestedPropertyCount: number;
  eventsCount: number;
}

/** تماس مالک ملک از رجیستری آگهی‌های ARM (PropertyRecord — لایه ۲ غنی‌شده) */
export interface OwnerContactLookup {
  propertyCode: string;
  ownerName: string | null;
  ownerMobile: string | null;
}

/** تماس درخواست‌دهنده از کاتالوگ درخواست‌های ARM (RequestRecord source='arm') */
export interface RequesterContactLookup {
  requestCode: string;
  customerName: string | null;
  customerMobile: string | null;
}

/** قرارداد مرتبط از انبار قراردادها (فیلدهای لازم برای متن و حق‌السهم) */
export interface ContractLookup {
  contractHolo: string | null;
  propertyCode: string | null;
  requestCode: string | null;
  contractType: string | null;
  contractDate: Date | string | null;
  documentDate: Date | string | null;
  deliveryDate: Date | string | null;
  propertyTitle: string | null;
  propertyAddress: string | null;
  buyerListJson: string | null;
  sellerListJson: string | null;
  realtorListJson: string | null;
  status: string;
}

/** خروجی غنی‌شده — ردیف معامله + ستون‌های جدید (بند پ-۵) */
export type EnrichedTxRow<R extends TxSourceRow = TxSourceRow> = R & {
  /** نام و نام خانوادگی مالک (کد ملک) */
  ownerName: string | null;
  /** موبایل مالک (کد ملک) */
  ownerMobile: string | null;
  /** نام و نام خانوادگی درخواست‌دهنده (کد درخواست) */
  requesterName: string | null;
  /** موبایل درخواست‌دهنده (کد درخواست) */
  requesterMobile: string | null;
  /** متن قرارداد — ترکیب شفاف از فیلدهای واقعیِ ثبت‌شده (لایهٔ نمایش) */
  contractText: string | null;
  /** تجمیع حق‌السهم مشاوران — خلاصهٔ عددی + نام‌ها */
  consultantsShareSummary: {
    count: number;
    totalPercent: number;
    confirmed: number;
    pending: number;
    names: string[];
  } | null;
  /** منبع تطبیق قرارداد (شفافیت) */
  contractMatchBy: "holo" | "propertyCode" | "requestCode" | null;
};

// ==========================================================================
// تجمیع حق‌السهم مشاوران (بند پ-۵ — ستون «تجمیع حق السهم مشاوران»)
// ==========================================================================

export function aggregateConsultantShares(
  realtorListJson: string | null | undefined
): EnrichedTxRow["consultantsShareSummary"] {
  if (!realtorListJson) return null;
  let shares: ContractRealtorShare[] = [];
  try {
    const parsed = JSON.parse(realtorListJson) as ContractRealtorShare[];
    if (Array.isArray(parsed)) shares = parsed;
  } catch {
    return null;
  }
  if (shares.length === 0) return null;
  const names = shares.map((s) => s.name).filter((n): n is string => Boolean(n));
  const totalPercent = shares.reduce((sum, s) => sum + (Number.isFinite(s.unitPercent) ? s.unitPercent : 0), 0);
  const confirmed = shares.filter((s) => s.confirmation === "confirm").length;
  const pending = shares.filter((s) => s.confirmation !== "confirm" && s.confirmation !== "reject").length;
  return {
    count: shares.length,
    totalPercent: Math.round(totalPercent * 100) / 100,
    confirmed,
    pending,
    names: [...new Set(names)].slice(0, 6),
  };
}

// ==========================================================================
// متن قرارداد — تولید شفاف از فیلدهای واقعی (لایهٔ تحلیل؛ نه دادهٔ خام)
// ==========================================================================

interface Party {
  fullName?: string | null;
  mobileNumber?: string | null;
}

function parseParties(json: string | null | undefined): Party[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as Party[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function faDatePart(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  const d = typeof v === "string" ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * ساخت «متن قرارداد» از فیلدهای واقعیِ ثبت‌شدهٔ قرارداد:
 * نوع قرارداد + هولوگرام + طرفین (خریداران/فروشندگان) + ملک + تاریخ‌ها.
 * هیچ داده‌ای جعل نمی‌شود — اگر فیلدی نباشد، همان بند حذف می‌شود؛
 * اگر «هیچ» فیلدی نباشد خروجی null است (نه متن خالی/ساختگی).
 */
export function synthesizeContractText(
  contract: ContractLookup | null,
  fallback: { propertyCode?: string; requestCode?: string | null; contractHolo?: string | null; contractDate?: Date | string }
): string | null {
  if (!contract) return null;
  const parts: string[] = [];

  const type = contract.contractType?.trim();
  if (type) parts.push(type);

  const holo = contract.contractHolo?.trim() || fallback.contractHolo?.trim();
  if (holo) parts.push(`شماره هولوگرام ${holo}`);

  const sellers = parseParties(contract.sellerListJson).map((p) => p.fullName).filter((n): n is string => Boolean(n));
  const buyers = parseParties(contract.buyerListJson).map((p) => p.fullName).filter((n): n is string => Boolean(n));
  if (sellers.length > 0) parts.push(`فروشنده/مالک: ${sellers.join("، ")}`);
  if (buyers.length > 0) parts.push(`خریدار: ${buyers.join("، ")}`);

  const title = contract.propertyTitle?.trim();
  if (title) parts.push(`ملک: ${title}`);

  const cDate = faDatePart(contract.contractDate ?? fallback.contractDate);
  if (cDate) parts.push(`تاریخ قرارداد: ${cDate}`);
  const dDate = faDatePart(contract.documentDate);
  if (dDate) parts.push(`تاریخ تنظیم سند: ${dDate}`);
  const delivery = faDatePart(contract.deliveryDate);
  if (delivery) parts.push(`تحویل: ${delivery}`);

  const shares = aggregateConsultantShares(contract.realtorListJson);
  if (shares && shares.count > 0) {
    parts.push(`مشاوران (${shares.count} نفر — مجموع ${shares.totalPercent}٪): ${shares.names.join("، ")}`);
  }

  return parts.length > 0 ? parts.join("؛ ") : null;
}

// ==========================================================================
// هستهٔ غنی‌سازی — ترکیب منابع (خالص و قابل تست)
// ==========================================================================

export interface EnrichContext {
  owners: OwnerContactLookup[];
  requesters: RequesterContactLookup[];
  contracts: ContractLookup[];
}

/** ایندکس قرارداد بر اساس سه کلید طبیعی — اولویت: هولوگرام > کد ملک > کد درخواست */
export function buildContractIndex(contracts: ContractLookup[]): {
  byHolo: Map<string, ContractLookup>;
  byProperty: Map<string, ContractLookup>;
  byRequest: Map<string, ContractLookup>;
} {
  const byHolo = new Map<string, ContractLookup>();
  const byProperty = new Map<string, ContractLookup>();
  const byRequest = new Map<string, ContractLookup>();
  for (const c of contracts) {
    if (c.contractHolo) byHolo.set(c.contractHolo, c);
    if (c.propertyCode && !byProperty.has(c.propertyCode)) byProperty.set(c.propertyCode, c);
    if (c.requestCode && !byRequest.has(c.requestCode)) byRequest.set(c.requestCode, c);
  }
  return { byHolo, byProperty, byRequest };
}

/** یافتن قرارداد مرتبط یک معامله — اولویت: هولوگرام > کد ملک > کد درخواست */
export function matchContractForTx(
  tx: Pick<TxSourceRow, "contractHolo" | "propertyCode" | "requestCode">,
  index: ReturnType<typeof buildContractIndex>
): { contract: ContractLookup | null; by: EnrichedTxRow["contractMatchBy"] } {
  if (tx.contractHolo && index.byHolo.has(tx.contractHolo)) {
    return { contract: index.byHolo.get(tx.contractHolo) ?? null, by: "holo" };
  }
  if (tx.propertyCode && index.byProperty.has(tx.propertyCode)) {
    return { contract: index.byProperty.get(tx.propertyCode) ?? null, by: "propertyCode" };
  }
  if (tx.requestCode && index.byRequest.has(tx.requestCode)) {
    return { contract: index.byRequest.get(tx.requestCode) ?? null, by: "requestCode" };
  }
  return { contract: null, by: null };
}

/**
 * غنی‌سازی دسته‌ای ردیف‌های معاملات — بند پ-۵:
 * نام/موبایل مالک (رجیستری آگهی ARM) · نام/موبایل درخواست‌دهنده (کاتالوگ ARM)
 * · متن قرارداد · تجمیع حق‌السهم مشاوران.
 * ترکیب نام‌ها: نام داخل خود معامله (گزارش تطابق) اولویت دارد؛
 * کاتالوغ‌ها مکمل‌اند (پرکردن جای خالی — نه جایگزینی دادهٔ موجود).
 */
export function enrichTransactionRows<R extends TxSourceRow>(rows: R[], ctx: EnrichContext): EnrichedTxRow<R>[] {
  const ownerByCode = new Map(ctx.owners.map((o) => [o.propertyCode, o]));
  const requesterByCode = new Map(ctx.requesters.map((r) => [r.requestCode, r]));
  const contractIndex = buildContractIndex(ctx.contracts);

  // موبایل‌های طرفین از قراردادها (خریداران/فروشندگان) — مکمل تماس‌های کاتالوگ
  const buyerMobileByRequest = new Map<string, string>();
  const sellerMobileByProperty = new Map<string, string>();
  for (const c of ctx.contracts) {
    if (c.requestCode) {
      const buyer = parseParties(c.buyerListJson).find((p) => p.mobileNumber);
      if (buyer?.mobileNumber) buyerMobileByRequest.set(c.requestCode, buyer.mobileNumber);
    }
    if (c.propertyCode) {
      const seller = parseParties(c.sellerListJson).find((p) => p.mobileNumber);
      if (seller?.mobileNumber) sellerMobileByProperty.set(c.propertyCode, seller.mobileNumber);
    }
  }

  return rows.map((tx) => {
    const owner = tx.propertyCode ? ownerByCode.get(tx.propertyCode) : undefined;
    const requester = tx.requestCode ? requesterByCode.get(tx.requestCode) : undefined;
    const { contract, by } = matchContractForTx(tx, contractIndex);

    // نام مالک: نام طرف ملک در خود گزارش تطابق > غنی‌سازی کاتالوگ ARM
    const ownerName = tx.propertyCustomer?.trim() || owner?.ownerName?.trim() || null;
    const ownerMobile = owner?.ownerMobile?.trim() || (tx.propertyCode ? sellerMobileByProperty.get(tx.propertyCode) ?? null : null);

    // نام درخواست‌دهنده: نام طرف درخواست در خود گزارش > کاتالوگ ARM
    const requesterName = tx.requestCustomer?.trim() || requester?.customerName?.trim() || null;
    const requesterMobile =
      requester?.customerMobile?.trim() || (tx.requestCode ? buyerMobileByRequest.get(tx.requestCode) ?? null : null);

    return {
      ...tx,
      ownerName,
      ownerMobile,
      requesterName,
      requesterMobile,
      contractText: synthesizeContractText(contract, tx),
      consultantsShareSummary: aggregateConsultantShares(contract?.realtorListJson ?? null),
      contractMatchBy: by,
    };
  });
}
