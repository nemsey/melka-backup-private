/**
 * ایجنت هوشمند یادگیرندهٔ مولتی‌بینش کاشی «آگهی ملک تبریز» (M1 — P6.5-10 + P6526/الف)
 * ------------------------------------------------------
 * تخصص: پایش و تحلیل رجیستری کامل آگهی‌های سامانه ARM ملک تبریز —
 * حجم و ترکیب کاتالوگ، کارشناسان پرآگهی، توزیع منطقه‌ای، پوشش اطلاعات
 * تماس مالک (لایه ۲ غنی‌سازی) و تازگی ثبت آگهی‌ها — با یادگیری از بازخورد مدیر.
 */

import { getPropertyRecordRepository, getVisitRepository, type PropertyRecordRepository, type VisitRepository } from "@/core/repositories";
import { BaseLearningAgent, type InsightCard } from "./base-agent";
import { mostVisitedProperties } from "./analyzers";
import { faNumber } from "@/lib/format";

/** وابستگی‌های تزریق‌پذیر ایجنت کاتالوگ آگهی‌های ARM */
export interface ArmListingAgentDeps {
  property?: PropertyRecordRepository;
  visits?: VisitRepository;
}

/** ردیف سبک برای تحلیل‌ها — فقط فیلدهای لازم */
interface SlimRow {
  realtorName: string | null;
  areaName: string | null;
  ownerName: string | null;
  ownerMobile: string | null;
  createdAt: Date | null;
}

export class ArmListingAgent extends BaseLearningAgent {
  readonly tileId = "arm-listings";
  readonly name = "ایجنت آگهی ملک تبریز";
  /** P6.5-11 (بند ج) — VISIT_ATTENTION از کاشی حذف‌شدهٔ بازدیدها مهاجرت کرد */
  readonly insightDomains = ["VOLUME", "TOP_EXPERTS", "REGION", "COVERAGE", "FRESHNESS", "VISIT_ATTENTION"] as const;

  private readonly repo: PropertyRecordRepository;
  private readonly visitsRepo: VisitRepository;

  constructor(deps?: ArmListingAgentDeps) {
    super();
    this.repo = deps?.property ?? getPropertyRecordRepository();
    this.visitsRepo = deps?.visits ?? getVisitRepository();
  }

