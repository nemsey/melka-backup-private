/**
 * ایجنت هوشمند کاشی «کارشناسان»
 * ------------------------------------------------------
 * تخصص: تحلیل «فهرست کاربران/مشاوران» و «تعاملات مشاوران با یکدیگر»
 * سامانه ملک تبریز — توزیع نقش‌ها، وضعیت فعال/غیرفعال، رشد عضویت
 * (هجری شمسی)، شبکه همکاری — با یادگیری از بازخورد.
 *
 * PN-008 (ثانیاً): داده‌های مبایعه/اجاره/شعبه/استخدام از منبع تازهٔ
 * ExpertProfile (کشف سرد PM) خوانده می‌شود — وابستگی به نسل قدیمی حذف شد.
 */

import { getExpertRepository, getVisitRepository, type ExpertRepository, type VisitRepository } from "@/core/repositories";
import { BaseLearningAgent, type InsightCard } from "./base-agent";
import {
  businessDistribution,
  checkerLeaderboard,
  expertBaseStats,
  growthRate,
  interactionConcentration,
  joinerSeries,
  realtorDegrees,
  topPairs,
} from "./analyzers";
import { faNumber, faMonthLabel } from "@/lib/format";
import { listExpertProfiles, type ExpertProfileRow } from "@/lib/experts/profile-store";
// پوشش اطلاعات فهرست (تمام ستون‌ها)
import { buildCoverageInsight, type CoverageColumnInput } from "./coverage-insight";

/** وابستگی‌های تزریق‌پذیر ایجنت کارشناسان */
export interface ExpertAgentDeps {
  experts?: ExpertRepository;
  visits?: VisitRepository;
}

export class ExpertAgent extends BaseLearningAgent {
  readonly tileId = "experts";
  readonly name = "ایجنت تحلیل کارشناسان";
  readonly insightDomains = ["COMPOSITION", "ACTIVITY", "GROWTH", "NETWORK", "RISK", "VISIT_LEADERSHIP", "DEAL_ACTIVITY", "COVERAGE"] as const;

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

    // پروفایل تازهٔ PM (منبع فهرست جدید) — در نبودش بینش‌های وابسته حذف می‌شوند، نه کل ایجنت
    let profiles: ExpertProfileRow[] = [];
    try {
      profiles = (await listExpertProfiles({ limit: 5000 })).rows;
    } catch {
      profiles = [];
    }

    // ---- DEAL_ACTIVITY — فعال‌ترین کارشناسان اجاره‌نامه (۲۰ نفر برتر) ----
    try {
      const topRent = [...profiles]
        .filter((r) => r.rentCount > 0)
        .sort((a, b) => b.rentCount - a.rentCount || (a.fullName ?? "").localeCompare(b.fullName ?? "", "fa"))
        .slice(0, 20);
      if (topRent.length > 0) {
        const rentTop3 = topRent.slice(0, 3).map((r) => `${r.fullName} (${faNumber(r.rentCount)})`).join("، ");
        cards.push({
          key: "ex-deal-activity-top-rent",
          domain: "DEAL_ACTIVITY",
          title: "فعال‌ترین کارشناسان — اجاره‌نامه (۲۰ نفر برتر)",
          body: `بر اساس تعداد اجاره‌نامه (شامل تمدید اجاره)، پیشتازان: ${rentTop3}. این شمارش از قراردادهای ثبت‌شدهٔ سامانه استخراج می‌شود و با هر بروزرسانی فهرست تازه می‌شود.`,
          severity: "info",
          metrics: topRent.map((r, i) => ({
            label: `${faNumber(i + 1)}. ${r.fullName}${r.personnelCode ? ` (${r.personnelCode})` : ""}`,
            value: `${faNumber(r.rentCount)} اجاره‌نامه`,
          })),
        });
      }
    } catch {
      // پروفایل در دسترس نیست — بینش حذف می‌شود، نه کل ایجنت
    }

    // ---- پوشش اطلاعات فهرست کارشناسان (تمام ستون‌های کشف‌شده از PM) ----
    try {
      const n = profiles.length;
      if (n > 0) {
        const filled = (get: (r: ExpertProfileRow) => unknown) => profiles.filter((r) => get(r) !== null && get(r) !== "").length;
        const covCols: CoverageColumnInput[] = [
          { title: "نام کامل", filled: filled((r) => r.fullName), total: n, fillPath: "رجیستری PM (realtors/list)" },
          { title: "موبایل", filled: filled((r) => r.mobile), total: n, fillPath: "رجیستری PM (realtors/list — mobileNumber)" },
          { title: "کد پرسنلی", filled: filled((r) => r.personnelCode), total: n, fillPath: "رجیستری PM (realtors/list — code)" },
          { title: "شعبه", filled: filled((r) => r.branchTitle), total: n, fillPath: "سامانهٔ PM (personnelInfo.branchId.title)" },
          { title: "سمت پرسنلی", filled: filled((r) => r.roleTitle), total: n, fillPath: "سامانهٔ PM (personnelInfo.role.title)" },
          { title: "تاریخ استخدام", filled: filled((r) => r.hireDate), total: n, fillPath: "سامانهٔ PM (employeementInfo.date)" },
          { title: "نوع همکاری", filled: filled((r) => r.employmentTypeFa), total: n, fillPath: "سامانهٔ PM (employeementInfo.type)" },
          { title: "آدرس", filled: filled((r) => r.address), total: n, fillPath: "سامانهٔ PM (contactInfo.contactInfo.address)" },
          { title: "تلفن ثابت", filled: filled((r) => r.telephone), total: n, fillPath: "سامانهٔ PM (contactInfo.contactInfo.telephoneNumber)" },
          { title: "شماره داخلی", filled: filled((r) => r.voipExtension), total: n, fillPath: "رجیستری PM (voipInfo.extentionNumber)" },
          { title: "مبایعه‌نامه", filled: filled((r) => r.saleCount > 0), total: n, fillPath: "قراردادهای ARM (تایپ مبایعه/پیش‌فروش + گزارش تطابق)" },
          { title: "اجاره‌نامه", filled: filled((r) => r.rentCount > 0), total: n, fillPath: "قراردادهای ARM (تایپ اجاره/تمدید + گزارش تطابق)" },
          { title: "وضعیت فعال", filled: filled((r) => typeof r.active === "boolean"), total: n, fillPath: "رجیستری PM (isRegisteredCompleted)" },
        ];
        const covCard = buildCoverageInsight("کارشناسان ملک تبریز", "ex-list-coverage", covCols);
        if (covCard) cards.push(covCard);
      }
    } catch {
      // پوشش در دسترس نیست — بینش حذف می‌شود، نه کل ایجنت
    }

    // ---- VISIT_LEADERSHIP — بررسی‌کنندگان پیشرو (مهاجرت از کاشی بازدیدها) ----
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

    // ---- GROWTH: رشد عضویت ماهانه (بر اساس تاریخ استخدام PM در صورت وجود) ----
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
