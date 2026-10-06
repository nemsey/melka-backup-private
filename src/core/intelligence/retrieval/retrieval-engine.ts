/**
 * بدنه موتور بازیابی (RetrievalEngineImpl) — PHASE 5 / P5-07
 * ------------------------------------------------------
 * پیاده‌سازی قرارداد RetrievalEngine نسخه ۱ (PHASE 3) روی پشته بازیابی ترکیبی:
 *
 *   RetrievalQuery(v1) → فیلتر tileId → HybridRetriever (RRF: BM25 فارسی + برداری)
 *     → فیلتر layers قرارداد (پس از بازیابی روی مجموعه کامل نامزدها)
 *     → Reranker heuristic (اختیاری — پیش‌فرض فعال)
 *     → RetrievalResult(v1): { snippets: MemoryEntry[]، hitCount، method: "HYBRID" }
 *
 * وفاداری به قرارداد (اصل حاکم فاز):
 *  - متد قراردادی دقیقاً retrieve(RetrievalQuery) با خروجی «دقیقاً» سه فیلد
 *    RetrievalResult است — نه بیشتر؛ snippets هفت فیلد MemoryEntry.
 *  - method همیشه "HYBRID" (اعلام صادقانه: پشته، موتور ترکیبی است؛ وزن‌های
 *    تک‌منبعی، تنظیم درون همان پشته‌اند نه موتور دیگری).
 *  - همیشه-تازه: sync در ابتدای هر retrieve — نمایه‌ها عکس لحظهٔ فراخوانی‌اند
 *    (قطعی؛ هزینه O(N) روی نمایه در-حافظه).
 *
 * ساخت نمونه async است (نمایه‌سازی اولیه): RetrievalEngineImpl.create(options)
 * یا کارخانه createRetrievalEngine(options).
 *
 * مرز: صفر Prisma / صفر @/lib/db / صفر شبکه / صفر React (ممیزی --strict).
 */

import type { RetrievalEngine, RetrievalQuery, RetrievalResult } from "../engines/retrieval";
import type { MemoryEntry, MemoryLayer } from "../engines/memory";
import type { MemoryRecord, MemoryStore } from "../memory/memory-store";
import type { EmbedFn } from "../memory/vector-index";
import {
  createHybridRetriever,
  type HybridRetrieverHandle,
  type HybridOptions,
} from "./hybrid-retriever";
import { Reranker, type RerankOptions } from "./reranker";
import type { BM25Options } from "./keyword-search";

// ===================== گزینه‌ها =====================

export interface RetrievalEngineOptions {
  /** درگاه حافظه — منبع رکوردهای قابل‌جستجو */
  store: MemoryStore;
  /** تعبیه — پیش‌فرض embedText قطعی (باید با تعبیه رکوردها یکی باشد) */
  embed?: EmbedFn;
  bm25?: BM25Options;
  /** رتبه‌بند heuristic — پیش‌فرض: Reranker() با وزن‌های پیش‌فرض؛ null = بدون رتبه‌بندی مجدد */
  reranker?: Reranker | null;
  /** گزینه‌های رتبه‌بندی مجدد */
  rerank?: RerankOptions;
  /** وزن‌های ادغام RRF — پیش‌فرض 0.5/0.5 با k=60 */
  hybrid?: Pick<HybridOptions, "weightVector" | "weightKeyword" | "rrfK">;
}

/** نگاشت رکورد داخلی به هفت فیلد قراردادی MemoryEntry (هم‌ارز toEntry موتور حافظه) */
function toEntry(record: MemoryRecord): MemoryEntry {
  return {
    id: record.id,
    tileId: record.tileId,
    layer: record.layer,
    kind: record.kind,
    text: record.text,
    sentiment: record.sentiment,
    createdAt: record.createdAt,
  };
}

/** topK داخلی — همه نامزدها؛ برش نهایی پس از فیلتر لایه و رتبه‌بندی مجدد */
const INTERNAL_TOPK = 100_000;

// ===================== موتور =====================

export class RetrievalEngineImpl implements RetrievalEngine {
  readonly contractVersion = 1 as const;

  /** در create مقدار می‌گیرد (نمایه‌سازی اولیه async) */
  private handle!: HybridRetrieverHandle;
  private readonly reranker: Reranker | null;
  private readonly rerankOptions: RerankOptions;
  private readonly hybridWeights: Pick<HybridOptions, "weightVector" | "weightKeyword" | "rrfK">;

  private constructor(options: RetrievalEngineOptions) {
    this.reranker = options.reranker === null ? null : (options.reranker ?? new Reranker());
    this.rerankOptions = options.rerank ?? {};
    this.hybridWeights = options.hybrid ?? {};
  }

  /** ساخت نمونه با نمایه‌سازی اولیه — تنها مسیر رسمی ساخت */
  static async create(options: RetrievalEngineOptions): Promise<RetrievalEngineImpl> {
    const engine = new RetrievalEngineImpl(options);
    engine.handle = await createHybridRetriever({
      store: options.store,
      embed: options.embed,
      bm25: options.bm25,
    });
    return engine;
  }

  // ---------- متد قرارداد v1 ----------

  async retrieve(query: RetrievalQuery): Promise<RetrievalResult> {
    const k = Math.max(0, Math.floor(query.k ?? 5));
    if (k === 0) return { snippets: [], hitCount: 0, method: "HYBRID" };

    // همیشه-تازه: بازسازی نمایه‌ها از فروشگاه در هر فراخوانی (قطعی)
    await this.handle.sync();

    // بازیابی ترکیبی — دامنه tileId قرارداد؛ همه نامزدها (برش پایانی پس از فیلتر لایه)
    let items = await this.handle.retriever.retrieve(
      { text: query.query, filter: { tileId: query.tileId } },
      { topK: INTERNAL_TOPK, ...this.hybridWeights },
    );

    // فیلتر layers قرارداد v1 — روی مجموعه کامل نامزدها (هیچ تطبیقی از دست نمی‌رود)
    if (query.layers !== undefined && query.layers.length > 0) {
      const wanted = new Set<MemoryLayer>(query.layers);
      items = items.filter((i) => wanted.has(i.record.layer));
    }

    // رتبه‌بندی مجدد heuristic (اختیاری)
    if (this.reranker) {
      items = this.reranker.rerank(items, { text: query.query }, this.rerankOptions);
    }

    const top = items.slice(0, k);
    return {
      snippets: top.map((i) => toEntry(i.record)),
      hitCount: top.length,
      method: "HYBRID",
    };
  }
}

// ===================== کارخانه =====================

/** کارخانه موتور بازیابی — هم‌ارز RetrievalEngineImpl.create(options) */
export async function createRetrievalEngine(options: RetrievalEngineOptions): Promise<RetrievalEngineImpl> {
  return RetrievalEngineImpl.create(options);
}
