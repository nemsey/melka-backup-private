/**
 * بدنهٔ موتور پیامد (OutcomeEngineImpl) — PHASE 7
 * ------------------------------------------------------
 * قرارداد v1 (engines/outcome.ts) کلمه‌به‌کلمه پیاده می‌شود:
 *  - record(entry): اعتبارسنجی → الحاق به انبار تزریقی
 *  - query(query): فیلتر tileId/since/predictionId — جدیدترین-اول
 *  - linkage(tileId): matched (پیش‌بینی‌های دارای پیامد) / unmatched
 *
 * قابلیت‌های افزودنی (قاعده فاز — v1 دست‌نخورده):
 *  - append(entry): الحاق + بازگشت رکورد ذخیره‌شده (با outcomeId) —
 *    برای حلقهٔ سرنوشت که outcomeId را در linkOutcome می‌نویسد.
 *  - منبع اختیاری پیش‌بینی (predictionIds) برای شمارش صادقانهٔ unmatched.
 *
 * منبع داده امروز (طبق قرارداد): LookupLog / DivarRejectLog /
 * CommissionCalcLog از OutcomeRepository موجود — در لایه lib به این
 * قرارداد نگاشت می‌شود (نگاشت‌گر: src/lib/intelligence/outcome-loop.ts).
 *
 * مرز: صفر Prisma / صفر fetch / صفر react (گارد P3-06).
 */

import type {
  OutcomeEngine,
  OutcomeLinkage,
  OutcomeQuery,
  OutcomeRecord,
} from "../engines/outcome";
import {
  InMemoryOutcomeStore,
  type OutcomeStore,
  type StoredOutcomeRecord,
  validateOutcomeEntry,
} from "./outcome-store";

/** منبع اختیاری شناسهٔ پیش‌بینی‌ها برای شمارش unmatched در linkage */
export interface PredictionIdSource {
  listPredictionIds(tileId: string): Promise<string[]>;
}

/** گزینه‌های ساخت OutcomeEngineImpl — همهٔ اختیاری (سازگاری عقب‌وار) */
export interface OutcomeEngineOptions {
  store?: OutcomeStore;
  /** بدون منبع: unmatched صادقانه صفر گزارش می‌شود (فقط matched قابل محاسبه) */
  predictionIds?: PredictionIdSource;
}

export class OutcomeEngineImpl implements OutcomeEngine {
  readonly contractVersion = 1 as const;

  private readonly store: OutcomeStore;
  private readonly predictionIds: PredictionIdSource | null;

  constructor(options: OutcomeEngineOptions = {}) {
    this.store = options.store ?? new InMemoryOutcomeStore();
    this.predictionIds = options.predictionIds ?? null;
  }

  // ---------- v1 (عین قرارداد) ----------

  async record(entry: OutcomeRecord): Promise<void> {
    const problem = validateOutcomeEntry(entry);
    if (problem) throw new Error(`رکورد پیامد نامعتبر: ${problem}`);
    await this.store.append(entry);
  }

  async query(query: OutcomeQuery): Promise<OutcomeRecord[]> {
    const all = await this.store.list();
    return all
      .filter((r) => r.tileId === query.tileId)
      .filter((r) => (query.since ? r.occurredAt >= query.since : true))
      .filter((r) => (query.predictionId ? r.predictionId === query.predictionId : true))
      .map(({ outcomeId: _o, recordedAt: _r, ...v1 }) => v1);
  }

  async linkage(tileId: string): Promise<OutcomeLinkage> {
    const all = await this.store.list();
    const matchedIds = new Set(
      all.filter((r) => r.tileId === tileId && r.predictionId).map((r) => r.predictionId as string),
    );
    if (!this.predictionIds) return { matched: matchedIds.size, unmatched: 0 };
    const ids = await this.predictionIds.listPredictionIds(tileId);
    const unmatched = ids.filter((id) => !matchedIds.has(id)).length;
    return { matched: matchedIds.size, unmatched };
  }

  // ---------- افزودنی (PHASE 7 — حلقهٔ سرنوشت) ----------

  /** الحاق + بازگشت رکورد کامل — برای پیوند یکپارچه با PredictionRepository */
  async append(entry: OutcomeRecord): Promise<StoredOutcomeRecord> {
    const problem = validateOutcomeEntry(entry);
    if (problem) throw new Error(`رکورد پیامد نامعتبر: ${problem}`);
    return this.store.append(entry);
  }
}

/** کارخانه — الگوی فازهای ۴ تا ۶ */
export function createOutcomeEngine(options: OutcomeEngineOptions = {}): OutcomeEngineImpl {
  return new OutcomeEngineImpl(options);
}
