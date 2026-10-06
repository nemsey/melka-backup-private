/**
 * بازیابی ترکیبی با ادغام RRF — PHASE 5 / P5-04
 * ------------------------------------------------------
 * ترکیب جستجوی برداری (VectorIndex از PHASE 4) و کلیدواژه‌ای (BM25 از P5-03)
 * با Reciprocal Rank Fusion وزن‌دار:
 *
 *   score(d) = w_v · 1/(k + rank_v(d))  +  w_k · 1/(k + rank_k(d))
 *
 *   k = 60 (پیش‌فرض) · w_v = w_k = 0.5 (پیش‌فرض) · رتبه‌ها ۱-مبنا
 *
 * جریان (سند طراحی بند ۳-۴ و ۳-۶):
 *   ۱) اعمال MetadataFilter «پیش از جستجو» → مجموعه نامزدها
 *      (فروشگاه دارای قابلیت queryWithFilter → مستقیم؛ وگرنه مسیر جایگزین محلی)
 *   ۲) اجرای دو جستجو با عمق کامل و برش نتایج به نامزدها
 *      (هم‌ارز پیش‌فیلتر واقعی روی نمایه در-حافظه — ترتیب نسبی بازماندگان حفظ می‌شود)
 *   ۳) ادغام RRF — سند حاضر در هر لیست فقط سهم همان لیست را می‌گیرد (بدون جریمه)
 *   ۴) مرتب‌سازی نزولی پایدار (تساوی → ترتیب درج: برداری اول) + برش topK
 *
 * وزن صفر = آن لیست کلاً اجرا نمی‌شود:
 *   w_v=0 ⇔ خروجی عین KeywordSearch (ترتیب هم) · w_k=0 ⇔ عین VectorSearch
 *
 * نام‌گذاری متمایز از قرارداد v1 (سند طراحی ۳-۱): HybridQuery/RetrievedItem —
 * قرارداد RetrievalQuery/RetrievalResult در engines/retrieval.ts دست‌نخورده است.
 *
 * مرز: صفر Prisma / صفر @/lib/db / صفر شبکه / صفر React (ممیزی --strict).
 */

import { applyMetadataFilter, type MetadataFilter } from "./metadata";
import { KeywordSearch, type BM25Options } from "./keyword-search";
import type { MemoryRecord, MemoryStore } from "../memory/memory-store";
import { VectorIndex, embedText, type EmbedFn, type VectorHit } from "../memory/vector-index";

// ===================== انواع =====================

/** تابع جستجوی برداری تزریقی — هم‌امضا با VectorIndex.search؛ async هم پذیرفته می‌شود */
export type VectorSearchFn = (query: number[], topK: number) => VectorHit[] | Promise<VectorHit[]>;

/** پرسش بازیابی ترکیبی — متن + تعبیه اختیاری + فیلتر متادیتای اختیاری */
export interface HybridQuery {
  text: string;
  embedding?: number[];
  filter?: MetadataFilter;
}

export interface HybridOptions {
  topK: number;
  /** وزن جستجوی برداری — پیش‌فرض 0.5 */
  weightVector?: number;
  /** وزن جستجوی کلیدواژه‌ای — پیش‌فرض 0.5 */
  weightKeyword?: number;
  /** پارامتر k در RRF — پیش‌فرض 60 */
  rrfK?: number;
  /** عمق هر لیست قبل از ادغام — پیش‌فرض 10000 (عمق کامل برای نمایه در-حافظه) */
  depth?: number;
}

/** منبعی که یک سند را یافته است */
export type RetrievalSource = "vector" | "keyword";

/** نتیجه per-item بازیابی ترکیبی — رکورد کامل + امتیاز ادغام + رتبه‌های منبع */
export interface RetrievedItem {
  record: MemoryRecord;
  score: number;
  sources: RetrievalSource[];
  vectorRank: number | null;
  keywordRank: number | null;
}

export interface HybridRetrieverDeps {
  vectorSearch: VectorSearchFn;
  keywordSearch: KeywordSearch;
  memoryStore: MemoryStore;
  /** تعبیه پرسش در صورت نبود query.embedding — پیش‌فرض embedText قطعی */
  embed?: EmbedFn;
}

// ===================== بازیابی ترکیبی =====================

/** عمق پیش‌فرض هر لیست — بزرگ‌تر از هر نمایه در-حافظه واقعی؛ برای هم‌ارزی با پیش‌فیلترِ واقعی باید عمق کامل باشد */
const DEFAULT_SEARCH_DEPTH = 10_000;

export class HybridRetriever {
  private readonly deps: Required<HybridRetrieverDeps>;

  constructor(deps: HybridRetrieverDeps) {
    this.deps = { embed: (text) => embedText(text), ...deps };
  }

