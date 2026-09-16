/**
 * ایجنت هوشمند کاشی «بازدیدها و پیگیری‌ها»
 * ------------------------------------------------------
 * تخصص: تحلیل «visits/list» سامانه ملک تبریز —
 * حجم و روند ماهانه بازدیدها (هجری شمسی)، نرخ بررسی،
 * رتبه‌بندی بررسی‌کنندگان و آگهی‌های پربازدید — با یادگیری از بازخورد.
 */

import { getVisitRepository, type VisitRepository } from "@/core/repositories";
import { BaseLearningAgent, type InsightCard } from "./base-agent";
import {
  checkerLeaderboard,
  growthRate,
  mostVisitedProperties,
  visitMonthlySeries,
  visitStats,
  visitStatusDistribution,
} from "./analyzers";
import { faNumber, faMonthLabel } from "@/lib/format";

/** وابستگی‌های تزریق‌پذیر ایجنت بازدیدها */
export interface VisitsAgentDeps {
  visits?: VisitRepository;
}

export class VisitsAgent extends BaseLearningAgent {
  readonly tileId = "visits";
  readonly name = "ایجنت تحلیل بازدیدها";
  readonly insightDomains = ["VOLUME", "TREND", "STATUS", "LEADERSHIP", "ATTENTION"] as const;

  private readonly visitsRepo: VisitRepository;

  constructor(deps?: VisitsAgentDeps) {
    super();
    this.visitsRepo = deps?.visits ?? getVisitRepository();
  }

