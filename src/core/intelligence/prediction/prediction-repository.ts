/**
 * درگاه ذخیره‌سازی پیش‌بینی (PredictionRepository) — PHASE 6 / P6-05
 * ------------------------------------------------------
 * زیرساخت ذخیره PredictionRecord به‌شکلی که در PHASE 7 قابل‌ارزیابی باشد.
 * دو پیاده‌سازی:
 *  - InMemoryPredictionRepository (تست/پیش‌فرض): Map در حافظه
 *  - FileSystemPredictionRepository (production بدون Schema): JSONL الحاقی،
 *    بارگذاری تنبل، صلب در برابر خط خراب (الگوی P4-02/P6-03)
 *
 * صفر Migration — فقط file/in-memory (قاعده فاز).
 *
 * قرارداد (دستور P6-05 + سند طراحی بند ۳-۷):
 *  - findPendingOutcome(olderThan): createdAt < olderThan && فاقد linkedOutcomeId
 *    — دقیقاً ورودی حلقه Outcome در PHASE 7؛ مرتب قدیمی‌ترین-اول.
 *  - linkOutcome: رکورد ناموجود ⇔ خطا (یکپارچگی داده — پیوند به هیچ، ساکت نمی‌ماند).
 *  - findByEntity/findByModel: جدیدترین-اول (createdAt نزولی، پایدار روی تساوی).
 */

