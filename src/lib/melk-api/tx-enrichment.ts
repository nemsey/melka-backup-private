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
  /** P6.5-12 — مبالغ مالی قرارداد */
  contractPrice?: number | null;
  rawContractPrice?: string | null;
  comisionOfContract?: number | null;
  taxOfContract?: number | null;
}

/** P6.5-14 (BLOCK C — ملکا-شورا-۱۴۰۵-۰۱۷) — غنی‌سازی معامله‌محور:
 *  پاسخ نگاشت‌شدهٔ «trade-overviews/info/{txId}» عین منبع؛ بالاترین اولویت
 *  برای نوع/مبلغ/طرفین/حق‌السهم چون مستقیماً به خود معامله گره خورده است. */
export interface TxInfoLookup {
  txId: string;
  contractType: string | null;
  contractPrice: number | null;
  buyerName: string | null;
  buyerMobile: string | null;
  sellerName: string | null;
  sellerMobile: string | null;
  realtorSharesJson: string | null;
  propertyTitle: string | null;
  propertyAddress: string | null;
  status: string | null;
  documentDate: Date | null;
  deliveryDate: Date | null;
}

/** P6.5-12 — کارگزاری مرتبط با ملک معامله (special-properties سامانه ARM) */
export interface AgencyLookup {
  id: string;
  propertyCode: string | null;
  propertyId: string | null;
  realtorName: string | null;
  creatorName: string | null;
  payPercent: number | null;
  sellPrice: number | null;
  detailsJson: string | null;
  createdAt: Date | null;
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
  /** P6.5-14 (BLOCK C) — نام فروشنده (sellerList صورت‌وضعیت — ستون مستقل) */
  sellerName: string | null;
  /** P6.5-14 — موبایل فروشنده */
  sellerMobile: string | null;
  /** P6.5-14 — نام خریدار (buyerList صورت‌وضعیت — ستون مستقل) */
  buyerName: string | null;
  /** P6.5-14 — موبایل خریدار */
  buyerMobile: string | null;
  /** متن قرارداد — ترکیب شفاف از فیلدهای واقعیِ ثبت‌شده (لایهٔ نمایش) */
  contractText: string | null;
  /** تجمیع حق‌السهم مشاوران — خلاصهٔ عددی + نام‌ها */
  consultantsShareSummary: {
    count: number;
    totalPercent: number;
    confirmed: number;
    pending: number;
    names: string[];
    /** P6.5-12 — سهم هر مشاور با درصد (بند ب دستور: «در مقابل نام هر مشاور درصد حق السهم») */
    shares: { name: string; unitPercent: number; confirmation: string }[];
    /** P6.5-15 (رفع F3 — ملکا-شورا-۱۴۰۵-۰۱۸) — فهرست «کامل» نام‌های مشاوران بدون بریدگی؛
     *   فیلتر نام کارشناس سمت سرور روی این فهرست تطبیق می‌خورد (نه خلاصهٔ ۶تایی names) */
    allNames: string[];
  } | null;
  /** منبع تطبیق قرارداد (شفافیت) */
  contractMatchBy: "holo" | "propertyCode" | "requestCode" | null;
  /** P6.5-14 — منبع داده‌های معامله‌محور (trade-overviews/info) */
  infoMatch: boolean;
  /** P6.5-12 — نوع قرارداد (از قرارداد تطبیقی؛ مستقیم یا اجاره) */
  contractType: string | null;
  /** P6.5-12 — مبلغ قرارداد (ریال — از قرارداد تطبیقی) */
  contractAmount: number | null;
  /** P6.5-12 — کارگزاری مرتبط با ملک (سند نمایندگی — منبع فایل قرارداد) */
  agency: AgencyLookup | null;
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
    // P6.5-12 — سهم‌های تفکیکی با درصد هر مشاور
    shares: shares
      .filter((s) => s.name)
      .slice(0, 8)
      .map((s) => ({ name: s.name, unitPercent: Number.isFinite(s.unitPercent) ? s.unitPercent : 0, confirmation: s.confirmation ?? "" })),
    // P6.5-15 (رفع F3) — نام‌های کامل برای فیلتر سمت سرور (بدون slice)
    allNames: [...new Set(names)],
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
  /** P6.5-12 — کارگزاری‌های مرتبط (بر اساس کد ملک) */
  agencies?: AgencyLookup[];
  /** P6.5-14 (BLOCK C) — غنی‌سازی معامله‌محور (بر اساس txId — بالاترین اولویت) */
  txInfo?: TxInfoLookup[];
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
  // P6.5-14 (BLOCK C) — ایندکس غنی‌سازی معامله‌محور بر اساس txId
  const txInfoById = new Map((ctx.txInfo ?? []).map((t) => [t.txId, t]));

