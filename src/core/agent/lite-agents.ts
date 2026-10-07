/**
 * ایجنت‌های سبک سه کاشی تحلیلی — PN-014 (کشف زنده: شکاف نهفته از P6545)
 * ---------------------------------------------------------------------------
 * کشف: کاشی‌های market-index · data-coverage · learning-tier در تعریف خود
 * «agent» اعلام می‌کنند (پس کارتشان نشان ایجنت می‌گیرد و TileCard آمار
 * می‌خواند) اما هیچ ایجنتی در رجیستری برایشان ثبت نشده بود — یعنی
 * /api/agent/<tileId>/stats همیشه 404 می‌داد و وعدهٔ «ایجنت هوشمند» روی کارت
 * دروغ می‌بود. عین همان شکافی که PN-011 خامسا برای کاشی تطبیق کشف کرد.
 *
 * این ایجنت‌ها الگوی SmartMatchingAgent را دنبال می‌کنند: سبک، صادق،
 * گزارش‌دهندهٔ حلقهٔ بازخورد همان کاشی — بدون ادعای تحلیل تازه.
 */

import { BaseLearningAgent, type InsightCard } from "./base-agent";
import { getAgentMemoryRepository, type AgentMemoryRepository } from "@/core/repositories";

export type FeedbackSource = { listAllFeedbacks(tileId: string): Promise<Array<{ rating: number }>> };

/** زمینهٔ هر کاشی — دامنهٔ بینش و توضیح کارکرد */
export interface LiteAgentContext {
  tileId: string;
  name: string;
  insightDomains: readonly string[];
  /** توضیح کارکرد کاشی برای کارت «حلقهٔ فعال» */
  roleHint: string;
}

/** ایجنت سبک گزارش‌دهندهٔ حلقهٔ بازخورد — قابل‌تزریق برای تست */
export class TileLiteAgent extends BaseLearningAgent {
  readonly tileId: string;
  readonly name: string;
  readonly insightDomains: readonly string[];
  private readonly ctx: LiteAgentContext;
  private readonly feedbackSource: FeedbackSource;

  constructor(ctx: LiteAgentContext, deps?: { feedbackSource?: FeedbackSource }) {
    super();
    this.ctx = ctx;
    this.tileId = ctx.tileId;
    this.name = ctx.name;
    this.insightDomains = ctx.insightDomains;
    this.feedbackSource = deps?.feedbackSource ?? (getAgentMemoryRepository() as AgentMemoryRepository);
  }

  protected async computeRawInsights(): Promise<InsightCard[]> {
    const cards: InsightCard[] = [];
    let feedbacks: Array<{ rating: number }> = [];
    try {
      feedbacks = await this.feedbackSource.listAllFeedbacks(this.tileId);
    } catch {
      feedbacks = [];
    }
    const total = feedbacks.length;
    if (total === 0) {
      cards.push({
        key: `${this.tileId}-loop-active`,
        domain: this.ctx.insightDomains[0],
        title: "حلقهٔ یادگیری این کاشی فعال است",
        body: this.ctx.roleHint,
        severity: "info",
        metrics: [{ label: "بازخورد ثبت‌شده", value: "0" }],
      });
      return cards;
    }
    const positive = feedbacks.filter((f) => f.rating > 0).length;
    const positivePct = Math.round((positive / total) * 100);
    cards.push({
      key: `${this.tileId}-feedback-quality`,
      domain: this.ctx.insightDomains[0],
      title: `اعتماد شما به این کاشی: ${positivePct}٪ مثبت`,
      body:
        positivePct >= 60
          ? "سهم بالای بازخورد مثبت نشان می‌دهد خروجی این کاشی با نیاز شما هم‌راستاست — بازخورد مستمر کیفیت را پایدار می‌کند."
          : "سهم بازخورد مثبت پایین است — الگوی ردهای شما در سیاست‌های بعدی این کاشی بازتاب می‌یابد.",
      severity: positivePct >= 60 ? "positive" : "warning",
      metrics: [
        { label: "کل بازخورد", value: String(total) },
        { label: "مثبت", value: String(positive) },
        { label: "منفی", value: String(total - positive) },
      ],
    });
    return cards;
  }
}

/* ── سه نمونهٔ رسمی — عین الگوی ثبت رجیستری ── */

export const marketIndexAgent = new TileLiteAgent({
  tileId: "market-index",
  name: "ایجنت شاخص قیمت ملک تبریز",
  insightDomains: ["MARKET"],
  roleHint: "شاخص قیمت هر متر در مناطق تبریز از دل معاملات واقعی محاسبه و دنباله‌روی می‌شود — با هر بازخورد، اولویت نمایش مناطق با سلیقهٔ شما تنظیم می‌شود.",
});

export const dataCoverageAgent = new TileLiteAgent({
  tileId: "data-coverage",
  name: "ایجنت پوشش داده ملکا",
  insightDomains: ["COVERAGE"],
  roleHint: "سلامت داده هر کاشی (تازگی استخراج، نرخ پرشدن ستون‌ها، گپ‌ها) پایش می‌شود — بازخورد شما تعیین می‌کند کدام گپ‌ها در گزارش بعدی برجسته شوند.",
});

export const learningTierAgent = new TileLiteAgent({
  tileId: "learning-tier",
  name: "ایجنت سطح یادگیری ملکا",
  insightDomains: ["LEARNING"],
  roleHint: "میزان یادگیری کل اکوسیستم (سطح‌های ۰ تا ۳ و چه‌کسی چه‌چیز آموخته) شفاف می‌شود — بازخورد شما رشد سطح را واقعی‌تر می‌کند.",
});
