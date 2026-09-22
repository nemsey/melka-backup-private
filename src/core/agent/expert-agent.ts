/**
 * ایجنت هوشمند کاشی «کارشناسان»
 * ------------------------------------------------------
 * تخصص: تحلیل «فهرست کاربران/مشاوران» و «تعاملات مشاوران با یکدیگر»
 * سامانه ملک تبریز — توزیع نقش‌ها، وضعیت فعال/غیرفعال، رشد عضویت
 * (هجری شمسی)، شبکه همکاری و مشاوران منزوی — با یادگیری از بازخورد.
 */

import { getExpertRepository, getVisitRepository, type ExpertRepository, type VisitRepository } from "@/core/repositories";
import { BaseLearningAgent, type InsightCard } from "./base-agent";
import {
  businessDistribution,
  checkerLeaderboard,
  expertBaseStats,
  growthRate,
  interactionConcentration,
  isolatedRealtors,
  joinerSeries,
  realtorDegrees,
  roleDistribution,
  topPairs,
} from "./analyzers";
import { faNumber, faMonthLabel } from "@/lib/format";
import { enrichExpertRows, buildTopExpertsInsight } from "@/lib/melk-api/expert-enrichment";

/** وابستگی‌های تزریق‌پذیر ایجنت کارشناسان */
export interface ExpertAgentDeps {
  experts?: ExpertRepository;
  visits?: VisitRepository;
}

export class ExpertAgent extends BaseLearningAgent {
  readonly tileId = "experts";
  readonly name = "ایجنت تحلیل کارشناسان";
  /** P6.5-11 (بند ج) — VISIT_LEADERSHIP از کاشی حذف‌شدهٔ بازدیدها مهاجرت کرد
   *  P6.5-12 (بند پ) — DEAL_ACTIVITY: فعال‌ترین کارشناسان بر اساس تعداد معامله */
  readonly insightDomains = ["COMPOSITION", "ACTIVITY", "GROWTH", "NETWORK", "RISK", "VISIT_LEADERSHIP", "DEAL_ACTIVITY"] as const;

  private readonly expertsRepo: ExpertRepository;
  private readonly visitsRepo: VisitRepository;

  constructor(deps?: ExpertAgentDeps) {
    super();
    this.expertsRepo = deps?.experts ?? getExpertRepository();
    this.visitsRepo = deps?.visits ?? getVisitRepository();
  }