  // P6.5-12 — ایندکس کارگزاری‌ها بر اساس کد ملک (جدیدترین اول)
  const agencyByProperty = new Map<string, AgencyLookup>();
  for (const a of ctx.agencies ?? []) {
    if (a.propertyCode && !agencyByProperty.has(a.propertyCode)) agencyByProperty.set(a.propertyCode, a);
  }

  // موبایل‌های طرفین از قراردادها (خریداران/فروشندگان) — مکمل تماس‌های کاتالوگ
  const buyerMobileByRequest = new Map<string, string>();
  const sellerMobileByProperty = new Map<string, string>();
  const buyerNameByRequest = new Map<string, string>();
  const sellerNameByProperty = new Map<string, string>();
  for (const c of ctx.contracts) {
    if (c.requestCode) {
      const buyer = parseParties(c.buyerListJson).find((p) => p.mobileNumber);
      if (buyer?.mobileNumber) buyerMobileByRequest.set(c.requestCode, buyer.mobileNumber);
      const buyerNamed = parseParties(c.buyerListJson).find((p) => p.fullName);
      if (buyerNamed?.fullName) buyerNameByRequest.set(c.requestCode, buyerNamed.fullName);
    }
    if (c.propertyCode) {
      const seller = parseParties(c.sellerListJson).find((p) => p.mobileNumber);
      if (seller?.mobileNumber) sellerMobileByProperty.set(c.propertyCode, seller.mobileNumber);
      const sellerNamed = parseParties(c.sellerListJson).find((p) => p.fullName);
      if (sellerNamed?.fullName) sellerNameByProperty.set(c.propertyCode, sellerNamed.fullName);
    }
  }

  return rows.map((tx) => {
    const owner = tx.propertyCode ? ownerByCode.get(tx.propertyCode) : undefined;
    const requester = tx.requestCode ? requesterByCode.get(tx.requestCode) : undefined;
    const { contract, by } = matchContractForTx(tx, contractIndex);
    const agency = tx.propertyCode ? agencyByProperty.get(tx.propertyCode) ?? null : null;
    const info = txInfoById.get(tx.id) ?? null;

    // P6.5-14 (BLOCK C) — طرفین مستقل از صورت‌وضعیت خود معامله (بالاترین اولویت):
    // فروشنده = sellerList · خریدار = buyerList؛ مالک/درخواست‌دهنده از رجیستری‌ها.
    const infoSellerName = info?.sellerName?.trim() || null;
    const infoSellerMobile = info?.sellerMobile?.trim() || null;
    const infoBuyerName = info?.buyerName?.trim() || null;
    const infoBuyerMobile = info?.buyerMobile?.trim() || null;

    // P6.5-12 — نام واقعی مالک: فیلد propertyCustomer خود گزارش فقط «برچسب نقش» است
    // (فروشنده/موجر — شاهد داده: ۷۲۷/۷۲۷ = فروشنده)؛ اولویت: رجیستری آگهی‌ها >
    // فروشندهٔ صورت‌وضعیت خود معامله (P6.5-14) > طرف فروشندهٔ قرارداد > برچسب نقش
    const ownerName =
      owner?.ownerName?.trim() ||
      infoSellerName ||
      (tx.propertyCode ? sellerNameByProperty.get(tx.propertyCode)?.trim() ?? null : null) ||
      tx.propertyCustomer?.trim() ||
      null;
    const ownerMobile =
      owner?.ownerMobile?.trim() ||
      infoSellerMobile ||
      (tx.propertyCode ? sellerMobileByProperty.get(tx.propertyCode) ?? null : null);

    // P6.5-14 — فروشندهٔ مستقل: صورت‌وضعیت خود معامله > قرارداد تطبیقی > رجیستری آگهی
    const sellerName =
      infoSellerName ||
      (tx.propertyCode ? sellerNameByProperty.get(tx.propertyCode)?.trim() ?? null : null) ||
      owner?.ownerName?.trim() ||
      null;
    const sellerMobile =
      infoSellerMobile ||
      (tx.propertyCode ? sellerMobileByProperty.get(tx.propertyCode) ?? null : null) ||
      owner?.ownerMobile?.trim() ||
      null;

    // P6.5-12 — نام واقعی درخواست‌دهنده: اولویت: کاتالوگ درخواست‌ها > خریدار صورت‌وضعیت
    // خود معامله (P6.5-14) > طرف خریدار قرارداد > برچسب نقش
    const requesterName =
      requester?.customerName?.trim() ||
      infoBuyerName ||
      (tx.requestCode ? buyerNameByRequest.get(tx.requestCode) ?? null : null) ||
      tx.requestCustomer?.trim() ||
      null;
    const requesterMobile =
      requester?.customerMobile?.trim() ||
      infoBuyerMobile ||
      (tx.requestCode ? buyerMobileByRequest.get(tx.requestCode) ?? null : null);

    // P6.5-14 — خریدار مستقل: صورت‌وضعیت خود معامله > قرارداد تطبیقی > کاتالوگ درخواست‌ها
    const buyerName =
      infoBuyerName ||
      (tx.requestCode ? buyerNameByRequest.get(tx.requestCode) ?? null : null) ||
      requester?.customerName?.trim() ||
      null;
    const buyerMobile =
      infoBuyerMobile ||
      (tx.requestCode ? buyerMobileByRequest.get(tx.requestCode) ?? null : null) ||
      requester?.customerMobile?.trim() ||
      null;

    // P6.5-14 — نوع/مبلغ/حق‌السهم: غنی‌سازی معامله‌محور > قرارداد تطبیقی
    const contractType = info?.contractType?.trim() || contract?.contractType?.trim() || null;
    const contractAmount = info?.contractPrice ?? contract?.contractPrice ?? null;
    const shareSource = info?.realtorSharesJson ?? contract?.realtorListJson ?? null;

    // P6.5-14 — متن قرارداد: اولویت با داده‌های معامله‌محور (عین خود معامله)
    const contractLike: ContractLookup | null = info
      ? {
          contractHolo: tx.contractHolo,
          propertyCode: tx.propertyCode,
          requestCode: tx.requestCode,
          contractType,
          contractDate: tx.contractDate,
          documentDate: info.documentDate,
          deliveryDate: info.deliveryDate,
          propertyTitle: info.propertyTitle,
          propertyAddress: info.propertyAddress,
          buyerListJson: infoBuyerName ? JSON.stringify([{ fullName: infoBuyerName }]) : null,
          sellerListJson: infoSellerName ? JSON.stringify([{ fullName: infoSellerName }]) : null,
          realtorListJson: info.realtorSharesJson,
          status: info.status ?? contract?.status ?? "",
        }
      : contract;

    return {
      ...tx,
      ownerName,
      ownerMobile,
      requesterName,
      requesterMobile,
      sellerName,
      sellerMobile,
      buyerName,
      buyerMobile,
      contractText: synthesizeContractText(contractLike, tx),
      consultantsShareSummary: aggregateConsultantShares(shareSource),
      contractMatchBy: by,
      infoMatch: info !== null,
      // P6.5-14 — نوع و مبلغ با اولویت معامله‌محور
      contractType,
      contractAmount,
      agency,
    };
  });
}