  protected async computeRawInsights(): Promise<InsightCard[]> {
    const visits = await this.visitsRepo.findAll();
    const cards: InsightCard[] = [];
    if (visits.length === 0) return cards;

    const stats = visitStats(visits);
    const series = visitMonthlySeries(visits);

    // ---- VOLUME: حجم کل ----
    cards.push({
      key: "vi-volume",
      domain: "VOLUME",
      title: "حجم بازدیدها و پیگیری‌ها",
      body: `${faNumber(stats.total)} بازدید از آگهی‌ها در «بازدیدها و نظرات» سامانه ملک تبریز ثبت شده است؛ این بازدیدها ${faNumber(stats.distinctProperties)} آگهی متمایز را پوشش می‌دهند و توسط ${faNumber(stats.distinctRequesters)} درخواست‌دهنده (مشتری) انجام شده‌اند. میانگین بازدید به‌ازای هر آگهی، شاخص جذابیت عرضه‌های شماست.`,
      severity: "info",
      metrics: [
        { label: "کل بازدیدها", value: faNumber(stats.total) },
        { label: "آگهی متمایز", value: faNumber(stats.distinctProperties) },
        { label: "مشتری متمایز", value: faNumber(stats.distinctRequesters) },
      ],
    });

    // ---- TREND: روند ماهانه ----
    const growth = growthRate(series);
    if (series.length >= 2) {
      const last = series[series.length - 1];
      const prev = series[series.length - 2];
      cards.push({
        key: "vi-trend",
        domain: "TREND",
        title: "روند ماهانه ثبت بازدید",
        body:
          growth === null
            ? "داده کافی برای محاسبه روند وجود ندارد."
            : growth >= 0
              ? `ثبت بازدید ${faMonthLabel(last.key)} نسبت به ${faMonthLabel(prev.key)} حدود ${faNumber(Math.abs(growth))}٪ رشد داشته است. رشد بازدید نشانه‌ی تقاضای فعال یا کمپین بازاریابی مؤثر است.`
              : `ثبت بازدید ${faMonthLabel(last.key)} نسبت به ${faMonthLabel(prev.key)} حدود ${faNumber(Math.abs(growth))}٪ کاهش داشته است. افت بازدید معمولاً به معنای کاهش تقاضا یا کهنگی آگهی‌هاست — بازنگری قیمت/محتوای آگهی‌ها توصیه می‌شود.`,
        severity: growth === null ? "info" : growth >= 10 ? "positive" : growth <= -10 ? "warning" : "info",
        metrics: [
          { label: "رشد ماهانه", value: growth === null ? "—" : `${faNumber(growth)}٪` },
          { label: "بازدید ماه اخیر", value: faNumber(last.count) },
        ],
      });
    }

    // ---- STATUS: نرخ بررسی ----
    cards.push({
      key: "vi-status",
      domain: "STATUS",
      title: "نرخ بررسی بازدیدها",
      body: `${faNumber(stats.checked)} بازدید (${faNumber(stats.checkedRate)}٪) بررسی و ${faNumber(stats.pending)} مورد هنوز بررسی نشده‌اند. بازدید بررسی‌نشده یعنی مشتری منتظر پاسخ است؛ هر ساعت تأخیر، احتمال از دست رفتن مشتری را افزایش می‌دهد. ${
        stats.pending > 0 ? "پیشنهاد فوری: بررسی موارد معوق امروز." : "وضعیت بررسی‌ها کامل است — عالی."
      }`,
      severity: stats.pending === 0 ? "positive" : stats.checkedRate < 70 ? "warning" : "info",
      metrics: [
        { label: "بررسی‌شده", value: faNumber(stats.checked) },
        { label: "در انتظار بررسی", value: faNumber(stats.pending) },
        { label: "نرخ بررسی", value: `${faNumber(stats.checkedRate)}٪` },
      ],
    });

    // ---- LEADERSHIP: بررسی‌کنندگان برتر ----
    const leaders = checkerLeaderboard(visits, 3);
    if (leaders.length > 0 && leaders[0].count > 0) {
      cards.push({
        key: "vi-leaders",
        domain: "LEADERSHIP",
        title: "بررسی‌کنندگان پیشرو",
        body: `«${leaders[0].name}» با ${faNumber(leaders[0].count)} بررسی، پرکارترین بررسی‌کننده است${leaders[1] ? ` و «${leaders[1].name}» با ${faNumber(leaders[1].count)} بررسی در رتبه دوم است` : ""}. توزیع کار بررسی بین کارشناسان را دوره‌ای بازبینی کنید تا گلوگاه ایجاد نشود.`,
        severity: "info",
        metrics: leaders.map((l) => ({ label: l.name, value: `${faNumber(l.count)} بررسی` })),
      });
    }

    // ---- ATTENTION: آگهی‌های پربازدید ----
    const hot = mostVisitedProperties(visits, 3);
    if (hot.length > 0 && hot[0].count >= 2) {
      cards.push({
        key: "vi-attention",
        domain: "ATTENTION",
        title: "آگهی‌های پربازدید مشتریان",
        body: `آگهی کد «${hot[0].code}» با ${faNumber(hot[0].count)} بازدید، پربازدیدترین آگهی است${hot[1] ? `؛ پس از آن آگهی «${hot[1].code}» با ${faNumber(hot[1].count)} بازدید قرار دارد` : ""}. بازدید مکرر روی یک آگهی یعنی تقاضای متمرکز — اگر فروش نهایی نشده، مذاکره مجدد با مالک پیشنهاد می‌شود.`,
        severity: "positive",
        metrics: hot.map((h) => ({ label: h.code, value: `${faNumber(h.count)} بازدید` })),
      });
    }

    // ---- توزیع وضعیت (تکمیلی) ----
    const dist = visitStatusDistribution(visits);
    if (dist.length > 1) {
      const top = dist[0];
      cards.push({
        key: "vi-statusdist",
        domain: "STATUS",
        title: "توزیع وضعیت بازدیدها",
        body: `پرشمارترین وضعیت «${top.name}» با ${faNumber(top.count)} مورد است و در مجموع ${faNumber(dist.length)} وضعیت متمایز دیده می‌شود. پایش تغییر سهم وضعیت‌ها، سلامت چرخه پیگیری را نشان می‌دهد.`,
        severity: "info",
        metrics: dist.slice(0, 3).map((d) => ({ label: d.name, value: faNumber(d.count) })),
      });
    }

    return cards;
  }
}

export const visitsAgent = new VisitsAgent();
