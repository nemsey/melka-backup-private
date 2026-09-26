/**
 * ایجنت هوشمند یادگیرندهٔ مولتی‌بینش کاشی «درخواست ملک تبریز» (M2 — P6.5-10 + P6526/الف)
 * ------------------------------------------------------
 * تخصص: پایش و تحلیل کاتالوگ کامل درخواست‌های سامانه ARM ملک تبریز —
 * حجم و جریان درخواست‌ها، کارشناسان فعال ثبت، پوشش اطلاعات تماس
 * درخواست‌دهندگان (لایه ۲ غنی‌سازی)، ترکیب وضعیت‌ها و تازگی ثبت —
 * با یادگیری از بازخورد مدیر.
 */

import { getRequestRepository, type RequestRepository } from "@/core/repositories";
import { BaseLearningAgent, type InsightCard } from "./base-agent";
import { faNumber } from "@/lib/format";

/** وابستگی‌های تزریق‌پذیر ایجنت کاتالوگ درخواست‌های ARM */
export interface ArmRequestAgentDeps {
  request?: RequestRepository;
}

/** ردیف سبک برای تحلیل‌ها — فقط فیلدهای لازم */
interface SlimRow {
  actorName: string | null;
  customerName: string | null;
  customerMobile: string | null;
  status: string | null;
  createdAt: Date | null;
}

export class ArmRequestAgent extends BaseLearningAgent {
  readonly tileId = "arm-requests";
  readonly name = "ایجنت درخواست ملک تبریز";
  readonly insightDomains = ["VOLUME", "TOP_EXPERTS", "COMPOSITION", "COVERAGE", "FRESHNESS"] as const;

  private readonly repo: RequestRepository;

  constructor(deps?: ArmRequestAgentDeps) {
    super();
    this.repo = deps?.request ?? getRequestRepository();
  }