import { mkdirSync, appendFileSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type { PredictionRecord } from "./prediction-record";

// ===================== درگاه =====================

export interface PredictionRepository {
  save(prediction: PredictionRecord): Promise<void>;
  findById(predictionId: string): Promise<PredictionRecord | null>;
  findByEntity(entityId: string, entityType: string): Promise<PredictionRecord[]>;
  findByModel(modelVersion: string, limit?: number): Promise<PredictionRecord[]>;
  /** PHASE 7 — رکوردهای سررسیدشده بدون نتیجه وصله‌شده (قدیمی‌ترین-اول) */
  findPendingOutcome(olderThan: Date, limit?: number): Promise<PredictionRecord[]>;
  /** PHASE 7 — پیوند نتیجه واقعی به پیش‌بینی؛ رکورد ناموجود ⇔ خطا */
  linkOutcome(predictionId: string, outcomeId: string): Promise<void>;
}

// ===================== کمکی‌های مشترک =====================

/** بازگرداندن مهرهای زمانی پس از JSON (createdAt/capturedAt) */
function reviveRecord(raw: PredictionRecord): PredictionRecord {
  return {
    ...raw,
    createdAt: new Date(raw.createdAt),
    contextSnapshot: {
      ...raw.contextSnapshot,
      capturedAt: new Date(raw.contextSnapshot.capturedAt),
    },
  };
}

/** جدیدترین-اول؛ پایدار روی تساوی */
function sortByNewest(records: PredictionRecord[]): PredictionRecord[] {
  return [...records].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

/** قدیمی‌ترین-اول؛ پایدار روی تساوی */
function sortByOldest(records: PredictionRecord[]): PredictionRecord[] {
  return [...records].sort((a, b) => (a.createdAt > b.createdAt ? 1 : a.createdAt < b.createdAt ? -1 : 0));
}

// ===================== پیاده‌سازی در حافظه =====================

export class InMemoryPredictionRepository implements PredictionRepository {
  private readonly records = new Map<string, PredictionRecord>();

  async save(prediction: PredictionRecord): Promise<void> {
    this.records.set(prediction.predictionId, prediction);
  }

  async findById(predictionId: string): Promise<PredictionRecord | null> {
    return this.records.get(predictionId) ?? null;
  }

  async findByEntity(entityId: string, entityType: string): Promise<PredictionRecord[]> {
    return sortByNewest(
      Array.from(this.records.values()).filter(
        (r) => r.contextSnapshot.entityId === entityId && r.contextSnapshot.entityType === entityType,
      ),
    );
  }

  async findByModel(modelVersion: string, limit?: number): Promise<PredictionRecord[]> {
    const out = sortByNewest(Array.from(this.records.values()).filter((r) => r.modelVersion === modelVersion));
    return typeof limit === "number" && limit >= 0 ? out.slice(0, limit) : out;
  }

  async findPendingOutcome(olderThan: Date, limit?: number): Promise<PredictionRecord[]> {
    const pending = Array.from(this.records.values()).filter(
      (r) => r.createdAt.getTime() < olderThan.getTime() && r.linkedOutcomeId === undefined,
    );
    const sorted = sortByOldest(pending);
    return typeof limit === "number" && limit >= 0 ? sorted.slice(0, limit) : sorted;
  }

  async linkOutcome(predictionId: string, outcomeId: string): Promise<void> {
    const record = this.records.get(predictionId);
    if (!record) {
      throw new Error(`linkOutcome: پیش‌بینی «${predictionId}» یافت نشد`);
    }
    this.records.set(predictionId, { ...record, linkedOutcomeId: outcomeId });
  }
}

// ===================== پیاده‌سازی فایل (JSONL) =====================

/**
 * ذخیره‌سازی فایل — JSONL الحاقی:
 *  - save: الحاق خط (id تکراری = بازنویسی منطقی؛ خواندن «آخرین» برنده است)
 *  - بارگذاری تنبل + خط خراب‌پذیرا
 *  - linkOutcome: بازنویسی کل فایل با رکورد اصلاح‌شده (حجم فعلی کوچک — سنداً ثبت شد)
 *  - خواندن: آخرین رخداد هر predictionId ملاک است
 */
export class FileSystemPredictionRepository implements PredictionRepository {
  private loaded = false;
  private entries: PredictionRecord[] = [];

  constructor(private readonly filePath: string) {}

  private ensureLoaded(): void {
    if (this.loaded) return;
    this.loaded = true;
    if (!existsSync(this.filePath)) return;
    const raw = readFileSync(this.filePath, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed) as PredictionRecord;
        if (typeof parsed?.predictionId === "string" && parsed?.contextSnapshot) {
          this.entries.push(reviveRecord(parsed));
        }
      } catch {
        // خط ناقص/خراب — نادیده گرفته می‌شود (الگوی P4-02)
      }
    }
  }

  /** نگاشت آخرین رخداد هر شناسه (الحاق بعدی ملاک است) */
  private latestById(): Map<string, PredictionRecord> {
    this.ensureLoaded();
    const map = new Map<string, PredictionRecord>();
    for (const e of this.entries) map.set(e.predictionId, e);
    return map;
  }

  private persistAll(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(
      this.filePath,
      this.entries.map((e) => JSON.stringify(e)).join("\n") + (this.entries.length ? "\n" : ""),
      "utf8",
    );
  }

  async save(prediction: PredictionRecord): Promise<void> {
    this.ensureLoaded();
    this.entries.push(prediction);
    mkdirSync(dirname(this.filePath), { recursive: true });
    appendFileSync(this.filePath, JSON.stringify(prediction) + "\n", "utf8");
  }

  async findById(predictionId: string): Promise<PredictionRecord | null> {
    return this.latestById().get(predictionId) ?? null;
  }

  async findByEntity(entityId: string, entityType: string): Promise<PredictionRecord[]> {
    return sortByNewest(
      Array.from(this.latestById().values()).filter(
        (r) => r.contextSnapshot.entityId === entityId && r.contextSnapshot.entityType === entityType,
      ),
    );
  }

  async findByModel(modelVersion: string, limit?: number): Promise<PredictionRecord[]> {
    const out = sortByNewest(
      Array.from(this.latestById().values()).filter((r) => r.modelVersion === modelVersion),
    );
    return typeof limit === "number" && limit >= 0 ? out.slice(0, limit) : out;
  }

  async findPendingOutcome(olderThan: Date, limit?: number): Promise<PredictionRecord[]> {
    const pending = Array.from(this.latestById().values()).filter(
      (r) => r.createdAt.getTime() < olderThan.getTime() && r.linkedOutcomeId === undefined,
    );
    const sorted = sortByOldest(pending);
    return typeof limit === "number" && limit >= 0 ? sorted.slice(0, limit) : sorted;
  }

  async linkOutcome(predictionId: string, outcomeId: string): Promise<void> {
    this.ensureLoaded();
    // آخرین رخداد همان شناسه اصلاح می‌شود
    let fixed = false;
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i]!;
      if (e.predictionId === predictionId) {
        this.entries[i] = { ...e, linkedOutcomeId: outcomeId };
        fixed = true;
        break; // فقط آخرین
      }
    }
    if (!fixed) {
      throw new Error(`linkOutcome: پیش‌بینی «${predictionId}» یافت نشد`);
    }
    this.persistAll();
  }
}
