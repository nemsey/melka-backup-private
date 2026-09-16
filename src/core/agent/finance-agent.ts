/**
 * ایجنت هوشمند کاشی «مالی و کمیسیون»
 * ------------------------------------------------------
 * تخصص: تحلیل مالی قراردادها — تعرفه زنده اتحادیه، تجمیع حق‌السهم
 * مشاوران و شعبه‌ها، پیش‌بینی درآمد از قراردادهای در جریان و
 * شفافیت تسویه‌حساب — با یادگیری از بازخورد مدیر.
 */

import { getContractRepository, getExpertRepository, getMarketRepository, type ContractRepository, type ExpertRepository, type MarketRepository } from "@/core/repositories";
import { BaseLearningAgent, type InsightCard } from "./base-agent";
import { getCachedCommissionConfig } from "@/lib/melk-api/sync";
import { saleCommissionBase } from "@/lib/melk-api/commission";
import type { ContractRealtorShare } from "@/lib/melk-api/types";
import { faNumber, faPercent, faToman } from "@/lib/format";

function parseShares(raw: string | null | undefined): ContractRealtorShare[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ContractRealtorShare[];
  } catch {
    return [];
  }
}

/** وابستگی‌های تزریق‌پذیر ایجنت مالی */
export interface FinanceAgentDeps {
  contracts?: ContractRepository;
  experts?: ExpertRepository;
  market?: MarketRepository;
  /** تزریق تابع فقط-کش تعرفه (تست — بدون HTTP) */
  commissionConfig?: typeof getCachedCommissionConfig;
}

export class FinanceAgent extends BaseLearningAgent {
  readonly tileId = "finance-commission";
  readonly name = "ایجنت تحلیل مالی و کمیسیون";
  readonly insightDomains = ["TARIFF", "REVENUE", "SETTLEMENT", "BRANCH", "PIPELINE"] as const;

  private readonly contracts: ContractRepository;
  private readonly expertsRepo: ExpertRepository;
  private readonly market: MarketRepository;
  private readonly loadCommissionConfig: typeof getCachedCommissionConfig;

  constructor(deps?: FinanceAgentDeps) {
    super();
    this.contracts = deps?.contracts ?? getContractRepository();
    this.expertsRepo = deps?.experts ?? getExpertRepository();
    this.market = deps?.market ?? getMarketRepository();
    this.loadCommissionConfig = deps?.commissionConfig ?? getCachedCommissionConfig;
  }

