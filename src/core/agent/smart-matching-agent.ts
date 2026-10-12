/**
 * ایجنت یادگیرندهٔ کاشی «تطبیق هوشمند ملک تبریز» (M5 — PN-011 خامسا-۲)
 * ---------------------------------------------------------------------------
 * زمینه: روت بازخورد ایجنت (/api/agent/[tileId]/feedback) از رجیستری ایجنت‌های
 * کاشی می‌خواند؛ کاشی smart-matching پیش از PN-011 در این رجیستری نبود — یعنی
 * دکمه‌های پذیرش/ردِ صفحهٔ تطبیق (حتی با مسیر صحیح) 404 می‌گرفتند و حلقهٔ
 * یادگیری وزن‌ها هرگز تغذیه نمی‌شد (کشف زندهٔ PN-011).
 *
 * این ایجنت سبک است: بینشِ شمارش بازخوردهای تطبیق + کیفیت میانگین پذیرش،
 * و مهم‌تر از همه، «میزِ ثبت بازخورد» برای حلقهٔ یادگیری وزن‌های موتور تطبیق
 * (src/core/matching/weights-learning.ts از همین بازخوردها وزن می‌آموزد).
 */

import { BaseLearningAgent, type InsightCard } from "./base-agent";
import { getAgentMemoryRepository, type AgentMemoryRepository } from "@/core/repositories";

/** منبع بازخورد تزریقی (تست) — پیش‌فرض: مخزن رجیستری ایجنت */
export type MatchingFeedbackSource = { listAllFeedbacks(tileId: string): Promise<Array<{ rating: number }>> };

export class SmartMatchingAgent extends BaseLearningAgent {
  readonly tileId = "smart-matching";
  readonly name = "ایجنت تطبیق هوشمند ملک تبریز";
  readonly insightDomains = ["MATCH_FEEDBACK", "MATCH_ACCEPTANCE"] as const;

  private readonly feedbackSource: MatchingFeedbackSource;

  constructor(deps?: { feedbackSource?: MatchingFeedbackSource }) {
    super();
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
        key: "sm-feedback-loop",
        domain: "MATCH_FEEDBACK",
        title: "حلقهٔ یادگیری تطبیق فعال است",
        body: "با هر پذیرش/رد در کاشی تطبیق، وزن عوامل امتیاز (قیمت، منطقه، متراژ، تازگی، سابقه کارشناس، نوع ملک) تدریجاً از بازخوردهای شما شخصی می‌شود. پس از ۳ بازخورد نخست، وزن‌های آموخته جایگزین وزن‌های پایه می‌شوند.",
        severity: "info",
        metrics: [{ label: "بازخورد ثبت‌شده", value: "0" }],
      });
      return cards;
    }
    const accepted = feedbacks.filter((f) => f.rating === 1).length;
    const acceptancePct = Math.round((accepted / total) * 100);
    cards.push({
      key: "sm-acceptance-rate",
      domain: "MATCH_FEEDBACK",
      title: `اعتماد به تطبیق: ${acceptancePct}٪ پذیرش`,
      body:
        acceptancePct >= 60
          ? "سهم بالای پذیرش نشان می‌دهد فیلترهای سخت و وزن‌های فعلی با سلیقهٔ شما هم‌راستا هستند؛ بازخوردهای بیشتر دقت را بیش از این بالا می‌برد."
          : "سهم پذیرش پایین است — وزن‌های آموخته به‌تدریج عواملی را که در ردها نقش داشتند تضعیف می‌کنند.",
      severity: acceptancePct >= 60 ? "positive" : "warning",
      metrics: [
        { label: "کل بازخورد", value: String(total) },
        { label: "پذیرش", value: String(accepted) },
        { label: "رد", value: String(total - accepted) },
      ],
    });
    cards.push({
      key: "sm-learned-weights-status",
      domain: "MATCH_ACCEPTANCE",
      title: total >= 3 ? "وزن‌های آموخته فعال‌اند" : "در آستانهٔ فعال‌شدن وزن‌های آموخته",
      body:
        total >= 3
          ? "موتور تطبیق از همین بازخوردها وزن عوامل را بازتنظیم کرده است — نشان «وزن‌های آموخته» در کارت نتیجهٔ تطبیق این را عیان می‌کند."
          : `با ${3 - total} بازخورد دیگر، وزن‌های عوامل از بازخوردهای شما آموخته می‌شود (حداقل سیگنال: ۳).`,
      severity: total >= 3 ? "positive" : "info",
      metrics: [{ label: "فاصله تا یادگیری فعال", value: String(Math.max(0, 3 - total)) }],
    });
    return cards;
  }
}

/** نمونهٔ یگانهٔ رجیستری — الگوی سایر ایجنت‌های کاشی */
export const smartMatchingAgent = new SmartMatchingAgent();