// ==========================================================================
// P6.5-14 (BLOCK A.۴ — ملکا-شورا-۱۴۰۵-۰۱۷) — پوشش اطلاعات فهرست معاملات
// ==========================================================================

/** هفت معیار پوشش — عین جدول A.۴ (ترتیب الزامی) */
export interface TxInfoCoverageCriteria {
  key: "ownerName" | "ownerMobile" | "buyerName" | "buyerMobile" | "contractType" | "contractAmount" | "shareAggregate";
  label: string;
  filled: number;
  total: number;
  /** درصد با یک رقم اعشار */
  pct: number;
}

export type TxInfoCoverageRow = Pick<
  EnrichedTxRow,
  "ownerName" | "ownerMobile" | "buyerName" | "buyerMobile" | "contractType" | "contractAmount" | "consultantsShareSummary"
>;

/** محاسبهٔ هفت معیار پوشش — خالص و قابل تست (هر فرمول عین جدول A.۴) */
export function computeTxInfoCoverage(rows: TxInfoCoverageRow[]): { total: number; criteria: TxInfoCoverageCriteria[] } {
  const total = rows.length;
  const pct1 = (n: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);
  const defs: { key: TxInfoCoverageCriteria["key"]; label: string; filled: number }[] = [
    { key: "ownerName", label: "نام مالک", filled: rows.filter((r) => Boolean(r.ownerName?.trim())).length },
    { key: "ownerMobile", label: "موبایل مالک", filled: rows.filter((r) => Boolean(r.ownerMobile?.trim())).length },
    { key: "buyerName", label: "نام خریدار", filled: rows.filter((r) => Boolean(r.buyerName?.trim())).length },
    { key: "buyerMobile", label: "موبایل خریدار", filled: rows.filter((r) => Boolean(r.buyerMobile?.trim())).length },
    { key: "contractType", label: "نوع قرارداد", filled: rows.filter((r) => Boolean(r.contractType?.trim())).length },
    { key: "contractAmount", label: "مبلغ قرارداد", filled: rows.filter((r) => (r.contractAmount ?? 0) > 0).length },
    { key: "shareAggregate", label: "تجمیع حق‌السهم مشاوران", filled: rows.filter((r) => (r.consultantsShareSummary?.totalPercent ?? 0) > 0).length },
  ];
  return { total, criteria: defs.map((d) => ({ ...d, total, pct: pct1(d.filled) })) };
}