  protected async computeRawInsights(): Promise<InsightCard[]> {
    const cards: InsightCard[] = [];
    const [{ total, pending, complete }, sample] = await Promise.all([
      this.repo.countArmEnrichment(),
      // نمونهٔ تحلیلی ۲۰۰۰ ردیف جدیدترین — سبک و کافی برای بینش‌ها
      this.repo.listArmCatalog({}, 2000),
    ]);
    if (total === 0) return cards;
    const rows: SlimRow[] = sample.rows.map((r) => ({
      actorName: r.actorName,
      customerName: r.customerName,
      customerMobile: r.customerMobile,
      status: r.status,
      createdAt: r.createdAt,
    }));

    // ---- VOLUME: حجم کاتالوگ ----
    const coveragePct = total > 0 ? Math.round((complete / total) * 1000) / 10 : 0;
    cards.push({
      key: "ar-volume",
      domain: "VOLUME",
      title: "حجم کاتالوگ درخواست‌های ملک تبریز",
      body: `کاتالوگ درخواست‌های سامانه ARM هم‌اکنون ${faNumber(total)} درخواست را در بر می‌گیرد؛ اطلاعات تماس درخواست‌دهنده (نام کامل و شماره موبایل) برای ${faNumber(complete)} درخواست (${faNumber(coveragePct)}٪) با زنجیرهٔ عین خود سامانه (requests/applicant) تکمیل شده و ${faNumber(pending)} درخواست در نوبت برش‌های بعدی است. نام خانوادگی درخواست‌دهنده از روز نخست برای همهٔ ردیف‌ها از خود فهرست ARM ثبت شده است.`,
      severity: "info",
      metrics: [
        { label: "کل درخواست‌ها", value: faNumber(total) },
        { label: "تکمیل تماس", value: `${faNumber(coveragePct)}٪` },
        { label: "در نوبت غنی‌سازی", value: faNumber(pending) },
      ],
    });

    // ---- TOP_EXPERTS: کارشناسان فعال ثبت درخواست ----
    const byActor = new Map<string, number>();
    for (const r of rows) {
      if (!r.actorName) continue;
      byActor.set(r.actorName, (byActor.get(r.actorName) ?? 0) + 1);
    }
    const topActors = [...byActor.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (topActors.length > 0) {
      cards.push({
        key: "ar-top-experts",
        domain: "TOP_EXPERTS",
        title: "کارشناسان پرثبت درخواست",
        body: `در جدیدترین ${faNumber(rows.length)} درخواست، «${topActors[0][0]}» با ${faNumber(topActors[0][1])} ثبت در صدر است و پس از او ${topActors
          .slice(1)
          .map(([n, c]) => `«${n}» (${faNumber(c)})`)
          .join(" و ")} قرار دارند. ثبت درخواست بیشتر یعنی جریان ورودی مشتری قوی‌تر برای آن کارشناس؛ تطبیق این رتبه‌بندی با «آگهی‌های ملک تبریز» نشان می‌دهد هر کارشناس در کدام سمت بازار (عرضه یا تقاضا) فعال‌تر است.`,
        severity: "info",
        metrics: topActors.map(([n, c]) => ({ label: n, value: faNumber(c) })),
      });
    }

    // ---- COMPOSITION: ترکیب وضعیت درخواست‌ها ----
    const byStatus = new Map<string, number>();
    for (const r of rows) {
      if (!r.status) continue;
      byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
    }
    const topStatuses = [...byStatus.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (topStatuses.length > 0) {
      cards.push({
        key: "ar-status",
        domain: "COMPOSITION",
        title: "ترکیب وضعیت درخواست‌ها در چرخهٔ فروش",
        body: `بزرگ‌ترین وضعیت درخواست‌ها «${topStatuses[0][0]}» با ${faNumber(topStatuses[0][1])} مورد است؛ ${topStatuses
          .slice(1)
          .map(([n, c]) => `«${n}» (${faNumber(c)})`)
          .join(" و ")} در رتبه‌های بعدی‌اند. انباشته‌شدن درخواست‌ها در وضعیت‌های ابتدایی (مثل سرنخ) در برابر وضعیت‌های انتهایی، قیف تبدیل تیم را نشان می‌دهد — برای پیگیری رویدادمحور، رویدادهای هر درخواست از کاشی «درخواست ملک تبریز» ثبت می‌شوند.`,
        severity: "info",
        metrics: topStatuses.map(([n, c]) => ({ label: n, value: faNumber(c) })),
      });
    }

    // ---- COVERAGE: پوشش اطلاعات تماس درخواست‌دهندگان ----
    if (sample.rows.length > 0) {
      const enrichedSample = sample.rows.filter((r) => r.enrichedAt);
      if (enrichedSample.length > 0) {
        const withMobile = enrichedSample.filter((r) => r.customerMobile).length;
        const mobilePct = Math.round((withMobile / enrichedSample.length) * 1000) / 10;
        cards.push({
          key: "ar-coverage",
          domain: "COVERAGE",
          title: "کیفیت اطلاعات تماس درخواست‌دهندگان",
          body: `در ${faNumber(enrichedSample.length)} درخواست غنی‌سازی‌شده، ${faNumber(mobilePct)}٪ شماره موبایل درخواست‌دهنده در سامانه ARM ثبت شده است. درخواست بدون شماره تماس، عملاً سرنخ غیرقابل‌پیگیری است — فهرست این موارد و آموزش کارشناسان ثبت‌کننده برای الزامِ ثبت موبایل، بازده پیگیری را جهش می‌دهد.`,
          severity: mobilePct < 70 ? "warning" : "positive",
          metrics: [{ label: "دارای شماره تماس", value: `${faNumber(mobilePct)}٪` }],
        });
      }
    }

    // ---- FRESHNESS: تازگی ثبت درخواست‌ها ----
    const now = Date.now();
    const dayMs = 86400_000;
    const today = rows.filter((r) => r.createdAt && now - r.createdAt.getTime() < dayMs).length;
    const week = rows.filter((r) => r.createdAt && now - r.createdAt.getTime() < 7 * dayMs).length;
    cards.push({
      key: "ar-freshness",
      domain: "FRESHNESS",
      title: "تازگی جریان ثبت درخواست",
      body: `در ۲۴ ساعت گذشته ${faNumber(today)} درخواست جدید و در هفت روز گذشته ${faNumber(week)} درخواست در سامانه ARM ثبت شده است. جریان ورودی تقاضا، آینه‌های بازار خرید و اجارهٔ تبریز است؛ با «بروزرسانی از سامانه» جدیدترین‌ها با کد و کارشناس ثبت‌کننده به کاتالوگ اضافه می‌شوند و غنی‌سازی تماس آن‌ها خودکار در اولویت است.`,
      severity: "info",
      metrics: [
        { label: "درخواست امروز", value: faNumber(today) },
        { label: "درخواست هفته", value: faNumber(week) },
      ],
    });

    return cards;
  }
}

export const armRequestAgent = new ArmRequestAgent();
