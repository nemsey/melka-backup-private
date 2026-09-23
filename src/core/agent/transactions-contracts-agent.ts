/**
 * ایجنت هوشمند کاشی ادغامی «معاملات و قراردادهای ملک تبریز» — P6.5-11 (بند پ)
 * ------------------------------------------------------
 * ادغام سه ایجنت قبلی (معاملات + قراردادها و اسناد + مالی و کمیسیون) +
 * بینش‌های مهاجرت‌یافته از کاشی بازدیدها (بند ج).
 *
 * P6.5-14 (ملکا-شورا-۱۴۰۵-۰۱۷ — BLOCK A — بازنویسی بخش بینش معاملات):
 *   · دو بینش پیشینِ حوزهٔ ترکیب گزارش و نرخ تبدیل، بطور کلی حذف شدند
 *   · «روند ماهانه» → سه‌سری: مبایعه‌نامه / اجاره / مجموع (مجموع = مبایعه + اجاره + سایر)
 *   · بینش پوشش → «پوشش اطلاعات فهرست معاملات» با ۷ معیار
 *   · تازه: کارشناسان برتر سه‌ستونی (۱۰ برتر مبایعه / اجاره / مجموع)
 *
 * حافظهٔ ایجنت‌های قبلی (transactions/contracts/finance-commission) دست‌نخورده
 * در DB می‌ماند (نکتهٔ بسیار مهم ۲ — حفاظت کامل داده).
 */

import {
  getContractRepository,
  getExpertRepository,
  getPropertyRecordRepository,
  getRequestRepository,
  getTransactionRepository,
  getVisitRepository,
  type ContractRepository,
  type ExpertRepository,
  type TransactionRepository,
  type VisitRepository,
  type PropertyRecordRepository,
  type RequestRepository,
} from "@/core/repositories";
import { BaseLearningAgent, type InsightCard } from "./base-agent";
import { getCachedCommissionConfig } from "@/lib/melk-api/sync";
import { saleCommissionBase } from "@/lib/melk-api/commission";
import { enrichTransactionRows } from "@/lib/melk-api/tx-enrichment";
import { CONTRACT_FUNNEL_ORDER, CONTRACT_STATUS_FA, type ContractRealtorShare } from "@/lib/melk-api/types";
import { detectAnomalies, growthRate, topMonths, visitMonthlySeries, visitStats, txTypeMonthlySeries, topExpertsByTxType, type SharedTxRow } from "./analyzers";
import { classifyContract } from "@/lib/contract-classify";
import { computeTxInfoCoverage } from "@/lib/melk-api/tx-enrichment";
import { faNumber, faPercent, faToman, faMonthLabel } from "@/lib/format";
import { dateToJalali } from "@/lib/jalali";

function parseShares(raw: string | null | undefined): ContractRealtorShare[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ContractRealtorShare[];
  } catch {
    return [];
  }
}

/** وضعیت‌های رسیده به مرحله مالی — حق‌السهم معتبر */
const FINALIZED = ["confirmedByFinance", "waitingForDocument", "finished", "payed"];

/** وابستگی‌های تزریق‌پذیر ایجنت ادغامی */
export interface TransactionsContractsAgentDeps {
  transactions?: TransactionRepository;
  contracts?: ContractRepository;
  experts?: ExpertRepository;
  visits?: VisitRepository;
  property?: PropertyRecordRepository;
  request?: RequestRepository;
  commissionConfig?: typeof getCachedCommissionConfig;
}

export class TransactionsContractsAgent extends BaseLearningAgent {
  readonly tileId = "transactions-contracts";
  readonly name = "ایجنت تحلیل معاملات و قراردادهای ملک تبریز";
  /** P6.5-14 — دو دامنهٔ پیشینِ گزارش ترکیبی/تبدیلی حذف شدند (دستور A.۱)؛
   *  INFO_COVERAGE جای CONTACT_COVERAGE نشست و TOP_EXPERTS تازه آمد (A.۴/A.۵) */
  readonly insightDomains = [
    "VOLUME", "TREND", "DOCUMENT", "ANOMALY", "TOP_EXPERTS", "INFO_COVERAGE",
    "FUNNEL", "BOTTLENECK", "STALLED", "REJECT",
    "TARIFF", "REVENUE", "SETTLEMENT", "BRANCH", "PIPELINE",
    "CONTRACT_TEXT", "SHARE_AGGREGATE",
    "VISIT_VOLUME", "VISIT_TREND", "VISIT_STATUS",
  ] as const;

