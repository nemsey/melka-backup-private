/**
 * ایجنت هوشمند کاشی «استخراج اطلاعات»
 * ------------------------------------------------------
 * تخصص: پایش و تحلیل استعلام‌های زنده از سامانه واقعی ملک تبریز —
 * کیفیت داده استخراج‌شده (نبود شماره تماس/آدرس)، پوشش دو مسیر
 * (کدآگهی/کددرخواست)، الگوی استعلام کاربران و نظارت امنیتی
 * (استعلام‌های مکرر/مهمان) — با یادگیری از بازخورد مدیر.
 */

import { getOutcomeRepository, type OutcomeRepository } from "@/core/repositories";
import { BaseLearningAgent, type InsightCard } from "./base-agent";
import { lookupStats } from "./analyzers";
import { faNumber } from "@/lib/format";

/** وابستگی‌های تزریق‌پذیر ایجنت استخراج اطلاعات */
export interface ExtractionAgentDeps {
  outcomes?: OutcomeRepository;
}

export class ExtractionAgent extends BaseLearningAgent {
  readonly tileId = "extraction";
  readonly name = "ایجنت استخراج اطلاعات";
  readonly insightDomains = ["LOOKUP", "COVERAGE", "QUALITY", "SECURITY"] as const;

  private readonly outcomes: OutcomeRepository;

  constructor(deps?: ExtractionAgentDeps) {
    super();
    this.outcomes = deps?.outcomes ?? getOutcomeRepository();
  }

  protected async computeRawInsights(): Promise<InsightCard[]> {
    const logs = await this.outcomes.listRecentLookups(500);
    const cards: InsightCard[] = [];
    if (logs.length === 0) return cards;

    const stats = lookupStats(logs);

    // ---- LOOKUP: حجم و نتیجه استعلام‌ها ----
    cards.push({
      key: "lk-volume",
      domain: "LOOKUP",
      title: "حجم استعلام‌های استخراج اطلاعات",
      body: `تا این لحظه ${faNumber(stats.total)} استعلام زنده از سامانه ملک تبریز انجام شده است که ${faNumber(stats.found)} مورد یافته (${faNumber(stats.successRate)}٪ موفق) و ${faNumber(stats.notFound)} مورد بدون نتیجه بوده است. هر استعلام مستقیماً از «سامانه مدیریت آگهی و درخواست» (آرم) و بدون واسطه کش انجام می‌شود؛ بنابراین این آمار، تصویر دقیقی از جریان کار روزانه شماست.`,
      severity: "info",
      metrics: [
        { label: "کل استعلام‌ها", value: faNumber(stats.total) },
        { label: "نرخ موفقیت", value: `${faNumber(stats.successRate)}٪` },
        { label: "استعلام امروز", value: faNumber(stats.recentToday) },
      ],
    });

    // ---- COVERAGE: پوشش دو مسیر ----
    cards.push({
      key: "lk-coverage",
      domain: "COVERAGE",
      title: "پوشش دو مسیر استعلام (کدآگهی / کددرخواست)",
      body: `${faNumber(stats.propertyLookups)} استعلام از مسیر «کدآگهی» (اطلاعات مالک و آدرس ملک) و ${faNumber(stats.requestLookups)} استعلام از مسیر «کددرخواست» (اطلاعات درخواست‌دهنده) انجام شده است. ${
        stats.propertyLookups > 0 && stats.requestLookups === 0
          ? "مسیر «کددرخواست» هنوز استفاده نشده است — این مسیر برای پیگیری مشتریان درخواست‌دهنده ارزشمند است."
          : stats.requestLookups > 0 && stats.propertyLookups === 0
            ? "مسیر «کدآگهی» هنوز استفاده نشده است — با کدآگهی می‌توانید نام و شماره تماس مالک و آدرس ملک را دریافت کنید."
            : "هر دو مسیر در جریان کاری شما استفاده می‌شوند — استفاده متعادل از هر دو مسیر، دید کاملی از طرفین معامله می‌دهد."
      }`,
      severity: "info",
      metrics: [
        { label: "استعلام کدآگهی", value: faNumber(stats.propertyLookups) },
        { label: "استعلام کددرخواست", value: faNumber(stats.requestLookups) },
      ],
    });

    // ---- QUALITY: کیفیت داده سامانه ----
    if (stats.missingMobile > 0) {
      const missingShare = Math.round((stats.missingMobile / Math.max(1, stats.found)) * 1000) / 10;
      cards.push({
        key: "lk-quality",
        domain: "QUALITY",
        title: "رکوردهای دارای نقص اطلاعات تماس",
        body: `در ${faNumber(stats.missingMobile)} استعلام موفق (${faNumber(missingShare)}٪ از یافته‌ها)، شماره تماس در سامانه ملک تبریز ثبت نشده بود. این الگو معمولاً به معنای ثبت ناقص اطلاعات مشتری/مالک در مراحل «ثبت آگهی» یا «ثبت درخواست» توسط کارشناس است. پیشنهاد: در جلسات آموزشی، تکمیل شماره تماس در فرم‌های سامانه الزامی اعلام شود.`,
        severity: missingShare >= 30 ? "warning" : "info",
        metrics: [
          { label: "بدون شماره تماس", value: faNumber(stats.missingMobile) },
          { label: "سهم از یافته‌ها", value: `${faNumber(missingShare)}٪` },
        ],
      });
    }

    // ---- SECURITY: نظارت امنیتی ----
    const repeated = stats.topCodes.filter((c) => c.count >= 3);
    if (repeated.length > 0) {
      const top = repeated[0];
      cards.push({
        key: "lk-security",
        domain: "SECURITY",
        title: "استعلام‌های مکرر (نظارت امنیتی)",
        body: `کد «${top.code}» (${top.kind === "PROPERTY" ? "کدآگهی" : "کددرخواست"}) ${faNumber(top.count)} بار استعلام شده است. استعلام مکرر می‌تواند طبیعی (پیگیری کاری) یا نشانه‌ی دسترسی غیرمجاز باشد. همه استعلام‌ها با کد پرسنلی انجام‌دهنده در گزارش استعلام ثبت می‌شوند و قابل ردیابی‌اند.`,
        severity: top.count >= 6 ? "warning" : "info",
        metrics: [{ label: "تکرار کد پرتکرار", value: `${faNumber(top.count)} بار` }],
      });
    }

    // ---- LOOKUP: پرتکرارترین کدها (کارت تکمیلی) ----
    if (stats.topCodes.length > 0 && stats.topCodes[0].count >= 2) {
      const list = stats.topCodes
        .slice(0, 3)
        .map((c) => `«${c.code}» (${faNumber(c.count)} بار)`)
        .join("، ");
      cards.push({
        key: "lk-hotcodes",
        domain: "LOOKUP",
        title: "کدهای پراستعلام",
        body: `پرتکرارترین کدهای استعلام‌شده: ${list}. این کدها معمولاً پرونده‌های حساس یا در حال مذاکره‌اند — ارزش اولویت‌بندی در پیگیری دارند.`,
        severity: "info",
        metrics: stats.topCodes.slice(0, 3).map((c) => ({ label: c.code, value: `${faNumber(c.count)} بار` })),
      });
    }

    return cards;
  }
}

export const extractionAgent = new ExtractionAgent();
