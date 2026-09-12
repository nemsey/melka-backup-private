/**
 * ایجنت هوشمند کاشی «معاملات»
 * ------------------------------------------------------
 * تخصص: تحلیل معاملات، روند بازار، عملکرد کارشناسان معامله‌گر،
 * توزیع محله‌ای و تشخیص ناهنجاری — با یادگیری از بازخورد مدیر.
 */

import { db } from "@/lib/db";
import { BaseLearningAgent, type InsightCard } from "./base-agent";
import {
  concentrationIndex,
  conversionRate,
  detectAnomalies,
  growthRate,
  groupBy,
  monthlySeries,
  topByValue,
  expertStats,
} from "./analyzers";
import { faToman, faMonthLabel } from "@/lib/format";

/** قالب‌بندی مبالغ تومانی خوانا با ارقام فارسی */
export const toman = faToman;

/** برچسب ماه شمسی */
const monthLabel = faMonthLabel;

export class TransactionAgent extends BaseLearningAgent {
  readonly tileId = "transactions";
  readonly name = "ایجنت تحلیل معاملات";
  readonly insightDomains = ["TREND", "VOLUME", "TOP_EXPERTS", "DISTRICT", "ANOMALY", "CONVERSION"] as const;

  protected async computeRawInsights(): Promise<InsightCard[]> {
    const txs = await db.transactionRecord.findMany();
    const cards: InsightCard[] = [];
    if (txs.length === 0) return cards;

    const series = monthlySeries(txs);
    const totalValue = txs.reduce((a, t) => a + t.price, 0);
    const totalCommission = txs.reduce((a, t) => a + t.commission, 0);

    // ---- VOLUME: حجم کل ----
    cards.push({
      key: "tx-volume",
      domain: "VOLUME",
      title: "حجم کل معاملات",
      body: `در بازه‌ی بررسی، ${txs.length.toLocaleString("fa-IR")} معامله به ارزش کل ${toman(totalValue)} ثبت شده است. مجموع کمیسیون دریافتی ${toman(totalCommission)} است.`,
      severity: "info",
      metrics: [
        { label: "تعداد", value: txs.length.toLocaleString("fa-IR") },
        { label: "ارزش کل", value: toman(totalValue) },
        { label: "میانگین هر معامله", value: toman(Math.round(totalValue / txs.length)) },
      ],
    });

    // ---- TREND: روند ماهانه ----
    const growth = growthRate(series);
    if (series.length >= 2) {
      const last = series[series.length - 1];
      const prev = series[series.length - 2];
      cards.push({
        key: "tx-trend",
        domain: "TREND",
        title: "روند ماهانه بازار",
        body:
          growth === null
            ? "داده کافی برای محاسبه روند وجود ندارد."
            : growth >= 0
              ? `ارزش معاملات ${monthLabel(last.key)} نسبت به ${monthLabel(prev.key)} حدود ${Math.abs(growth).toLocaleString("fa-IR")}٪ رشد داشته است. اگر این روند ادامه یابد، تمرکز عرضه در ماه‌های آینده منطقی است.`
              : `ارزش معاملات ${monthLabel(last.key)} نسبت به ${monthLabel(prev.key)} حدود ${Math.abs(growth).toLocaleString("fa-IR")}٪ کاهش داشته است. پیشنهاد: بررسی علت افت (فصلی‌بودن یا رقیب) و برنامه‌ریزی کمپین فعال‌سازی مشتریان.`,
        severity: growth === null ? "info" : growth >= 10 ? "positive" : growth <= -10 ? "warning" : "info",
        metrics: [
          { label: "رشد ماهانه", value: growth === null ? "—" : `${growth.toLocaleString("fa-IR")}٪` },
          { label: "معاملات ماه اخیر", value: last.count.toLocaleString("fa-IR") },
        ],
      });
    }

    // ---- TOP_EXPERTS: برترین کارشناسان ----
    const stats = expertStats(txs);
    const top3 = topByValue(stats, 3);
    if (top3.length > 0) {
      cards.push({
        key: "tx-top-experts",
        domain: "TOP_EXPERTS",
        title: "کارشناسان برتر از نظر ارزش معاملات",
        body: `سه کارشناس اول ${toman(top3.reduce((a, s) => a + s.totalValue, 0))} از کل ${toman(totalValue)} (سهم ${concentrationIndex(stats, 3).toLocaleString("fa-IR")}٪) را رقم زده‌اند. الگوی فروش این کارشناسان قابل الگوبرداری برای آموزش سایرین است.`,
        severity: "info",
        metrics: top3.map((s, i) => ({ label: `رتبه ${(i + 1).toLocaleString("fa-IR")}`, value: `${s.expertName} — ${s.dealCount.toLocaleString("fa-IR")} معامله` })),
      });
    }

    // ---- DISTRICT: محله‌های پربار ----
    const districts = groupBy(txs, (t) => t.district);
    const topDistricts = districts.slice(0, 3);
    if (topDistricts.length > 0) {
      cards.push({
        key: "tx-district",
        domain: "DISTRICT",
        title: "محله‌های پیشتاز در ارزش معاملات",
        body: `${topDistricts.map((d) => d.name).join("، ")} بالاترین ارزش معاملاتی را دارند. محله «${topDistricts[0].name}» با میانگین ${toman(topDistricts[0].avgPrice)} در هر معامله صدرنشین است.`,
        severity: "info",
        metrics: topDistricts.map((d) => ({ label: d.name, value: `${d.count.toLocaleString("fa-IR")} معامله — ${toman(d.totalValue)}` })),
      });
    }

    // ---- ANOMALY: ناهنجاری‌ها ----
    const anomalies = detectAnomalies(series);
    if (anomalies.length > 0) {
      const a = anomalies[Math.abs(anomalies[0].z) > Math.abs(anomalies[anomalies.length - 1].z) ? 0 : anomalies.length - 1];
      cards.push({
        key: "tx-anomaly",
        domain: "ANOMALY",
        title: "ناهنجاری آماری در روند معاملات",
        body: `ماه ${monthLabel(a.key)} با انحراف معیار ${Math.abs(a.z).toLocaleString("fa-IR")} ${a.direction === "spike" ? "بالاتر" : "پایین‌تر"} از نرمال عمل کرده است (${toman(a.totalValue)}). چنین انحرافی معمولاً نشانه‌ی معاملات کلان، تغییر قیمت بازار یا رویداد فصلی است و ارزش بررسی دارد.`,
        severity: "critical",
        metrics: [{ label: "Z-Score", value: a.z.toLocaleString("fa-IR") }],
      });
    }

    // ---- CONVERSION: نرخ تبدیل ----
    const conv = conversionRate(txs);
    cards.push({
      key: "tx-conversion",
      domain: "CONVERSION",
      title: "نرخ تبدیل درخواست به معامله",
      body: `${conv.toLocaleString("fa-IR")}٪ از معاملات از مسیر «درخواست خرید ثبت‌شده» نهایی شده‌اند؛ ${conv < 50 ? "این عدد نشان می‌دهد نیمی از معاملات خارج از چرخه رسمی درخواست‌ها انجام می‌شود — پیگیری درخواست‌های باز توصیه می‌شود." : "چرخه درخواست‌ها تا معامله به‌خوبی عمل می‌کند."}`,
      severity: conv < 50 ? "warning" : "positive",
      metrics: [{ label: "نرخ تبدیل", value: `${conv.toLocaleString("fa-IR")}٪` }],
    });

    return cards;
  }
}

export const transactionAgent = new TransactionAgent();
