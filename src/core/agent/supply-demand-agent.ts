/**
 * ایجنت هوشمند کاشی «عرضه و تقاضا»
 * ------------------------------------------------------
 * تخصص: تحلیل «گزارش عرضه و تقاضا» سامانه ملک تبریز —
 * تعادل بازار (عرضه آگهی × فشار تقاضا)، بازه‌های گرم و سرد،
 * و هدایت قیمت‌گذاری آگهی‌های جدید — با یادگیری از بازخورد مدیر.
 */

import { getMarketRepository, type MarketRepository } from "@/core/repositories";
import { BaseLearningAgent, type InsightCard } from "./base-agent";
import { supplyDemandStats } from "./analyzers";
import { faNumber } from "@/lib/format";

/** وابستگی‌های تزریق‌پذیر ایجنت عرضه و تقاضا */
export interface SupplyDemandAgentDeps {
  market?: MarketRepository;
}

export class SupplyDemandAgent extends BaseLearningAgent {
  readonly tileId = "supply-demand";
  readonly name = "ایجنت تحلیل عرضه و تقاضا";
  readonly insightDomains = ["BALANCE", "PRESSURE", "STRATEGY"] as const;

  private readonly market: MarketRepository;

  constructor(deps?: SupplyDemandAgentDeps) {
    super();
    this.market = deps?.market ?? getMarketRepository();
  }

  protected async computeRawInsights(): Promise<InsightCard[]> {
    const rows = await this.market.listSupplyDemand();
    const cards: InsightCard[] = [];
    if (rows.length === 0) return cards;

    const stats = supplyDemandStats(rows);

    // ---- BALANCE: تعادل کلی بازار ----
    const balanceVerdict =
      stats.avgRequestPercent >= 60
        ? "بازار به‌طور واضح تقاضامحور است — خریداران بیش از عرضه فعال‌اند"
        : stats.avgRequestPercent >= 40
          ? "بازار نسبتاً متعادل است — عرضه و تقاضا هم‌وزن‌اند"
          : "بازار عرضه‌محور است — عرضه از تقاضا پیشی دارد";
    cards.push({
      key: "sd-balance",
      domain: "BALANCE",
      title: "تعادل کلی بازار ملک تبریز",
      body: `میانگین درصد درخواست در ${faNumber(stats.rangeCount)} بازه قیمت، ${faNumber(stats.avgRequestPercent)}٪ است. ${balanceVerdict}. این شاخص از «گزارش عرضه و تقاضا» خود سامانه آرم استخراج می‌شود و مبنای هدایت قیمت‌گذاری آگهی‌های جدید است.`,
      severity: "info",
      metrics: [
        { label: "شاخص تعادل", value: `${faNumber(stats.avgRequestPercent)}٪` },
        { label: "تعداد بازه‌ها", value: faNumber(stats.rangeCount) },
        { label: "مجموع آگهی‌ها", value: faNumber(stats.totalAds) },
      ],
    });

    // ---- PRESSURE: بازه‌های با فشار تقاضای بالا ----
    if (stats.highDemand.length > 0 && stats.topDemand) {
      cards.push({
        key: "sd-pressure",
        domain: "PRESSURE",
        title: "بازه‌های با فشار تقاضای بالا",
        body: `بازه «${stats.topDemand.rangeTitle}» با ${faNumber(stats.topDemand.requestPercent)}٪ درخواست، گرم‌ترین بازه بازار است${stats.highDemand.length > 1 ? ` و در مجموع ${faNumber(stats.highDemand.length)} بازه در وضعیت تقاضای بالا (بالای ۶۰٪) قرار دارند` : ""}. در بازه‌های گرم: پاسخ سریع به درخواست‌ها و اجازه قیمت‌گذاری تهاجمی‌تر برای آگهی‌های همین بازه منطقی است.`,
        severity: stats.topDemand.requestPercent >= 80 ? "positive" : "info",
        metrics: [
          { label: "گرم‌ترین بازه", value: stats.topDemand.rangeTitle },
          { label: "درصد درخواست", value: `${faNumber(stats.topDemand.requestPercent)}٪` },
          { label: "آگهی‌های همین بازه", value: faNumber(stats.topDemand.propertyCount) },
        ],
      });
    }

    // ---- STRATEGY: بازه‌های کم‌تقاضا (پرریسک) ----
    if (stats.lowDemand.length > 0) {
      const coldest = [...stats.lowDemand].sort((a, b) => a.requestPercent - b.requestPercent)[0];
      cards.push({
        key: "sd-strategy",
        domain: "STRATEGY",
        title: "بازه‌های کم‌تقاضا — ریسک ماندگاری آگهی",
        body: `بازه «${coldest.rangeTitle}» فقط ${faNumber(coldest.requestPercent)}٪ درخواست دارد و در مجموع ${faNumber(stats.lowDemand.length)} بازه در وضعیت تقاضای پایین (زیر ۲۵٪)‌اند. آگهی‌های این بازه ریسک ماندگاری طولانی دارند؛ پیشنهاد: قیمت‌گذاری رقابتی‌تر، بازبینی دوره‌ای و اولویت‌دادن بازاریابی به بازه‌های گرم.`,
        severity: "warning",
        metrics: [
          { label: "سردترین بازه", value: coldest.rangeTitle },
          { label: "درصد درخواست", value: `${faNumber(coldest.requestPercent)}٪` },
        ],
      });
    }

    // ---- STRATEGY: بازه با بیشترین عرضه ----
    if (stats.topSupply) {
      const supplyShare = Math.round((stats.topSupply.propertyCount / Math.max(1, stats.totalAds)) * 1000) / 10;
      cards.push({
        key: "sd-supply",
        domain: "STRATEGY",
        title: "تمرکز عرضه در بازه پرآگهی",
        body: `بازه «${stats.topSupply.rangeTitle}» با ${faNumber(stats.topSupply.propertyCount)} آگهی (${faNumber(supplyShare)}٪ از کل عرضه) پرعرضه‌ترین بازه است. تمرکز عرضه در یک بازه یعنی رقابت شدید همان‌جا — تمایز کیفیت آگهی (عکس، توضیح، قیمت دقیق) اهرم اصلی دیده‌شدن است.`,
        severity: supplyShare >= 40 ? "warning" : "info",
        metrics: [
          { label: "پرعرضه‌ترین بازه", value: stats.topSupply.rangeTitle },
          { label: "تعداد آگهی", value: faNumber(stats.topSupply.propertyCount) },
          { label: "سهم از کل عرضه", value: `${faNumber(supplyShare)}٪` },
        ],
      });
    }

    return cards;
  }
}

export const supplyDemandAgent = new SupplyDemandAgent();
