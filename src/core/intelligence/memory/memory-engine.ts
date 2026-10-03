/**
 * بدنه موتور حافظه (MemoryEngineImpl) — PHASE 4
 * ------------------------------------------------------
 * پیاده‌سازی قرارداد MemoryEngine نسخه ۱ (PHASE 3) + قابلیت‌های افزودنی.
 *
 * وفاداری به قرارداد (سند طراحی بند ۲):
 *  - متدهای قراردادی دقیقاً append(MemoryAppend) و query(MemoryQuery) اند و
 *    خروجی query دقیقاً هفت فیلد MemoryEntry است — نه بیشتر.
 *  - قابلیت‌های غنی‌تر (retrieveSimilar / consolidate / stats / reindex)
 *    «متد افزودنی روی کلاس» اند، نه عضو interface — نسخه قرارداد ۱ دست‌نخورده.
 *
 * خط‌مشی append-only: موتور هرگز deleteById/clear درگاه را صدا نمی‌زند.
 *  - extract: استخراج text/sentiment از payload (قرارداد داده: payload.text
 *    رشته‌ای، payload.sentiment عددی؛ نبودِ آن‌ها → سریال‌سازی پایدار / خنثی).
 *  - consolidate: ادغام فقط «رکورد جدید» اضافه می‌کند (mergedIds در payload) —
 *    اصل‌ها حذف نمی‌شوند.
 *
 * مرز: صفر Prisma / صفر @/lib/db / صفر شبکه / صفر React.
 */

import { randomUUID } from "node:crypto";
import type { MemoryAppend, MemoryEngine, MemoryEntry, MemoryLayer, MemoryQuery } from "../engines/memory";
import { InMemoryStore, type MemoryRecord, type MemoryStore } from "./memory-store";
import { VectorIndex, cosineSimilarity, embedText, type EmbedFn } from "./vector-index";

// ===================== گزینه‌ها =====================

export interface MemoryEngineOptions {
  /** درگاه ذخیره‌سازی — پیش‌فرض: InMemoryStore */
  store?: MemoryStore;
  /** تابع تعبیه تزریقی — پیش‌فرض: embedText قطعی ۶۴ بعدی */
  embed?: EmbedFn;
}

// ===================== انواع افزودنی =====================

/** نتیجه جستجوی شباهت — ورودی قراردادی + امتیاز شباهت */
export interface SimilarMemoryHit {
  entry: MemoryEntry;
  score: number;
}

export interface ConsolidateOptions {
  /** آستانه شباهت کسینوسی برای هم‌گروهی — پیش‌فرض ۰٫۷۵ */
  threshold?: number;
  /** حداقل اندازه گروه برای ادغام — پیش‌فرض ۲ */
  minGroup?: number;
  /** محدود کردن داوطلبان ادغام به این لایه */
  layer?: MemoryLayer;
  /** ادغامِ رکوردهای ادغام‌شده قبلی — پیش‌فرض false (زنجیره نکند) */
  includeConsolidated?: boolean;
}

export interface ConsolidationGroup {
  /** شناسه رکورد نماینده گروه (جدیدترین عضو) */
  representativeId: string;
  /** شناسه همه اعضا به‌جز نماینده */
  mergedIds: string[];
  size: number;
  /** شناسه رکورد «ادغام‌شده» تازه‌ای که افزوده شد */
  consolidatedEntryId: string;
}

export interface ConsolidationReport {
  groups: ConsolidationGroup[];
  /** تعداد رکوردهای بررسی‌شده به‌عنوان داوطلب */
  scanned: number;
  threshold: number;
}

export interface MemoryEngineStats {
  entries: number;
  byLayer: Partial<Record<MemoryLayer, number>>;
}

// ===================== ابزار استخراج =====================

/** سریال‌سازی پایدار JSON — کلیدهای شیء به‌صورت بازگشتی مرتب می‌شوند */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/** استخراج متن ورودی — payload.text رشته‌ای یا سریال‌سازی پایدار کل payload */
function extractText(payload: Record<string, unknown>): string {
  const text = payload.text;
  if (typeof text === "string" && text.trim().length > 0) return text;
  return stableStringify(payload);
}

/** قطع‌کردن عدد به علامت — قرارداد sentiment: +1 / -1 / 0 */
function clampSentiment(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n === 0) return 0;
  return n > 0 ? 1 : -1;
}

/** نگاشت رکورد داخلی به هفت فیلد قراردادی MemoryEntry */
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

// ===================== موتور =====================

export class MemoryEngineImpl implements MemoryEngine {
  readonly contractVersion = 1 as const;

  private readonly store: MemoryStore;
  private readonly index: VectorIndex;

  constructor(options: MemoryEngineOptions = {}) {
    this.store = options.store ?? new InMemoryStore();
    this.index = new VectorIndex({ embed: options.embed ?? ((text) => embedText(text)) });
  }

  // ---------- متدهای قرارداد v1 ----------

  async append(entry: MemoryAppend): Promise<void> {
    const text = extractText(entry.payload);
    const record: MemoryRecord = {
      id: randomUUID(),
      tileId: entry.tileId,
      layer: entry.layer,
      kind: entry.kind,
      text,
      sentiment: clampSentiment(entry.payload.sentiment),
      createdAt: new Date().toISOString(),
      embedding: this.index.embedder(text),
    };
    await this.store.save(record);
    this.index.add(record.id, record.embedding);
  }

  async query(query: MemoryQuery): Promise<MemoryEntry[]> {
    const records = await this.store.query({
      tileId: query.tileId,
      layer: query.layer,
      kinds: query.kinds,
      since: query.since,
      take: query.take,
    });
    return records.map(toEntry);
  }