  private readonly txRepo: TransactionRepository;
  private readonly ctRepo: ContractRepository;
  private readonly exRepo: ExpertRepository;
  private readonly viRepo: VisitRepository;
  private readonly propertyRepo: PropertyRecordRepository;
  private readonly requestRepo: RequestRepository;
  private readonly loadCommissionConfig: typeof getCachedCommissionConfig;

  constructor(deps?: TransactionsContractsAgentDeps) {
    super();
    this.txRepo = deps?.transactions ?? getTransactionRepository();
    this.ctRepo = deps?.contracts ?? getContractRepository();
    this.exRepo = deps?.experts ?? getExpertRepository();
    this.viRepo = deps?.visits ?? getVisitRepository();
    this.propertyRepo = deps?.property ?? getPropertyRecordRepository();
    this.requestRepo = deps?.request ?? getRequestRepository();
    this.loadCommissionConfig = deps?.commissionConfig ?? getCachedCommissionConfig;
  }

  protected async computeRawInsights(): Promise<InsightCard[]> {
    const cards: InsightCard[] = [];

    const [txs, contracts, visits] = await Promise.all([
      this.txRepo.findAll(),
      this.ctRepo.findAll(),
      this.viRepo.findAll(),
    ]);

    // ================= بخش معاملات (P6.5-14 — BLOCK A بازنویسی‌شده) =================
    if (txs.length > 0) {
      const comp = matchCompositionLite(txs);

      // ---- VOLUME ----
      cards.push({
        key: "tc-volume",
        domain: "VOLUME",
        title: "حجم کل معاملات ثبت‌شده",
        body: `در بازهٔ بررسی، ${faNumber(txs.length)} معامله در «گزارش تطابق معاملات» سامانه ملک تبریز ثبت شده است — تمامی کارشناسان ملک تبریز پوشش داده می‌شوند. هر رکورد نشان‌دهندهٔ تطبیق یک آگهی ملک با یک درخواست خرید و ثبت قرارداد مربوطه است.`,
        severity: "info",
        metrics: [
          { label: "تعداد کل", value: faNumber(txs.length) },
          { label: "از مسیر درخواست", value: faNumber(txs.filter((t) => t.requestCode).length) },
          { label: "دارای هولوگرام", value: faNumber(txs.filter((t) => t.contractHolo).length) },
        ],
      });

      // ================= بینش‌های جدید ستون‌های فهرست (بند پ-۵ + BLOCK C) =================
      // غنی‌سازی عین روت فهرست — معامله‌محور (trade-overviews/info) + رجیستری‌ها + قراردادها
      const txInfo = await this.txRepo.findInfoEnrichmentsByTxIds(txs.map((t) => t.id));
      const propertyCodes = [...new Set(txs.map((t) => t.propertyCode).filter(Boolean))];
      const requestCodes = [...new Set(txs.map((t) => t.requestCode).filter((c): c is string => Boolean(c)))];
      const [owners, requesters] = await Promise.all([
        this.propertyRepo.findOwnerContactsByCodes(propertyCodes),
        this.requestRepo.findArmRequesterContactsByCodes(requestCodes),
      ]);
      const enriched = enrichTransactionRows(txs, {
        owners,
        requesters,
        txInfo,
        contracts: contracts.map((c) => ({
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
        })),
      });

      // ---- TREND (P6.5-15 A.۱ — ملکا-شورا-۱۴۰۵-۰۱۸) — منطق خانواده‌ای ----
      // سری ۱ (مبایعه‌نامه) = مبایعه + پیش‌فروش · سری ۲ (اجاره) = اجاره + تمدید
      // سری ۳ (مجموع) = سری۱ + سری۲ + ثبت‌نشده — بازهٔ الزامی: فروردین ۱۴۰۴ تا ماه جاری
      const typedRows: (SharedTxRow & { shareNames?: string[] })[] = enriched.map((r) => ({
        contractDate: r.contractDate,
        contractType: r.contractType,
        propertyTitle: null,
        realtorSharesJson: null,
        shareNames: r.consultantsShareSummary?.names ?? [],
      }));
      const series = txTypeMonthlySeries(typedRows, { fromKey: "1404-01", toKey: currentJalaliMonthKey() });
      const last = series[series.length - 1];
      const prev = series[series.length - 2];
      const totalInSeries = series.reduce((s, p) => s + p.total, 0);
      const saleTotal = series.reduce((s, p) => s + p.sale, 0);
      const rentTotal = series.reduce((s, p) => s + p.rent, 0);
      const noneTotal = series.reduce((s, p) => s + p.none, 0);
      {
        const growth = last && prev && prev.total > 0 ? Math.round(((last.total - prev.total) / prev.total) * 100) : null;
        cards.push({
          key: "tc-trend",
          domain: "TREND",
          title: "روند ماهانه معاملات — مبایعه‌نامه (شامل پیش‌فروش)، اجاره (شامل تمدید) و مجموع",
          body: `از فروردین ۱۴۰۴ تا ${faMonthLabel(last?.key ?? "1405-01")} مجموعاً ${faNumber(totalInSeries)} معامله ثبت شده است: ${faNumber(saleTotal)} مبایعه‌نامه (شامل ${faNumber(enriched.filter((r) => classifyContract(r.contractType).kind === "پیش‌فروش").length)} پیش‌فروش)، ${faNumber(rentTotal)} اجاره (شامل ${faNumber(enriched.filter((r) => classifyContract(r.contractType).kind === "تمدید اجاره").length)} تمدید اجاره) و ${faNumber(noneTotal)} بدون قرارداد ثبت‌شده (در مجموع محاسبه می‌شوند). ${growth === null ? "برای مقایسهٔ ماه اخیر داده کافی نیست." : growth >= 0 ? `مجموع معاملات ${faMonthLabel(last.key)} نسبت به ${faMonthLabel(prev.key)} حدود ${faNumber(Math.abs(growth))}٪ رشد داشته است.` : `مجموع معاملات ${faMonthLabel(last.key)} نسبت به ${faMonthLabel(prev.key)} حدود ${faNumber(Math.abs(growth))}٪ کاهش داشته است.`} نمودار همین کاشی سه سری را به‌صورت هم‌زمان نشان می‌دهد.`,
          severity: growth === null ? "info" : growth >= 10 ? "positive" : growth <= -10 ? "warning" : "info",
          metrics: [
            { label: "مبایعه‌نامه شامل پیش‌فروش (کل بازه)", value: faNumber(saleTotal) },
            { label: "اجاره شامل تمدید (کل بازه)", value: faNumber(rentTotal) },
            { label: "بدون قرارداد ثبت‌شده", value: faNumber(noneTotal) },
            { label: "مجموع", value: faNumber(totalInSeries) },
          ],
        });
      }

      // ---- ANOMALY (بر پایهٔ سری مجموع) ----
      const anomalies = detectAnomalies(series.map((p) => ({ key: p.key, count: p.total })));
      if (anomalies.length > 0) {
        const a = anomalies[Math.abs(anomalies[0].z) > Math.abs(anomalies[anomalies.length - 1].z) ? 0 : anomalies.length - 1];
        cards.push({
          key: "tc-anomaly",
          domain: "ANOMALY",
          title: "ناهنجاری آماری در روند معاملات",
          body: `ماه ${faMonthLabel(a.key)} با انحراف معیار ${faNumber(Math.abs(a.z))} ${a.direction === "spike" ? "بالاتر" : "پایین‌تر"} از نرمال عمل کرده است (${faNumber(a.count)} معامله). چنین انحرافی معمولاً نشانهٔ موج معاملاتی، تغییر سیاست سامانه یا رویداد فصلی است و ارزش بررسی دارد.`,
          severity: "critical",
          metrics: [{ label: "انحراف معیار", value: faNumber(a.z) }],
        });
      }

      const peak = topMonths(series.map((p) => ({ key: p.key, count: p.total })), 1);
      if (peak.length > 0 && series.length >= 3) {
        cards.push({
          key: "tc-peak",
          domain: "TREND",
          title: "ماه اوج معاملات",
          body: `پرشمارترین ماهِ ثبت معامله، ${faMonthLabel(peak[0].key)} با ${faNumber(peak[0].count)} معامله بوده است. الگوی فصلی این ماه می‌تواند مبنای برنامه‌ریزی نیروی انسانی و کمپین‌های فروش سال آینده قرار گیرد.`,
          severity: "positive",
          metrics: [{ label: faMonthLabel(peak[0].key), value: `${faNumber(peak[0].count)} معامله` }],
        });
      }

      // ---- TOP_EXPERTS (P6.5-15 C.۱ — ملکا-شورا-۱۴۰۵-۰۱۸) — سه ستون با منطق خانواده‌ای ----
      {
        const top = topExpertsByTxType(typedRows, 10);
        const topSale = top.sale[0];
        const topRent = top.rent[0];
        const topTotal = top.total[0];
        cards.push({
          key: "tc-top-experts",
          domain: "TOP_EXPERTS",
          title: "کارشناسان برتر بر اساس تعداد معاملات — مبایعه‌نامه، اجاره و مجموع",
          body: `بر پایهٔ حق‌السهم‌های ثبت‌شده در صورت‌وضعیت‌های سامانه (منطق خانواده‌ای): ${topSale ? `پیشتاز مبایعه‌نامه «${topSale.name}» با ${faNumber(topSale.count)} معامله (مبایعه‌نامه + پیش‌فروش)` : "معاملهٔ مبایعه‌نامه‌ای با مشاور ثبت‌شده نیست"}؛ ${topRent ? `پیشتاز اجاره «${topRent.name}» با ${faNumber(topRent.count)} معامله (اجاره + تمدید)` : "معاملهٔ اجاره‌ای با مشاور ثبت‌شده نیست"}؛ ${topTotal ? `پیشتاز مجموع «${topTotal.name}» با ${faNumber(topTotal.count)} معامله` : "داده‌ای نیست"}. فهرست کامل سه‌ستونی (۱۰ نفر هر ستون — فقط نام و تعداد) در تب «معاملات» همین کاشی نمایش داده می‌شود — مجموع هر کارشناس = مبایعه‌نامه + اجاره + ثبت‌نشده او.`,
          severity: "info",
          metrics: [
            ...(topSale ? [{ label: "برتر مبایعه‌نامه", value: `${topSale.name} — ${faNumber(topSale.count)}` }] : []),
            ...(topRent ? [{ label: "برتر اجاره", value: `${topRent.name} — ${faNumber(topRent.count)}` }] : []),
            ...(topTotal ? [{ label: "برتر مجموع", value: `${topTotal.name} — ${faNumber(topTotal.count)}` }] : []),
          ],
        });
      }

      // ---- DOCUMENT ----
      if (comp.holoShare < 95 && comp.totalCount >= 10) {
        cards.push({
          key: "tc-document",
          domain: "DOCUMENT",
          title: "قراردادهای بدون هولوگرام",
          body: `${faNumber(comp.totalCount - txs.filter((t) => t.contractHolo).length)} معامله بدون شماره هولوگرام ثبت شده‌اند (${faNumber(100 - comp.holoShare)}٪ از کل). شماره هولوگرام شناسه رسمی سند است؛ نبودش می‌تواند به معنای ثبت ناقص قرارداد در سامانه باشد — بررسی و تکمیل پرونده توصیه می‌شود.`,
          severity: comp.holoShare < 80 ? "warning" : "info",
          metrics: [
            { label: "دارای هولوگرام", value: `${faNumber(comp.holoShare)}٪` },
            { label: "بدون هولوگرام", value: `${faNumber(100 - comp.holoShare)}٪` },
          ],
        });
      }

      // ---- INFO_COVERAGE (P6.5-14 A.۴) — پوشش اطلاعات فهرست معاملات · ۷ معیار ----
      {
        const cov = computeTxInfoCoverage(enriched);
        const avgPct = cov.criteria.length > 0 ? Math.round((cov.criteria.reduce((s, c) => s + c.pct, 0) / cov.criteria.length) * 10) / 10 : 0;
        const weakest = [...cov.criteria].sort((a, b) => a.pct - b.pct)[0];
        cards.push({
          key: "tc-info-coverage",
          domain: "INFO_COVERAGE",
          title: "پوشش اطلاعات فهرست معاملات",
          body: `پوشش هفت معیار اطلاعات برای ${faNumber(cov.total)} ردیف فهرست معاملات (میانگین ${faNumber(avgPct)}٪): ${cov.criteria.map((c) => `${c.label} ${faNumber(c.pct)}٪`).join("، ")}. ${weakest && weakest.pct < 95 ? `ضعیف‌ترین معیار «${weakest.label}» با ${faNumber(weakest.pct)}٪ است — با «بروزرسانی از سامانه» و غنی‌سازی معامله‌محور (صورت‌وضعیت هر معامله) این پوشش کامل‌تر می‌شود.` : "همهٔ معیارها در آستانهٔ کامل‌اند."} هیچ ردیفی از چرخهٔ غنی‌سازی حذف نمی‌شود.`,
          severity: avgPct >= 95 ? "positive" : avgPct >= 70 ? "info" : "warning",
          metrics: cov.criteria.map((c) => ({
            label: c.label,
            value: `${faNumber(c.pct)}٪`,
            progress: c.pct,
          })),
        });
      }

      // ---- CONTRACT_TEXT: پوشش متن قرارداد ----
      const withContract = enriched.filter((r) => r.contractMatchBy !== null || r.infoMatch);
      const withText = enriched.filter((r) => r.contractText);
      const textPct = enriched.length > 0 ? Math.round((withText.length / enriched.length) * 100) : 0;
      cards.push({
        key: "tc-contract-text",
        domain: "CONTRACT_TEXT",
        title: "پوشش متن قرارداد در فهرست معاملات",
        body: `برای ${faNumber(withText.length)} ردیف از ${faNumber(enriched.length)} (${faNumber(textPct)}٪)، متن قرارداد از فیلدهای واقعیِ ثبت‌شده (نوع قرارداد، هولوگرام، طرفین، ملک، تاریخ‌ها و مشاوران) ترکیب شده است — متن تولیدیِ شفاف از داده‌های خود سامانه، نه دادهٔ جعلی. ${faNumber(withContract.length)} ردیف با قرارداد مرتبط تطبیق یافته‌اند (هولوگرام/کد ملک/کد درخواست).`,
        severity: textPct >= 30 ? "positive" : "info",
        metrics: [
          { label: "ردیف‌های دارای متن", value: faNumber(withText.length) },
          { label: "تطبیق با قرارداد", value: faNumber(withContract.length) },
          { label: "پوشش", value: `${faNumber(textPct)}٪` },
        ],
      });

      // ---- SHARE_AGGREGATE: تجمیع حق‌السهم ----
      const rowsWithShare = enriched.filter((r) => r.consultantsShareSummary);
      if (rowsWithShare.length > 0) {
        const totalPercentSum = rowsWithShare.reduce((s, r) => s + (r.consultantsShareSummary?.totalPercent ?? 0), 0);
        const avgPercent = Math.round((totalPercentSum / rowsWithShare.length) * 10) / 10;
        const totalConsultants = rowsWithShare.reduce((s, r) => s + (r.consultantsShareSummary?.count ?? 0), 0);
        cards.push({
          key: "tc-share-aggregate",
          domain: "SHARE_AGGREGATE",
          title: "تجمیع حق‌السهم مشاوران در فهرست معاملات",
          body: `در ${faNumber(rowsWithShare.length)} ردیفِ دارای قراردادِ مشاوران‌دار، مجموعاً ${faNumber(totalConsultants)} سهم مشاور ثبت شده است (میانگین ${faNumber(avgPercent)}٪ حق‌السهم در هر معامله). ستون «تجمیع حق‌السهم مشاوران» فهرست معاملات همین ارقام را ردیف‌به‌ردیف نشان می‌دهد — مبنای تسویه شفاف.`,
          severity: "info",
          metrics: [
            { label: "ردیف‌های دارای حق‌السهم", value: faNumber(rowsWithShare.length) },
            { label: "کل سهم‌های ثبت‌شده", value: faNumber(totalConsultants) },
            { label: "میانگین حق‌السهم هر معامله", value: `${faNumber(avgPercent)}٪` },
          ],
        });
      }
    }

    // ================= بخش قراردادها و اسناد (از ایجنت قراردادها) =================
    if (contracts.length > 0) {
      const total = contracts.length;
      const statusCounts = new Map<string, number>();
      for (const r of contracts) statusCounts.set(r.status, (statusCounts.get(r.status) ?? 0) + 1);
      const share = (s: string) => Math.round(((statusCounts.get(s) ?? 0) / total) * 100);

      // ---- FUNNEL ----
      const reachedFinance = FINALIZED.reduce((s, st) => s + (statusCounts.get(st) ?? 0), 0);
      const conversion = total > 0 ? Math.round((reachedFinance / total) * 100) : 0;
      cards.push({
        key: "tc-funnel",
        domain: "FUNNEL",
        title: "قیف چرخه عمر قراردادها",
        body: `از ${faNumber(total)} قرارداد ثبت‌شدهٔ تمامی کارشناسان ملک تبریز، ${faNumber(reachedFinance)} قرارداد به مرحله «تایید شده مالی» یا پس از آن رسیده‌اند (نرخ عبور ${faPercent(conversion)}). مراحل پرتراکم: ${CONTRACT_FUNNEL_ORDER.filter((s) => (statusCounts.get(s) ?? 0) > 0).slice(0, 3).map((s) => `${CONTRACT_STATUS_FA[s]} (${faNumber(statusCounts.get(s) ?? 0)})`).join("، ")}.`,
        severity: conversion >= 60 ? "positive" : conversion >= 30 ? "info" : "warning",
        metrics: [
          { label: "کل قراردادها", value: faNumber(total) },
          { label: "نرخ عبور به تایید مالی", value: faPercent(conversion) },
        ],
      });

      // ---- BOTTLENECK ----
      const waiting = CONTRACT_FUNNEL_ORDER.filter((s) => s.startsWith("waitingFor")).map((s) => ({ status: s, label: CONTRACT_STATUS_FA[s], count: statusCounts.get(s) ?? 0 }));
      const bottleneck = waiting.sort((a, b) => b.count - a.count)[0];
      if (bottleneck && bottleneck.count > 0) {
        const bnShare = share(bottleneck.status);
        cards.push({
          key: "tc-bottleneck",
          domain: "BOTTLENECK",
          title: `گلوگاه اداری: «${bottleneck.label}»`,
          body: `${faNumber(bottleneck.count)} قرارداد (${faPercent(bnShare)}) در مرحله «${bottleneck.label}» متوقف مانده‌اند — بیشترین تراکم بین مراحل انتظار. ${bnShare >= 50 ? "این انباشت بحرانی است؛ اختصاص منابع پیگیری فوری توصیه می‌شود." : "پایش دوره‌ای این مرحله و پیگیری مسؤولان مربوط توصیه می‌شود."}`,
          severity: bnShare >= 50 ? "critical" : bnShare >= 25 ? "warning" : "info",
          metrics: [
            { label: "قرارداد در این مرحله", value: faNumber(bottleneck.count) },
            { label: "سهم از کل", value: faPercent(bnShare) },
          ],
        });
      }

      // ---- STALLED ----
      const now = Date.now();
      const STALL_DAYS = 14;
      const stalled = contracts.filter((r) => {
        if (!r.status.startsWith("waitingFor")) return false;
        const t = (r.contractDate ?? r.createdAt)?.getTime();
        return t != null && now - t > STALL_DAYS * 86400000;
      });
      if (stalled.length > 0) {
        cards.push({
          key: "tc-stalled",
          domain: "STALLED",
          title: "قراردادهای راکد (بیش از دو هفته در انتظار)",
          body: `${faNumber(stalled.length)} قرارداد بیش از ${faNumber(STALL_DAYS)} روز در مراحل انتظار مانده‌اند. راکدماندگی طولانی معمولاً به از دست رفتن مشتری یا فسخ منجر می‌شود — بازبینی این پرونده‌ها با اولویت بالا توصیه می‌شود.`,
          severity: stalled.length >= 3 ? "critical" : "warning",
          metrics: [{ label: "قرارداد راکد", value: faNumber(stalled.length) }],
        });
      }

      // ---- REJECT ----
      const rejected = contracts.filter((r) => ["rejected", "rejectedByFinance", "rescission", "deletedByFinance"].includes(r.status));
      if (rejected.length > 0) {
        const rejectShare = share(rejected[0].status);
        cards.push({
          key: "tc-reject",
          domain: "REJECT",
          title: "قراردادهای رد/فسخ‌شده",
          body: `${faNumber(rejected.length)} قرارداد (${faPercent(Math.round((rejected.length / total) * 100))}) در وضعیت رد یا فسخ هستند. تحلیل علت‌ها (مدرک ناقص، اختلاف حق‌السهم، انصراف طرفین) و ثبت سیستماتیک در توضیحات، از تکرار آن جلوگیری می‌کند.`,
          severity: rejected.length / total > 0.2 ? "warning" : "info",
          metrics: [
            { label: "رد/فسخ", value: faNumber(rejected.length) },
            { label: "سهم از کل", value: faPercent(Math.round((rejected.length / total) * 100)) },
          ],
        });
        void rejectShare;
      }

      // ================= بخش مالی و کمیسیون (از ایجنت مالی) =================
      const finalized = contracts.filter((c) => FINALIZED.includes(c.status));
      const inPipeline = contracts.filter((c) => c.status.startsWith("waitingFor"));

      // ---- TARIFF ----
      const { configs, liveError } = await this.loadCommissionConfig();
      const tabriz = configs.find((c) => c.cityName.includes("تبریز")) ?? configs[0];
      if (tabriz) {
        cards.push({
          key: "tc-tariff",
          domain: "TARIFF",
          title: `تعرفه رسمی اتحادیه مشاورین املاک ${tabriz.cityName}`,
          body: `تعرفه زنده از سامانه مالی ملک تبریز دریافت شده است. مالیات ارزش افزوده ${faPercent(tabriz.valueAddedPercentage)} به کمیسیون هر طرف افزوده می‌شود و محاسبه‌گر همین کاشی با این تعرفه کار می‌کند.`,
          severity: "info",
          metrics: [
            { label: "نوع‌های معامله", value: faNumber(tabriz.detail.length) },
            { label: "مالیات ارزش افزوده", value: faPercent(tabriz.valueAddedPercentage) },
          ],
        });
      } else if (liveError) {
        cards.push({
          key: "tc-tariff-error",
          domain: "TARIFF",
          title: "تعرفه اتحادیه در دسترس نیست",
          body: `دریافت تعرفه زنده از سامانه مالی موفق نبود: ${liveError} محاسبه‌گر داشبورد با قواعد رسمی تعرفه تبریز (کشف‌شده از نرخ‌نامه) همچنان کار می‌کند.`,
          severity: "warning",
        });
      }

      // ---- REVENUE ----
      const consultantMap = new Map<string, { count: number; totalPercent: number; confirmed: number }>();
      for (const c of finalized) {
        for (const s of parseShares(c.realtorListJson)) {
          const e = consultantMap.get(s.name) ?? { count: 0, totalPercent: 0, confirmed: 0 };
          e.count += 1;
          e.totalPercent += s.unitPercent;
          if (s.confirmation === "confirm") e.confirmed += 1;
          consultantMap.set(s.name, e);
        }
      }
      cards.push({
        key: "tc-revenue",
        domain: "REVENUE",
        title: "حق‌السهم قراردادهای رسیده به مرحله مالی",
        body: `${faNumber(finalized.length)} قرارداد از ${faNumber(total)} به مرحله مالی رسیده‌اند و ${faNumber(consultantMap.size)} مشاور در آن‌ها سهم دارند. تسویه شفاف بر پایه همین تفکیک انجام می‌شود.`,
        severity: "info",
        metrics: [
          { label: "قراردادهای مرحله مالی", value: faNumber(finalized.length) },
          { label: "مشاوران دارای سهم", value: faNumber(consultantMap.size) },
        ],
      });

      // ---- SETTLEMENT ----
      const pendingConfirm = contracts
        .filter((c) => c.status === "waitingForRealtors")
        .flatMap((c) => parseShares(c.realtorListJson))
        .filter((s) => s.confirmation !== "confirm");
      if (pendingConfirm.length > 0) {
        cards.push({
          key: "tc-settlement",
          domain: "SETTLEMENT",
          title: "تأییدهای باز حق‌السهم",
          body: `${faNumber(pendingConfirm.length)} سهم مشاوران هنوز تأیید نشده است — تا تکمیل تأییدها، قراردادها به مرحله مالی نمی‌رسند و جریان درآمد متوقف می‌ماند. پیگیری شخصی مشاوران دارای سهم باز توصیه می‌شود.`,
          severity: pendingConfirm.length >= 3 ? "warning" : "info",
          metrics: [{ label: "سهم‌های در انتظار تأیید", value: faNumber(pendingConfirm.length) }],
        });
      }

      // ---- BRANCH ----
      const experts = await this.exRepo.findAll();
      const expertBranch = new Map(experts.map((e) => [e.fullName, e.businessTitle || "بدون شعبه"]));
      const branchMap = new Map<string, number>();
      for (const c of finalized) {
        const branches = new Set(parseShares(c.realtorListJson).map((s) => expertBranch.get(s.name) ?? "خارج از شعبه‌ها"));
        for (const b of branches) branchMap.set(b, (branchMap.get(b) ?? 0) + 1);
      }
      if (branchMap.size >= 2) {
        const sorted = [...branchMap.entries()].sort((a, b) => b[1] - a[1]);
        cards.push({
          key: "tc-branch",
          domain: "BRANCH",
          title: "مقایسه عملکرد مالی شعبه‌ها",
          body: `${faNumber(sorted.length)} شعبه در قراردادهای مالی فعال‌اند. پیشتاز: «${sorted[0][0]}» با ${faNumber(sorted[0][1])} قرارداد و انتهایی: «${sorted[sorted.length - 1][0]}» با ${faNumber(sorted[sorted.length - 1][1])} قرارداد. بررسی منابع و الگوی موفق شعبه پیشتاز توصیه می‌شود.`,
          severity: "info",
          metrics: sorted.slice(0, 3).map(([branch, count]) => ({ label: branch, value: `${faNumber(count)} قرارداد` })),
        });
      }

      // ---- PIPELINE ----
      if (inPipeline.length > 0) {
        cards.push({
          key: "tc-pipeline",
          domain: "PIPELINE",
          title: "درآمد در جریان — قراردادهای مراحل انتظار",
          body: `${faNumber(inPipeline.length)} قرارداد در مراحل انتظار است؛ با میانگین کمیسیون پایهٔ بازار تبریز (بر پایهٔ تعرفه اتحادیه)، نهایی‌شدن این موارد جریان نقدی قابل‌توجهی ایجاد می‌کند. پیگیری روزانهٔ گلوگاه این پرونده‌ها بیشترین بازده را دارد.`,
          severity: "info",
          metrics: [
            { label: "قرارداد در جریان", value: faNumber(inPipeline.length) },
            { label: "کمیسیون پایه هر قرارداد (برآورد تعرفه)", value: faToman(saleCommissionBase(1_000_000_000)) },
          ],
        });
      }
    }

    // ================= بینش‌های مهاجرت‌یافتهٔ بازدیدها (بند ج) =================
    if (visits.length > 0) {
      const vStats = visitStats(visits);
      const vSeries = visitMonthlySeries(visits);

      // ---- VISIT_VOLUME ----
      cards.push({
        key: "tc-visit-volume",
        domain: "VISIT_VOLUME",
        title: "حجم بازدیدها و پیگیری‌ها (مهاجرت از کاشی بازدیدها)",
        body: `${faNumber(vStats.total)} بازدید از آگهی‌ها ثبت شده است که ${faNumber(vStats.distinctProperties)} آگهی متمایز را پوشش می‌دهد و توسط ${faNumber(vStats.distinctRequesters)} درخواست‌دهنده انجام شده است. میانگین بازدید به‌ازای هر آگهی، شاخص جذابیت عرضه‌های ملک تبریز است.`,
        severity: "info",
        metrics: [
          { label: "کل بازدیدها", value: faNumber(vStats.total) },
          { label: "آگهی متمایز", value: faNumber(vStats.distinctProperties) },
        ],
      });

      // ---- VISIT_TREND ----
      const vGrowth = growthRate(vSeries);
      if (vSeries.length >= 2) {
        const last = vSeries[vSeries.length - 1];
        const prev = vSeries[vSeries.length - 2];
        cards.push({
          key: "tc-visit-trend",
          domain: "VISIT_TREND",
          title: "روند ماهانه ثبت بازدید",
          body:
            vGrowth === null
              ? "داده کافی برای محاسبه روند بازدیدها وجود ندارد."
              : vGrowth >= 0
                ? `ثبت بازدید ${faMonthLabel(last.key)} نسبت به ${faMonthLabel(prev.key)} حدود ${faNumber(Math.abs(vGrowth))}٪ رشد داشته است — نشانهٔ تقاضای فعال یا کمپین مؤثر.`
                : `ثبت بازدید ${faMonthLabel(last.key)} نسبت به ${faMonthLabel(prev.key)} حدود ${faNumber(Math.abs(vGrowth))}٪ کاهش داشته — بازنگری قیمت/محتوای آگهی‌ها توصیه می‌شود.`,
          severity: vGrowth === null ? "info" : vGrowth >= 10 ? "positive" : vGrowth <= -10 ? "warning" : "info",
          metrics: [{ label: "رشد ماهانه بازدید", value: vGrowth === null ? "—" : `${faNumber(vGrowth)}٪` }],
        });
      }

      // ---- VISIT_STATUS ----
      cards.push({
        key: "tc-visit-status",
        domain: "VISIT_STATUS",
        title: "نرخ بررسی بازدیدها",
        body: `${faNumber(vStats.checked)} بازدید (${faNumber(vStats.checkedRate)}٪) بررسی و ${faNumber(vStats.pending)} مورد هنوز بررسی نشده‌اند. بازدید بررسی‌نشده یعنی مشتری منتظر پاسخ است؛ ${vStats.pending > 0 ? "بررسی موارد معوق امروز توصیه می‌شود." : "وضعیت بررسی‌ها کامل است — عالی."}`,
        severity: vStats.pending === 0 ? "positive" : vStats.checkedRate < 70 ? "warning" : "info",
        metrics: [
          { label: "بررسی‌شده", value: faNumber(vStats.checked) },
          { label: "در انتظار بررسی", value: faNumber(vStats.pending) },
        ],
      });
    }

    return cards;
  }
}

export const transactionsContractsAgent = new TransactionsContractsAgent();

// ===================== کمکی‌های P6.5-14 (BLOCK A) =====================

/** خلاصهٔ سبک گزارش تطابق — فقط سنجه‌های بینش‌های باقی‌مانده (دامنهٔ ترکیبی پیشین حذف شد) */
function matchCompositionLite(txs: Array<{ requestCode: string | null; contractHolo: string | null }>): {
  totalCount: number;
  holoShare: number;
} {
  const n = txs.length;
  const withHolo = txs.filter((t) => t.contractHolo).length;
  return { totalCount: n, holoShare: n > 0 ? Math.round((withHolo / n) * 1000) / 10 : 0 };
}

/** کلید ماه جلالی جاری (yyyy-mm) — سقف بازهٔ روند سه‌سری A.۲ */
function currentJalaliMonthKey(): string {
  const j = dateToJalali(new Date());
  return `${j.jy}-${String(j.jm).padStart(2, "0")}`;
}