  /** بازیابی ترکیبی — جزئیات جریان در سربرگ ماژول */
  async retrieve(query: HybridQuery, options: HybridOptions): Promise<RetrievedItem[]> {
    const topK = Math.max(0, Math.floor(options.topK));
    if (topK === 0) return [];
    const wV = Math.max(0, options.weightVector ?? 0.5);
    const wK = Math.max(0, options.weightKeyword ?? 0.5);
    if (wV === 0 && wK === 0) return [];
    const rrfK = options.rrfK ?? 60;

    // ۱) نامزدها — فیلتر متادیتا پیش از جستجو
    const candidates = await this.candidates(query.filter);
    if (candidates.length === 0) return [];
    const byId = new Map(candidates.map((c) => [c.id, c] as const));

    // ۲) دو جستجو — عمق کامل (نه اندازه نامزدها! برترین‌های جهانی ممکن است خارج از نامزدها باشند)،
    //    سپس برش به نامزدها — ترتیب نسبی بازماندگان حفظ می‌شود ⇔ هم‌ارز پیش‌فیلتر واقعی
    const depth = options.depth ?? DEFAULT_SEARCH_DEPTH;
    const runVector = wV > 0;
    const runKeyword = wK > 0;
    const embedding = query.embedding ?? this.deps.embed(query.text);
    const [vectorHitsAll, keywordHitsAll] = await Promise.all([
      runVector ? this.deps.vectorSearch(embedding, depth) : Promise.resolve([] as VectorHit[]),
      Promise.resolve(runKeyword ? this.deps.keywordSearch.search(query.text, depth) : []),
    ]);
    const vectorHits = (vectorHitsAll as VectorHit[]).filter((h) => byId.has(h.id));
    const keywordHits = keywordHitsAll.filter((h) => byId.has(h.id));

    // ۳) ادغام RRF وزن‌دار — سند فقط از لیست‌های وزن‌دار امتیاز می‌گیرد
    const fused = new Map<string, { score: number; vectorRank: number | null; keywordRank: number | null }>();
    for (let i = 0; i < vectorHits.length; i++) {
      const rank = i + 1;
      fused.set(vectorHits[i].id, { score: wV / (rrfK + rank), vectorRank: rank, keywordRank: null });
    }
    for (let i = 0; i < keywordHits.length; i++) {
      const rank = i + 1;
      const existing = fused.get(keywordHits[i].id);
      if (existing) {
        existing.score += wK / (rrfK + rank);
        existing.keywordRank = rank;
      } else {
        fused.set(keywordHits[i].id, { score: wK / (rrfK + rank), vectorRank: null, keywordRank: rank });
      }
    }

    // ۴) مرتب‌سازی نزولی پایدار (تساوی → ترتیب درج: برداری اول) + برش topK
    const entries = [...fused.entries()].sort((a, b) => b[1].score - a[1].score);
    const out: RetrievedItem[] = [];
    for (const [id, f] of entries) {
      const record = byId.get(id);
      if (!record) continue;
      const sources: RetrievalSource[] = [];
      if (f.vectorRank !== null) sources.push("vector");
      if (f.keywordRank !== null) sources.push("keyword");
      out.push({ record, score: f.score, sources, vectorRank: f.vectorRank, keywordRank: f.keywordRank });
      if (out.length >= topK) break;
    }
    return out;
  }

  /** نامزدسازی — قابلیت اختیاری فروشگاه یا مسیر جایگزین محلی (duck-typing) */
  private async candidates(filter?: MetadataFilter): Promise<MemoryRecord[]> {
    if (filter) {
      if (typeof this.deps.memoryStore.queryWithFilter === "function") {
        return this.deps.memoryStore.queryWithFilter(filter);
      }
      const all = await this.deps.memoryStore.query({});
      return applyMetadataFilter(all, filter);
    }
    return this.deps.memoryStore.query({});
  }
}

// ===================== کارخانه متصل به فروشگاه =====================

/** دستگیره بازیابی ترکیبی متصل به فروشگاه — با sync برای همگام‌سازی پس از الحاق */
export interface HybridRetrieverHandle {
  retriever: HybridRetriever;
  keywordSearch: KeywordSearch;
  vectorIndex: VectorIndex;
  /** بازسازی نمایه‌ها از فروشگاه — پس از الحاق رکوردهای جدید */
  sync(): Promise<void>;
}

export interface CreateHybridRetrieverOptions {
  store: MemoryStore;
  /** تعبیه — پیش‌فرض embedText قطعی ۶۴ بعدی (باید با تعبیه رکوردها یکی باشد) */
  embed?: EmbedFn;
  bm25?: BM25Options;
}

/**
 * کارخانه: ساخت HybridRetriever متصل به فروشگاه با نمایه‌های داخلی و sync اولیه.
 * توجه: نمایه‌ها عکس لحظهٔ sync اند — پس از الحاق، sync را صدا بزنید
 * (RetrievalEngineImpl در هر retrieve این کار را می‌کند — همیشه تازه، قطعی).
 */
export async function createHybridRetriever(
  options: CreateHybridRetrieverOptions,
): Promise<HybridRetrieverHandle> {
  const embed: EmbedFn = options.embed ?? ((text) => embedText(text));
  const keywordSearch = new KeywordSearch(options.bm25);
  const vectorIndex = new VectorIndex({ embed });
  const handle: HybridRetrieverHandle = {
    keywordSearch,
    vectorIndex,
    retriever: new HybridRetriever({
      vectorSearch: (query, topK) => vectorIndex.search(query, topK),
      keywordSearch,
      memoryStore: options.store,
      embed,
    }),
    async sync() {
      keywordSearch.clear();
      vectorIndex.clear();
      const all = await options.store.query({});
      for (const r of all) {
        keywordSearch.index(r.id, r.text);
        vectorIndex.add(r.id, r.embedding);
      }
    },
  };
  await handle.sync();
  return handle;
}