  // ---------- قابلیت‌های افزودنی (خارج از قرارداد v1) ----------

  /** جستجوی شباهت برداری — رتبه‌بندی از طریق VectorIndex، محدود به همان tileId، نزولی بر امتیاز */
  async retrieveSimilar(tileId: string, text: string, topK = 5): Promise<SimilarMemoryHit[]> {
    const k = Math.max(0, Math.floor(topK));
    if (k === 0) return [];
    // همگام‌سازی تنبل: فروشگاه فایلِ تازه‌بارگذاری‌شده نمایه خالی دارد — یک بار بازسازی می‌شود
    if (this.index.size === 0) await this.reindex();
    const tileRecords = await this.store.query({ tileId });
    if (tileRecords.length === 0) return [];
    const byId = new Map(tileRecords.map((r) => [r.id, r] as const));
    const qVec = this.index.embedder(text);
    // جستجوی جهانی روی نمایه، سپس برش به محدوده tileId — هم‌ارز رتبه‌بندی مستقیم
    const ranked = this.index.search(qVec, this.index.size);
    const out: SimilarMemoryHit[] = [];
    for (const hit of ranked) {
      const record = byId.get(hit.id);
      if (!record || hit.score <= 0) continue;
      out.push({ entry: toEntry(record), score: hit.score });
      if (out.length >= k) break;
    }
    return out;
  }

  /**
   * تثبیت حافظه — گروه‌بندی طمع‌وانه رکوردهای مشابه و درج یک رکورد «ادغام‌شده»
   * برای هر گروه (kind=CONSOLIDATED، layer=SEMANTIC، mergedIds در payload).
   * اصل‌ها طبق خط‌مشی append-only حذف نمی‌شوند؛ خروجی = گزارش.
   */
  async consolidate(tileId: string, options: ConsolidateOptions = {}): Promise<ConsolidationReport> {
    const threshold = options.threshold ?? 0.75;
    const minGroup = Math.max(2, options.minGroup ?? 2);
    const candidates = await this.store.query({ tileId, layer: options.layer });
    // رکوردهای «جذب‌شده» در ادغام‌های قبلی از داوطلبان حذف می‌شوند — اجرای مکرر
    // گروه تازه نمی‌سازد (نماینده گروه زنده می‌ماند تا با ورودی‌های جدید آینده گروه شود).
    const absorbed = new Set<string>();
    if (!options.includeConsolidated) {
      const prior = await this.store.query({ tileId, kinds: ["CONSOLIDATED"] });
      for (const c of prior) {
        const merged = c.metadata?.mergedIds;
        if (Array.isArray(merged)) {
          for (const id of merged) if (typeof id === "string") absorbed.add(id);
        }
      }
    }
    const pool = candidates.filter(
      (r) => (options.includeConsolidated || r.kind !== "CONSOLIDATED") && !absorbed.has(r.id),
    );

    const groups: ConsolidationGroup[] = [];
    const consumed = new Set<string>();

    for (const seed of pool) {
      if (consumed.has(seed.id)) continue;
      const members = [seed];
      for (const other of pool) {
        if (other.id === seed.id || consumed.has(other.id)) continue;
        if (cosineSimilarity(seed.embedding, other.embedding) >= threshold) {
          members.push(other);
        }
      }
      if (members.length >= minGroup) {
        for (const m of members) consumed.add(m.id);
        // نماینده = جدیدترین عضو (pool از store جدیدترین‌اول مرتب شده است)
        const representative = members[0];
        const mergedIds = members.slice(1).map((m) => m.id);
        const consolidatedEntryId = randomUUID();
        const text = `ادغام ${members.length} رکورد مشابه (شباهت ≥ ${threshold}) — نماینده: ${representative.text.slice(0, 240)}`;
        const record: MemoryRecord = {
          id: consolidatedEntryId,
          tileId,
          layer: "SEMANTIC",
          kind: "CONSOLIDATED",
          text,
          sentiment: 0,
          createdAt: new Date().toISOString(),
          embedding: this.index.embedder(text),
          // فراداده داخلی برای حسابرسی ادغام — خارج از قرارداد v1 (با toEntry کنار گذاشته می‌شود)
          metadata: {
            mergedIds: members.map((m) => m.id),
            representativeId: representative.id,
            threshold,
            consolidatedAt: new Date().toISOString(),
          },
        };
        await this.store.save(record);
        this.index.add(record.id, record.embedding);
        groups.push({ representativeId: representative.id, mergedIds, size: members.length, consolidatedEntryId });
      }
    }

    return { groups, scanned: pool.length, threshold };
  }

  /** آمار موتور — تعداد کل و تفکیک لایه */
  async stats(): Promise<MemoryEngineStats> {
    const all = await this.store.query({});
    const byLayer: Partial<Record<MemoryLayer, number>> = {};
    for (const r of all) byLayer[r.layer] = (byLayer[r.layer] ?? 0) + 1;
    return { entries: all.length, byLayer };
  }

  /** بازسازی نمایه برداری از درگاه — همگام‌سازی پس از بارگذاری تنبل فایل */
  async reindex(): Promise<void> {
    this.index.clear();
    const all = await this.store.query({});
    for (const r of all) this.index.add(r.id, r.embedding);
  }
}

// ===================== کارخانه =====================

/** کارخانه موتور حافظه — هم‌ارز new MemoryEngineImpl(options) */
export function createMemoryEngine(options: MemoryEngineOptions = {}): MemoryEngineImpl {
  return new MemoryEngineImpl(options);
}
