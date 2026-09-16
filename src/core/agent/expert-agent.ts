/**
 * ایجنت هوشمند کاشی «کارشناسان»
 * ------------------------------------------------------
 * تخصص: تحلیل «فهرست کاربران/مشاوران» و «تعاملات مشاوران با یکدیگر»
 * سامانه ملک تبریز — توزیع نقش‌ها، وضعیت فعال/غیرفعال، رشد عضویت
 * (هجری شمسی)، شبکه همکاری و مشاوران منزوی — با یادگیری از بازخورد.
 */

import { getExpertRepository, type ExpertRepository } from "@/core/repositories";
import { BaseLearningAgent, type InsightCard } from "./base-agent";
import {
  businessDistribution,
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

/** وابستگی‌های تزریق‌پذیر ایجنت کارشناسان */
export interface ExpertAgentDeps {
  experts?: ExpertRepository;
}

export class ExpertAgent extends BaseLearningAgent {
  readonly tileId = "experts";
  readonly name = "ایجنت تحلیل کارشناسان";
  readonly insightDomains = ["COMPOSITION", "ACTIVITY", "GROWTH", "NETWORK", "RISK"] as const;

  private readonly expertsRepo: ExpertRepository;

  constructor(deps?: ExpertAgentDeps) {
    super();
    this.expertsRepo = deps?.experts ?? getExpertRepository();
  }

  protected async computeRawInsights(): Promise<InsightCard[]> {
    const [experts, interactions] = await Promise.all([
      this.expertsRepo.findAll(),
      this.expertsRepo.listAllInteractions(),
    ]);
    const cards: InsightCard[] = [];
    if (experts.length === 0) return cards;

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