  protected async computeRawInsights(): Promise<InsightCard[]> {
    const cards: InsightCard[] = [];

    // ---- TARIFF: تعرفه اتحادیه — فقط از کش (E.2: مسیر بینش هرگز HTTP زنده ندارد) ----
    const { configs, liveError } = await this.loadCommissionConfig();
    const tabriz = configs.find((c) => c.cityName.includes("تبریز")) ?? configs[0];
    if (tabriz) {
      cards.push({
        key: "finance-tariff",
        domain: "TARIFF",
        title: `تعرفه رسمی اتحادیه مشاورین املاک ${tabriz.cityName}`,
        body: `تعرفه زنده از سامانه مالی ملک تبریز دریافت شده است: خرید و فروش تا سقف ۷۰۰ میلیون تومان نیم درصد و مازاد آن بیست‌وپنج صدم درصد از هر طرف؛ اجاره یک درصد رهن به اضافه یک‌چهارم اجاره ماه اول از هر طرف. مالیات ارزش افزوده ${faPercent(tabriz.valueAddedPercentage)} به کمیسیون هر طرف افزوده می‌شود.`,
        severity: "info",
        metrics: [
          { label: "نوع‌های معامله", value: faNumber(tabriz.detail.length) },
          { label: "مالیات ارزش افزوده", value: faPercent(tabriz.valueAddedPercentage) },
        ],
      });
    } else if (liveError) {
      cards.push({
        key: "finance-tariff-error",
        domain: "TARIFF",
        title: "تعرفه اتحادیه در دسترس نیست",
        body: `دریافت تعرفه زنده از سامانه مالی موفق نبود: ${liveError} محاسبه‌گر داشبورد با قواعد رسمی تعرفه تبریز (کشف‌شده از نرخ‌نامه) همچنان کار می‌کند.`,
        severity: "warning",
      });
    }

    const contracts = await this.contracts.findAll();
    if (contracts.length === 0) {
      if (cards.length > 0) return cards;
      return [
        {
          key: "finance-empty",
          domain: "REVENUE",
          title: "داده مالی قراردادها در انتظار همگام‌سازی",
          body: "پس از ورود با «کد پرسنلی + پیامک»، صورت وضعیت‌های سامانه ARM استخراج و تحلیل‌های مالی (حق‌السهم، شعبه‌ها، پیش‌بینی درآمد) به‌طور خودکار فعال می‌شوند. محاسبه‌گر کمیسیون همین حالا با تعرفه زنده اتحادیه کار می‌کند.",
          severity: "info",
        },
      ];
    }

    const total = contracts.length;
    const FINALIZED = ["confirmedByFinance", "waitingForDocument", "finished", "payed"];
    const finalized = contracts.filter((c) => FINALIZED.includes(c.status));
    const inPipeline = contracts.filter((c) => c.status.startsWith("waitingFor"));

    // ---- REVENUE: تجمیع حق‌السهم ----
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
      key: "finance-revenue",
      domain: "REVENUE",
      title: "حق‌السهم قراردادهای رسیده به مرحله مالی",
      body: `${faNumber(finalized.length)} قرارداد از ${faNumber(total)} به مرحله مالی رسیده‌اند و ${faNumber(consultantMap.size)} مشاور در آن‌ها سهم دارند. میانگین سهم هر مشاور در هر قرارداد ${faPercent(
        consultantMap.size > 0 ? Math.round((([...consultantMap.values()].reduce((s, e) => s + e.totalPercent, 0) / consultantMap.size)) * 10) / 10 : 0
      )} است. تسویه شفاف بر پایه همین تفکیک انجام می‌شود.`,
      severity: "info",
      metrics: [
        { label: "قراردادهای مرحله مالی", value: faNumber(finalized.length) },
        { label: "مشاوران دارای سهم", value: faNumber(consultantMap.size) },
      ],
    });

    // ---- SETTLEMENT: تسویه‌حساب ----
    const pendingConfirm = contracts
      .filter((c) => c.status === "waitingForRealtors")
      .flatMap((c) => parseShares(c.realtorListJson))
      .filter((s) => s.confirmation !== "confirm");
    if (pendingConfirm.length > 0) {
      cards.push({
        key: "finance-settlement",
        domain: "SETTLEMENT",
        title: "تأییدهای باز حق‌السهم",
        body: `${faNumber(pendingConfirm.length)} سهم مشاوران هنوز تأیید نشده است — تا تکمیل تأییدها، قراردادها به مرحله مالی نمی‌رسند و جریان درآمد متوقف می‌ماند. پیگیری شخصی مشاوران دارای سهم باز توصیه می‌شود.`,
        severity: pendingConfirm.length >= 3 ? "warning" : "info",
        metrics: [{ label: "سهم‌های در انتظار تأیید", value: faNumber(pendingConfirm.length) }],
      });
    }

    // ---- BRANCH: مقایسه شعبه‌ها ----
    const experts = await this.expertsRepo.findAll();
    const expertBranch = new Map(experts.map((e) => [e.fullName, e.businessTitle || "بدون شعبه"]));
    const branchMap = new Map<string, number>();
    for (const c of finalized) {
      const branches = new Set(parseShares(c.realtorListJson).map((s) => expertBranch.get(s.name) ?? "خارج از شعبه‌ها"));
      for (const b of branches) branchMap.set(b, (branchMap.get(b) ?? 0) + 1);
    }
    if (branchMap.size >= 2) {
      const sorted = [...branchMap.entries()].sort((a, b) => b[1] - a[1]);
      const [topBranch, topCount] = sorted[0];
      const [lowBranch, lowCount] = sorted[sorted.length - 1];
      cards.push({
        key: "finance-branch",
        domain: "BRANCH",
        title: "مقایسه عملکرد مالی شعبه‌ها",
        body: `${faNumber(sorted.length)} شعبه در قراردادهای مالی فعال‌اند. پیشتاز: «${topBranch}» با ${faNumber(topCount)} قرارداد و انتهایی: «${lowBranch}» با ${faNumber(lowCount)} قرارداد. فاصله ${faNumber(topCount - lowCount)} قراردادی — بررسی منابع و الگوی موفق شعبه پیشتاز توصیه می‌شود.`,
        severity: "info",
        metrics: sorted.slice(0, 3).map(([branch, count]) => ({ label: branch, value: `${faNumber(count)} قرارداد` })),
      });
    }

    // ---- PIPELINE: پیش‌بینی درآمد ----
    if (inPipeline.length > 0) {
      // برآورد کمیسیون پایه نمونه بر پایه معیار تعرفه (میانگین ثمن معامله نمونه بازار تبریز)
      const sampleAds = await this.market.listAdPrices(200);
      const avgPrice = sampleAds.length > 0 ? sampleAds.reduce((s, a) => s + (a.price ?? 0), 0) / sampleAds.length : 0;
      if (avgPrice > 0) {
        const baseCommission = saleCommissionBase(avgPrice) * 2; // هر دو طرف
        const projected = inPipeline.length * baseCommission;
        cards.push({
          key: "finance-pipeline",
          domain: "PIPELINE",
          title: "پیش‌بینی درآمد قراردادهای در جریان",
          body: `${faNumber(inPipeline.length)} قرارداد در مراحل انتظار است. با میانگین ثمن معامله ${faToman(avgPrice)} (از داده واقعی بازار) و تعرفه اتحادیه، کمیسیون پایه هر قرارداد حدود ${faToman(baseCommission)} (هر دو طرف) برآورد می‌شود — پتانسیل درآمد ${faToman(projected)} در صورت نهایی‌شدن همه موارد. این برآورد راهنمای برنامه‌ریزی جریان نقدی است.`,
          severity: "info",
          metrics: [
            { label: "قرارداد در جریان", value: faNumber(inPipeline.length) },
            { label: "برآورد کمیسیون هر قرارداد", value: faToman(baseCommission) },
            { label: "پتانسیل کل", value: faToman(projected) },
          ],
        });
      }
    }

    return cards;
  }
}

export const financeAgent = new FinanceAgent();