  protected async computeRawInsights(): Promise<InsightCard[]> {
    const [experts, interactions, visits] = await Promise.all([
      this.expertsRepo.findAll(),
      this.expertsRepo.listAllInteractions(),
      this.visitsRepo.findAll(),
    ]);
    const cards: InsightCard[] = [];
    if (experts.length === 0) return cards;

    // ---- P6.5-12 (بند پ): DEAL_ACTIVITY — فعال‌ترین کارشناسان بر اساس تعداد معامله ----
    try {
      const listRows = experts.map((e) => ({
        id: e.id,
        personnelCode: e.personnelCode,
        fullName: e.fullName,
        mobile: e.mobile,
        role: e.role,
        businessTitle: e.businessTitle,
        creator: e.creator,
        active: e.active,
        createdAt: e.createdAt,
        interactionTotal: 0,
      }));
      const enriched = await enrichExpertRows(listRows, null);
      const top = buildTopExpertsInsight(enriched.rows, enriched.attribution);
      if (top.topSale.length > 0 || top.accTop.length > 0) {
        const saleTop3 = top.topSale.slice(0, 3).map((r) => `${r.name} (${faNumber(r.count)})`).join("، ");
        const accLine = top.accTop.length > 0 ? ` طبق شاهد سامانهٔ مالی (کل کسب‌وکار)، «${top.accTop[0].realtorFullName}» با ${faNumber(top.accTop[0].tradeOverviewsCount)} قرارداد در صدر است.` : "";
        cards.push({
          key: "ex-deal-activity-top-sale",
          domain: "DEAL_ACTIVITY",
          title: "فعال‌ترین کارشناسان — مبایعه‌نامه (۲۰ نفر برتر)",
          body: `بر اساس تعداد معامله مبایعه‌نامه، پیشتازان: ${saleTop3 || "—"}.${accLine} پوشش انتساب: ${faNumber(top.coverage.salesAttributed)} از ${faNumber(top.coverage.salesTotal)} معاملهٔ گزارش تطابق از مسیر کارشناس درخواست/آگهی قابل انتساب است.`,
          severity: "positive",
          metrics: top.topSale.slice(0, 20).map((r, i) => ({
            label: `${faNumber(i + 1)}. ${r.name}${r.pmCode ? ` (${r.pmCode})` : ""}`,
            value: `${faNumber(r.count)} مبایعه‌نامه`,
          })),
        });
        if (top.topRent.length > 0) {
          const rentTop3 = top.topRent.slice(0, 3).map((r) => `${r.name} (${faNumber(r.count)})`).join("، ");
          cards.push({
            key: "ex-deal-activity-top-rent",
            domain: "DEAL_ACTIVITY",
            title: "فعال‌ترین کارشناسان — اجاره‌نامه (۲۰ نفر برتر)",
            body: `بر اساس تعداد معامله اجاره‌نامه، پیشتازان: ${rentTop3}. این شمارش از صورت‌وضعیت‌های ثبت‌شده در سامانه (نوع اجاره‌نامه) استخراج می‌شود.`,
            severity: "info",
            metrics: top.topRent.slice(0, 20).map((r, i) => ({
              label: `${faNumber(i + 1)}. ${r.name}${r.pmCode ? ` (${r.pmCode})` : ""}`,
              value: `${faNumber(r.count)} اجاره‌نامه`,
            })),
          });
        }
        if (top.accTop.length > 0) {
          cards.push({
            key: "ex-deal-activity-acc-witness",
            domain: "DEAL_ACTIVITY",
            title: "شاهد سامانهٔ مالی — بیشترین قرارداد ثبت‌شده (کل کسب‌وکار)",
            body: `داشبورد سامانهٔ مالی ملک تبریز «${top.accTop[0].realtorFullName}» را با ${faNumber(top.accTop[0].tradeOverviewsCount)} صورت‌وضعیت ثبت‌شده، فعال‌ترین کارشناس کل کسب‌وکار معرفی می‌کند. این شمارش مستقل از دامنهٔ دسترسی حساب ARM است.`,
            severity: "info",
            metrics: top.accTop.map((r, i) => ({
              label: `${faNumber(i + 1)}. ${r.realtorFullName}`,
              value: `${faNumber(r.tradeOverviewsCount)} قرارداد`,
            })),
          });
        }
      }
    } catch {
      // غنی‌سازی بین‌سامانه‌ای در دسترس نیست — بینش حذف می‌شود، نه کل ایجنت
    }

    // ---- P6.5-11 (بند ج): VISIT_LEADERSHIP — بررسی‌کنندگان پیشرو (مهاجرت از کاشی بازدیدها) ----
    if (visits.length > 0) {
      const leaders = checkerLeaderboard(visits, 3);
      if (leaders.length > 0 && leaders[0].count > 0) {
        cards.push({
          key: "ex-visit-leaders",
          domain: "VISIT_LEADERSHIP",
          title: "بررسی‌کنندگان پیشرو (از بازدیدهای مهاجرت‌یافته)",
          body: `«${leaders[0].name}» با ${faNumber(leaders[0].count)} بررسی، پرکارترین بررسی‌کنندهٔ بازدیدها است${leaders[1] ? ` و «${leaders[1].name}» با ${faNumber(leaders[1].count)} بررسی در رتبهٔ دوم است` : ""}. توزیع کار بررسی بین کارشناسان را دوره‌ای بازبینی کنید تا گلوگاه ایجاد نشود.`,
          severity: "info",
          metrics: leaders.map((l) => ({ label: l.name, value: `${faNumber(l.count)} بررسی` })),
        });
      }
    }

    const base = expertBaseStats(experts);
    const degrees = realtorDegrees(interactions);

    // ---- COMPOSITION: ترکیب تیم (نقش‌ها) ----
    const roles = roleDistribution(experts);
    if (roles.length > 0) {
      cards.push({
        key: "ex-composition",
        domain: "COMPOSITION",
        title: "ترکیب نقش‌های تیم",
        body: `تیم از ${faNumber(experts.length)} کاربر تشکیل شده است؛ پرشمارترین نقش «${roles[0].name}» با ${faNumber(roles[0].count)} نفر است. ${roles.length > 3 ? "تنوع نقش‌ها بالا است — هماهنگی نقش‌ها و شرح وظایف شفاف اهمیت دارد." : "ترکیب نقش‌ها متمرکز و شفاف است."}`,
        severity: "info",
        metrics: roles.slice(0, 4).map((r) => ({ label: r.name, value: `${faNumber(r.count)} نفر` })),
      });
    }

    // ---- ACTIVITY: وضعیت فعال/غیرفعال ----
    cards.push({
      key: "ex-activity",
      domain: "ACTIVITY",
      title: "وضعیت فعال بودن کاربران",
      body: `${faNumber(base.active)} کاربر فعال (${faNumber(base.activeRate)}٪) و ${faNumber(base.inactive)} کاربر غیرفعال دارید. ${base.activeRate < 85 ? "حساب‌های غیرفعال طولانی‌مدت باید بازبینی شوند — یا فعال‌سازی مجدد یا آرشیو حساب." : "تیم به‌صورت سالم فعال است."}`,
      severity: base.activeRate < 70 ? "warning" : "positive",
      metrics: [
        { label: "فعال", value: `${faNumber(base.active)} نفر` },
        { label: "غیرفعال", value: `${faNumber(base.inactive)} نفر` },
        { label: "نرخ فعال بودن", value: `${faNumber(base.activeRate)}٪` },
      ],
    });

    // ---- GROWTH: رشد عضویت ماهانه ----
    const joiners = joinerSeries(experts);
    const jGrowth = growthRate(joiners);
    if (joiners.length >= 2) {
      const last = joiners[joiners.length - 1];
      const prev = joiners[joiners.length - 2];
      cards.push({
        key: "ex-growth",
        domain: "GROWTH",
        title: "روند عضویت کاربران جدید",
        body:
          jGrowth === null
            ? "داده کافی برای محاسبه روند عضویت وجود ندارد."
            : jGrowth >= 0
              ? `در ${faMonthLabel(last.key)}، ${faNumber(last.count)} کاربر جدید ثبت شده است — ${faNumber(jGrowth)}٪ بیشتر از ${faMonthLabel(prev.key)}. رشد جذب نیرو در جریان است و زیرساخت آموزش باید متناسب توسعه یابد.`
              : `در ${faMonthLabel(last.key)}، ${faNumber(last.count)} کاربر جدید ثبت شده است — ${faNumber(Math.abs(jGrowth))}٪ کمتر از ${faMonthLabel(prev.key)}. افت جذب می‌تواند ناشی از فصلی‌بودن استخدام یا رضایت پایین باشد.`,
        severity: jGrowth === null ? "info" : jGrowth <= -30 ? "warning" : "info",
        metrics: [
          { label: "عضویت ماه اخیر", value: faNumber(last.count) },
          { label: "رشد ماهانه", value: jGrowth === null ? "—" : `${faNumber(jGrowth)}٪` },
        ],
      });
    }

    // ---- NETWORK: شبکه همکاری مشاوران ----
    if (degrees.length > 0) {
      const top = degrees.slice(0, 3);
      const conc = interactionConcentration(interactions, 5);
      cards.push({
        key: "ex-network",
        domain: "NETWORK",
        title: "شبکه همکاری مشاوران",
        body: `«${top[0].name}» با ${faNumber(top[0].total)} تعامل، محور اصلی همکاری‌های منجر به معامله است. ${conc > 50 ? `پنج جفتِ برتر ${faNumber(conc)}٪ از کل تعاملات را در اختیار دارند — شبکه همکاری متمرکز است و وابستگی به افراد محدود ریسک محسوب می‌شود.` : "شبکه همکاری به‌صورت متوازن توزیع شده است."} پرتعامل‌ترین جفت: «${topPairs(interactions, 1)[0]?.requestRealtorName ?? "—"}» و «${topPairs(interactions, 1)[0]?.propertyRealtorName ?? "—"}».`,
        severity: conc > 50 ? "warning" : "positive",
        metrics: top.map((d, i) => ({
          label: `رتبه ${faNumber(i + 1)}`,
          value: `${d.name} — ${faNumber(d.total)} تعامل (${faNumber(d.partners)} همکار)`,
        })),
      });
    }

    // ---- RISK: مشاوران منزوی (بدون هیچ تعاملی) ----
    const isolated = isolatedRealtors(experts, interactions);
    if (isolated.length > 0) {
      cards.push({
        key: "ex-risk",
        domain: "RISK",
        title: "مشاوران فعالِ بدون تعامل",
        body: `${faNumber(isolated.length)} کاربر فعال در هیچ همکاریِ منجر به معامله‌ای نقش نداشته‌اند: ${isolated.slice(0, 3).map((i) => i.fullName).join("، ")}${isolated.length > 3 ? " و…" : ""}. این وضعیت نشانه‌ی انزوا یا ناآشنایی با چرخه همکاری است — جلسه‌ی معرفی جریان کار و معرفی به مشاوران پیشتاز توصیه می‌شود.`,
        severity: "warning",
        metrics: [
          { label: "بدون تعامل", value: `${faNumber(isolated.length)} نفر` },
          { label: "درگیر در شبکه", value: `${faNumber(experts.length - isolated.length)} نفر` },
        ],
      });
    }

    // ---- کسب‌وکارهای بزرگ (تکمیل تصویر ساختار) ----
    const businesses = businessDistribution(experts);
    if (businesses.length > 1) {
      cards.push({
        key: "ex-businesses",
        domain: "COMPOSITION",
        title: "بزرگ‌ترین کسب‌وکارها (شعبه‌ها)",
        body: `«${businesses[0].name}» با ${faNumber(businesses[0].count)} کاربر بزرگ‌ترین شعبه است. مقایسه نسبت کاربر هر شعبه به تعاملاتش می‌تواند شاخص بهره‌وری شعبه‌ها را آشکار کند.`,
        severity: "info",
        metrics: businesses.slice(0, 3).map((b) => ({ label: b.name, value: `${faNumber(b.count)} کاربر` })),
      });
    }

    return cards;
  }
}

export const expertAgent = new ExpertAgent();
