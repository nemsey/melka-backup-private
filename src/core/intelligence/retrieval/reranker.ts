/**
 * رتبه‌بندی مجدد heuristic آفلاین — PHASE 5 / P5-05
 * ------------------------------------------------------
 * مرتب‌سازی مجدد نتایج بازیابی با heuristicهای ساده — صفر LLM، صفر شبکه:
 *
 *   final = w_base·base + w_recency·recency + w_importance·importance
 *         + w_confidence·confidence + w_domain·domainMatch
 *
 *   وزن‌های پیش‌فرض: 0.4 / 0.2 / 0.2 / 0.1 / 0.1 (جمع = ۱)
 *   - base: امتیاز ادغام نرمال‌شده به بیشینه «همین مجموعه نتایج»
 *     (نسبی-به-پرسش — سنداً ثبت‌شده؛ مقیاس‌مستقل نمی‌باشد)
 *   - recency: exp(−سن‌ساعت / timeDecayHours) — پیش‌فرض ۱۶۸ ساعت (یک هفته)
 *   - importance / confidence: از متادیتای حل‌شده (پیش‌فرض خنثی 0.5 برای قدیمی‌ها)
 *   - domainMatch: 1 اگر دامنه پرسش با دامنه رکورد منطبق باشد (نرمال‌سازی فارسی)
 *
 * خروجی: همان آیتم‌ها با score جایگزین‌شده (امتیاز نهایی heuristic) و مرتب‌شده
 * نزولی؛ تساوی → ترتیب ورود (sort پایدار). sources و رتبه‌های منبع دست‌نخورده.
 *
 * مرز: صفر Prisma / صفر @/lib/db / صفر شبکه / صفر React (ممیزی --strict).
 */

import { normalizeForMatch, resolveMetadata } from "./metadata";
import type { RetrievedItem } from "./hybrid-retriever";

// ===================== انواع =====================

/** پرسش رتبه‌بندی — دامنه اختیاری + لحظه مرجع تازگی */
export interface RerankQuery {
  /** متن پرسش — فقط مستندسازی؛ heuristic فعلی از متن استفاده نمی‌کند */
  text?: string;
  /** دامنه پرسش — تطبیق با metadata.domain */
  domain?: string;
  /** لحظه مرجع محاسبه تازگی — پیش‌فرض: زمان جاری */
  asOf?: Date;
}

export interface RerankerWeights {
  /** سهم امتیاز ادغام بازیابی — پیش‌فرض 0.4 */
  base?: number;
  /** سهم تازگی — پیش‌فرض 0.2 */
  recency?: number;
  /** سهم اهمیت متادیتا — پیش‌فرض 0.2 */
  importance?: number;
  /** سهم اعتماد متادیتا — پیش‌فرض 0.1 */
  confidence?: number;
  /** سهم تطبیق دامنه — پیش‌فرض 0.1 */
  domain?: number;
}

export interface RerankOptions {
  weights?: RerankerWeights;
  /** ثابت میرایی زمانی بر حسب ساعت — پیش‌فرض 168 (یک هفته) */
  timeDecayHours?: number;
}

// ===================== رتبه‌بند =====================

export class Reranker {
  /** مرتب‌سازی مجدد — ورودی خالی → خالی؛ امتیاز نهایی در score جایگزین می‌شود */
  rerank(results: RetrievedItem[], query: RerankQuery, options: RerankOptions = {}): RetrievedItem[] {
    if (results.length === 0) return [];
    const w: Required<RerankerWeights> = {
      base: 0.4,
      recency: 0.2,
      importance: 0.2,
      confidence: 0.1,
      domain: 0.1,
      ...options.weights,
    };
    const decayHours = options.timeDecayHours ?? 168;
    const asOfMs = (query.asOf ?? new Date()).getTime();
    const queryDomain = query.domain !== undefined ? normalizeForMatch(query.domain) : null;

    // بیشینه امتیاز ادغام در همین مجموعه — مبنا نرمال‌سازی base
    let maxFused = 0;
    for (const r of results) if (r.score > maxFused) maxFused = r.score;

    return results
      .map((item) => {
        const meta = resolveMetadata(item.record);
        const base = maxFused > 0 ? item.score / maxFused : 0;

        // تازگی — سن منفی (رویداد آینده) صفر فرض می‌شود
        const evMs = Date.parse(meta.eventTime);
        const ageHours = Number.isFinite(evMs) ? Math.max(0, (asOfMs - evMs) / 3_600_000) : Number.POSITIVE_INFINITY;
        const recency = Number.isFinite(ageHours) ? Math.exp(-ageHours / decayHours) : 0;

        const domainMatch =
          queryDomain !== null && meta.domain !== undefined && normalizeForMatch(meta.domain) === queryDomain ? 1 : 0;

        const finalScore =
          w.base * base +
          w.recency * recency +
          w.importance * meta.importance +
          w.confidence * meta.confidence +
          w.domain * domainMatch;

        return { ...item, score: finalScore };
      })
      .sort((a, b) => b.score - a.score); // پایدار — تساوی: ترتیب ورود
  }
}