  protected async computeRawInsights(): Promise<InsightCard[]> {
    const cards: InsightCard[] = [];
    const [{ total, pending, complete }, sample, visits] = await Promise.all([
      this.repo.countEnrichment(),
      // نمونهٔ تحلیلی ۲۰۰۰ ردیف جدیدترین — سبک و کافی برای بینش‌ها
      this.repo.listArmCatalog({}, 2000),
      this.visitsRepo.findAll(),
    ]);
    if (total === 0) return cards;

    // ---- P6.5-11 (بند ج): VISIT_ATTENTION — آگهی‌های پربازدید (مهاجرت از کاشی بازدیدها) ----
    if (visits.length > 0) {
      const hot = mostVisitedProperties(visits, 3);
      if (hot.length > 0 && hot[0].count >= 2) {
        cards.push({
          key: "al-visit-attention",
          domain: "VISIT_ATTENTION",
          title: "آگهی‌های پربازدید مشتریان (از بازدیدهای مهاجرت‌یافته)",
          body: `آگهی کد «${hot[0].code}» با ${faNumber(hot[0].count)} بازدید، پربازدیدترین آگهی است${hot[1] ? `؛ پس از آن آگهی «${hot[1].code}» با ${faNumber(hot[1].count)} بازدید قرار دارد` : ""}. بازدید مکرر روی یک آگهی یعنی تقاضای متمرکز — اگر فروش نهایی نشده، مذاکرهٔ مجدد با مالک پیشنهاد می‌شود.`,
          severity: "positive",
          metrics: hot.map((h) => ({ label: `کد ${h.code}`, value: `${faNumber(h.count)} بازدید` })),
        });
      }
    }
    const rows: SlimRow[] = sample.rows.map((r) => ({
      realtorName: r.realtorName,
      areaName: r.areaName,
      ownerName: r.ownerName,
      ownerMobile: r.ownerMobile,
      createdAt: r.createdAt,
    }));

    // ---- VOLUME: حجم کاتالوگ ----
    const coveragePct = total > 0 ? Math.round((complete / total) * 1000) / 10 : 0;
    cards.push({
      key: "al-volume",
      domain: "VOLUME",
      title: "حجم رجیستری آگهی‌های ملک تبریز",
      body: `کاتالوگ آگهی‌های سامانه ARM هم‌اکنون ${faNumber(total)} آگهی را در بر می‌گیرد؛ از این تعداد، اطلاعات تماس مالک و آدرس دقیق ${faNumber(complete)} آگهی (${faNumber(coveragePct)}٪) با زنجیرهٔ عین خود سامانه (properties/owner + properties/details) تکمیل شده و ${faNumber(pending)} آگهی در نوبت غنی‌سازی برش‌های بعدی است. فهرست پایه (کد، عنوان، کارشناس، وضعیت، موقعیت) از روز نخست برای همهٔ آگهی‌ها کامل است.`,
      severity: "info",
      metrics: [
        { label: "کل آگهی‌ها", value: faNumber(total) },
        { label: "تکمیل تماس مالک", value: `${faNumber(coveragePct)}٪` },
        { label: "در نوبت غنی‌سازی", value: faNumber(pending) },
      ],
    });

    // ---- TOP_EXPERTS: کارشناسان پرآگهی ----
    const byRealtor = new Map<string, number>();
    for (const r of rows) {
      if (!r.realtorName) continue;
      byRealtor.set(r.realtorName, (byRealtor.get(r.realtorName) ?? 0) + 1);
    }
    const topRealtors = [...byRealtor.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (topRealtors.length > 0) {
      cards.push({
        key: "al-top-experts",
        domain: "TOP_EXPERTS",
        title: "کارشناسان پرآگهی ملک تبریز (۱۰ نفر برتر)",
        body: `در جدیدترین ${faNumber(rows.length)} آگهی، «${topRealtors[0][0]}» با ${faNumber(topRealtors[0][1])} آگهی در صدر قرار دارد و پس از او ${topRealtors
          .slice(1, 10)
          .map(([n, c]) => `«${n}» (${faNumber(c)})`)
          .join(" و ")} آمده‌اند. جدول کامل ۱۰ کارشناسان پرآگهی با سهم هر نفر در همین کاشی (بخش جداول) آمده است. تمرکز بالای فایل‌ها نزد یک کارشناس می‌تواند نشانهٔ قدرت بازاریابی او یا گلوگاه ظرفیت تیم باشد.`,
        severity: "info",
        metrics: topRealtors.map(([n, c]) => ({ label: n, value: faNumber(c) })),
      });
    }

    // ---- REGION: توزیع منطقه‌ای ----
    const byArea = new Map<string, number>();
    for (const r of rows) {
      if (!r.areaName) continue;
      byArea.set(r.areaName, (byArea.get(r.areaName) ?? 0) + 1);
    }
    const topAreas = [...byArea.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (topAreas.length > 0) {
      const share = Math.round((topAreas[0][1] / Math.max(1, rows.length)) * 1000) / 10;
      cards.push({
        key: "al-region",
        domain: "REGION",
        title: "قطب‌های عرضه آگه در مناطق تبریز (۱۰ قطب برتر)",
        body: `منطقهٔ «${topAreas[0][0]}» با ${faNumber(topAreas[0][1])} آگهی (${faNumber(share)}٪ از نمونهٔ جدید) پرآگهی‌ترین منطقهٔ ثبت‌شده در سامانه ARM است؛ ${topAreas
          .slice(1, 10)
          .map(([n, c]) => `«${n}» (${faNumber(c)})`)
          .join(" و ")} در رتبه‌های بعدی‌اند. جدول کامل ۱۰ قطب عرضه با سهم هر منطقه در همین کاشی (بخش جداول) آمده است. تمرکز عرضه در چند منطقه، فرصت تخصصی‌شدن مشاوران و همین‌طور سیگنال تقاضای بازار آن محله‌هاست.`,
        severity: "info",
        metrics: topAreas.map(([n, c]) => ({ label: n, value: faNumber(c) })),
      });
    }

    // ---- COVERAGE: پوشش اطلاعات تماس مالک ----
    if (sample.rows.length > 0) {
      const enrichedSample = sample.rows.filter((r) => r.enrichedAt);
      if (enrichedSample.length > 0) {
        const withMobile = enrichedSample.filter((r) => r.ownerMobile).length;
        const mobilePct = Math.round((withMobile / enrichedSample.length) * 1000) / 10;
        const withoutName = enrichedSample.filter((r) => !r.ownerName).length;
        cards.push({
          key: "al-coverage",
          domain: "COVERAGE",
          title: "کیفیت اطلاعات تماس مالکان در سامانه ARM",
          body: `در ${faNumber(enrichedSample.length)} آگهی غنی‌سازی‌شده، ${faNumber(mobilePct)}٪ شماره تماس مالک و ${faNumber(enrichedSample.length - withoutName)} مورد نام و نام خانوادگی مالک دارند. آگهی‌های بدون شماره تماس معمولاً از ثبت ناقص اطلاعات مشتری در فرم ثبت آگیهای سامانه می‌آیند؛ پیگیری تکمیل آن‌ها توسط کارشناس مسؤول، نرخ تبدیل تماس را بالا می‌برد.`,
          severity: mobilePct < 70 ? "warning" : "positive",
          metrics: [
            { label: "دارای شماره تماس", value: `${faNumber(mobilePct)}٪` },
            { label: "دارای نام مالک", value: faNumber(enrichedSample.length - withoutName) },
          ],
        });
      }
    }

    // ---- FRESHNESS: تازگی ثبت آگهی‌ها ----
    const now = Date.now();
    const dayMs = 86400_000;
    const today = rows.filter((r) => r.createdAt && now - r.createdAt.getTime() < dayMs).length;
    const week = rows.filter((r) => r.createdAt && now - r.createdAt.getTime() < 7 * dayMs).length;
    cards.push({
      key: "al-freshness",
      domain: "FRESHNESS",
      title: "تازگی جریان ثبت آگهی",
      body: `در ۲۴ ساعت گذشته ${faNumber(today)} آگهی جدید و در هفت روز گذشته ${faNumber(week)} آگهی در سامانه ARM ثبت شده است. با هر بار «بروزرسانی از سامانه»، فهرست تازه و آگهی‌های جدید با کد و کارشناس مسؤول به کاتالوگ اضافه می‌شوند؛ غنی‌سازی تماس مالک جدیدترین‌ها هم خودکار در اولویت است.`,
      severity: "info",
      metrics: [
        { label: "آگهی امروز", value: faNumber(today) },
        { label: "آگهی هفته", value: faNumber(week) },
      ],
    });

    return cards;
  }
}

export const armListingAgent = new ArmListingAgent();
