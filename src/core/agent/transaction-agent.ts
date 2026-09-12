/**
 * ایجنت هوشمند کاشی «معاملات»
 * ------------------------------------------------------
 * تخصص: تحلیل «گزارش تطابق معاملات» سامانه ملک تبریز —
 * روند ماهانه (هجری شمسی)، ترکیب چهارگانه (رویداد/آگهی پیشنهادی/
 * هر دو)، نرخ رساندن درخواست به معامله، قراردادهای دارای هولوگرام
 * و تشخیص ناهنجاری — با یادگیری از بازخورد مدیر.
 */

import { db } from "@/lib/db";
import { BaseLearningAgent, type InsightCard } from "./base-agent";
import {
  detectAnomalies,
  growthRate,
  matchComposition,
  monthlySeries,
  topMonths,
} from "./analyzers";
import { faNumber, faMonthLabel } from "@/lib/format";

export class TransactionAgent extends BaseLearningAgent {
  readonly tileId = "transactions";
  readonly name = "ایجنت تحلیل معاملات";
  readonly insightDomains = ["VOLUME", "TREND", "COMPOSITION", "CONVERSION", "DOCUMENT", "ANOMALY"] as const;

  protected async computeRawInsights(): Promise<InsightCard[]> {
    const txs = await db.transactionRecord.findMany();
    const cards: InsightCard[] = [];
    if (txs.length === 0) return cards;

    const series = monthlySeries(txs);
    const comp = matchComposition(txs);

    // ---- VOLUME: حجم کل ----
    cards.push({
      key: "tx-volume",
      domain: "VOLUME",
      title: "حجم کل معاملات ثبت‌شده",
      body: `در بازه‌ی بررسی، ${faNumber(txs.length)} معامله در «گزارش تطابق معاملات» سامانه ملک تبریز ثبت شده است. هر رکورد نشان‌دهنده‌ی تطبیق یک آگهی ملک با یک درخواست خرید و ثبت قرارداد مربوطه است.`,
      severity: "info",
      metrics: [
        { label: "تعداد کل", value: faNumber(comp.totalCount) },
        { label: "از مسیر درخواست", value: faNumber(txs.filter((t) => t.requestCode).length) },
        { label: "دارای هولوگرام", value: faNumber(txs.filter((t) => t.contractHolo).length) },
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
        title: "روند ماهانه معاملات",
        body:
          growth === null
            ? "داده کافی برای محاسبه روند وجود ندارد."
            : growth >= 0
              ? `تعداد معاملات ${faMonthLabel(last.key)} نسبت به ${faMonthLabel(prev.key)} حدود ${faNumber(Math.abs(growth))}٪ رشد داشته است. اگر این روند ادامه یابد، تمرکز عرضه در ماه‌های آینده منطقی است.`
              : `تعداد معاملات ${faMonthLabel(last.key)} نسبت به ${faMonthLabel(prev.key)} حدود ${faNumber(Math.abs(growth))}٪ کاهش داشته است. پیشنهاد: بررسی علت افت (فصلی‌بودن یا رقیب) و برنامه‌ریزی کمپین فعال‌سازی مشتریان.`,
        severity: growth === null ? "info" : growth >= 10 ? "positive" : growth <= -10 ? "warning" : "info",
        metrics: [
          { label: "رشد ماهانه", value: growth === null ? "—" : `${faNumber(growth)}٪` },
          { label: "معاملات ماه اخیر", value: faNumber(last.count) },
        ],
      });
    }

    // ---- COMPOSITION: ترکیب چهارگانه (عین شاخص‌های خود سامانه) ----
    cards.push({
      key: "tx-composition",
      domain: "COMPOSITION",
      title: "ترکیب رویداد و آگهی پیشنهادی",
      body: `از کل ${faNumber(comp.totalCount)} معامله، ${faNumber(comp.hasRequestEvent)} مورد دارای رویداد (تعامل کارشناس با درخواست)، ${faNumber(comp.hasSuggestedProperty)} مورد دارای آگهی پیشنهادی سیستم و ${faNumber(comp.hasBoth)} مورد هر دو را دارند. ${comp.hasSuggestedProperty / Math.max(1, comp.totalCount) < 0.3 ? "سهم پایین آگهی پیشنهادی نشان می‌دهد موتور تطبیق سیستم کمتر استفاده می‌شود — ارزش بررسی دارد." : "موتور تطبیق سیستم نقش مؤثری در معاملات ایفا می‌کند."}`,
      severity: comp.hasSuggestedProperty / Math.max(1, comp.totalCount) < 0.3 ? "warning" : "positive",
      metrics: [
        { label: "دارای رویداد", value: faNumber(comp.hasRequestEvent) },
        { label: "دارای آگهی پیشنهادی", value: faNumber(comp.hasSuggestedProperty) },
        { label: "دارای هر دو", value: faNumber(comp.hasBoth) },
        { label: "بدون هیچ‌کدام", value: faNumber(comp.neither) },
      ],
    });

    // ---- CONVERSION: نرخ رساندن درخواست به معامله ----
    cards.push({
      key: "tx-conversion",
      domain: "CONVERSION",
      title: "نرخ رساندن درخواست به معامله",
      body: `${faNumber(comp.requestShare)}٪ از معاملات از مسیر «درخواست خرید ثبت‌شده» نهایی شده‌اند؛ ${comp.requestShare < 50 ? "این عدد نشان می‌دهد نیمی از معاملات خارج از چرخه رسمی درخواست‌ها انجام می‌شود — پیگیری درخواست‌های باز توصیه می‌شود." : "چرخه درخواست‌ها تا معامله به‌خوبی عمل می‌کند."}`,
      severity: comp.requestShare < 50 ? "warning" : "positive",
      metrics: [{ label: "سهم معاملات درخواست‌محور", value: `${faNumber(comp.requestShare)}٪` }],
    });

    // ---- DOCUMENT: قراردادهای دارای هولوگرام ----
    if (comp.holoShare < 95 && comp.totalCount >= 10) {
      cards.push({
        key: "tx-document",
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

    // ---- ANOMALY: ناهنجاری‌ها ----
    const anomalies = detectAnomalies(series);
    if (anomalies.length > 0) {
      const a = anomalies[Math.abs(anomalies[0].z) > Math.abs(anomalies[anomalies.length - 1].z) ? 0 : anomalies.length - 1];
      cards.push({
        key: "tx-anomaly",
        domain: "ANOMALY",
        title: "ناهنجاری آماری در روند معاملات",
        body: `ماه ${faMonthLabel(a.key)} با انحراف معیار ${faNumber(Math.abs(a.z))} ${a.direction === "spike" ? "بالاتر" : "پایین‌تر"} از نرمال عمل کرده است (${faNumber(a.count)} معامله). چنین انحرافی معمولاً نشانه‌ی موج معاملاتی، تغییر سیاست سامانه یا رویداد فصلی است و ارزش بررسی دارد.`,
        severity: "critical",
        metrics: [{ label: "انحراف معیار", value: faNumber(a.z) }],
      });
    }

    // ---- ماه‌های اوق (تکمیل تصویر روند) ----
    const peak = topMonths(series, 1);
    if (peak.length > 0 && series.length >= 3) {
      cards.push({
        key: "tx-peak",
        domain: "TREND",
        title: "ماه اوج معاملات",
        body: `پرشمارترین ماهِ ثبت معامله، ${faMonthLabel(peak[0].key)} با ${faNumber(peak[0].count)} معامله بوده است. الگوی فصلی این ماه می‌تواند مبنای برنامه‌ریزی نیروی انسانی و کمپین‌های فروش سال آینده قرار گیرد.`,
        severity: "positive",
        metrics: [{ label: faMonthLabel(peak[0].key), value: `${faNumber(peak[0].count)} معامله` }],
      });
    }

    return cards;
  }
}

export const transactionAgent = new TransactionAgent();
