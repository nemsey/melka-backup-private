/**
 * درگاه ذخیره‌سازی حافظه (MemoryStore) — PHASE 4 / بدنه موتور حافظه
 * ------------------------------------------------------
 * درگاه قابل‌تعویض زیر MemoryEngineImpl. دو پیاده‌سازی:
 *  - InMemoryStore (پیش‌فرض): Map در حافظه — صفر وابستگی، صفر اثر جانبی
 *  - FileSystemStore (اختیاری): JSONL الحاقی با بارگذاری تنبل — «فایل، نه Migration»
 *
 * مرز (قوانین اجرایی):
 *  - صفر Prisma / صفر @/lib/db / صفر شبکه / صفر React (ممیزی --strict).
 *  - «append-only» خط‌مشی موتور حافظه است، نه محدودیت درگاه:
 *    deleteById/clear فقط برای تست و چرخه عمر نگهداری می‌شوند و
 *    MemoryEngineImpl هرگز آن‌ها را فراخوانی نمی‌کند (سند طراحی بند ۳-۱).
 *  - ترتیب query: جدیدترین‌اول (createdAt نزولی)؛ پایدار روی تساوی (ترتیب درج).
 */

import { mkdirSync, appendFileSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type { MemoryEntry, MemoryLayer } from "../engines/memory";

// ===================== انواع درگاه =====================

/** رکورد داخلی ذخیره‌سازی: ورودی قراردادی + بردار تعبیه از پیش محاسبه‌شده */
export interface MemoryRecord extends MemoryEntry {
  /** بردار نرمال‌شده تعبیه متن — با embedText محاسبه و یک بار ذخیره می‌شود */
  embedding: number[];
  /** فراداده داخلی (خارج از قرارداد v1) — مثلاً mergedIds رکوردهای ادغام‌شده */
  metadata?: Record<string, unknown>;
}

/** فیلترهای درگاه — زیرمجموعه سازگار با MemoryQuery قرارداد v1 */
export interface MemoryStoreQuery {
  tileId?: string;
  layer?: MemoryLayer;
  kinds?: string[];
  /** ISO 8601 — فقط ورودی‌های با createdAt بزرگ‌تر از این زمان (مقایسه رشته‌ای ISO) */
  since?: string;
  /** حداکثر تعداد نتیجه — جدیدترین‌اول */
  take?: number;
}

export interface MemoryStore {
  save(record: MemoryRecord): Promise<void>;
  findById(id: string): Promise<MemoryRecord | null>;
  query(query: MemoryStoreQuery): Promise<MemoryRecord[]>;
  /** فقط تست/چرخه عمر — موتور حافظه هرگز صدا نمی‌زند (append-only) */
  deleteById(id: string): Promise<void>;
  /** فقط تست/چرخه عمر — موتور حافظه هرگز صدا نمی‌زند (append-only) */
  clear(): Promise<void>;
}

// ===================== منطق مشترک فیلتر/مرتب‌سازی =====================

/** اجرای فیلترهای مشترک روی فهرست — جدیدترین‌اول، پایدار روی تساوی */
export function applyMemoryQuery(records: MemoryRecord[], query: MemoryStoreQuery): MemoryRecord[] {
  let out = records;
  if (query.tileId !== undefined) out = out.filter((r) => r.tileId === query.tileId);
  if (query.layer !== undefined) out = out.filter((r) => r.layer === query.layer);
  if (query.kinds !== undefined && query.kinds.length > 0) {
    const wanted = new Set(query.kinds);
    out = out.filter((r) => wanted.has(r.kind));
  }
  if (query.since !== undefined) out = out.filter((r) => r.createdAt > query.since!);
  // مرتب‌سازی پایدار جدیدترین‌اول: sort پایدار است؛ تساوی createdAt ترتیب درج را نگه می‌دارد
  out = [...out].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  if (query.take !== undefined && query.take >= 0) out = out.slice(0, query.take);
  return out;
}

// ===================== پیاده‌سازی در حافظه =====================

/** ذخیره‌سازی در حافظه — پیش‌فرض PHASE 4. مناسب ایجنت‌ها و تست‌ها. */
export class InMemoryStore implements MemoryStore {
  private readonly records = new Map<string, MemoryRecord>();

  async save(record: MemoryRecord): Promise<void> {
    this.records.set(record.id, record);
  }

  async findById(id: string): Promise<MemoryRecord | null> {
    return this.records.get(id) ?? null;
  }

  async query(query: MemoryStoreQuery): Promise<MemoryRecord[]> {
    return applyMemoryQuery(Array.from(this.records.values()), query);
  }

  async deleteById(id: string): Promise<void> {
    this.records.delete(id);
  }

  async clear(): Promise<void> {
    this.records.clear();
  }
}

// ===================== پیاده‌سازی فایل (JSONL) =====================

/**
 * ذخیره‌سازی فایل — JSONL الحاقی (یک رکورد در هر خط).
 *  - بارگذاری تنبل: نخستین خواندن، فایل موجود را یک بار می‌خواند؛
 *    خط‌های خراب بی‌صدا نادیده گرفته می‌شوند (صلبیت در برابر نوشتار ناقص).
 *  - save فقط «الحاق» می‌کند (append-only روی دیسک)؛ deleteById/clear
 *    کل فایل را بازنویسی می‌کنند (فقط برای تست/چرخه عمر).
 */
export class FileSystemStore implements MemoryStore {
  private loaded = false;
  private records: MemoryRecord[] = [];

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
        const parsed = JSON.parse(trimmed) as MemoryRecord;
        if (typeof parsed?.id === "string" && typeof parsed?.tileId === "string") {
          this.records.push(parsed);
        }
      } catch {
        // خط ناقص/خراب — نادیده گرفته می‌شود (سند طراحی: صلبیت بارگذاری)
      }
    }
  }

  private persistAll(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(
      this.filePath,
      this.records.map((r) => JSON.stringify(r)).join("\n") + (this.records.length ? "\n" : ""),
      "utf8",
    );
  }

  async save(record: MemoryRecord): Promise<void> {
    this.ensureLoaded();
    // جایگزینی هم‌شناسه (id تصادفی — عملاً رخ نمی‌دهد) + الحاق به فایل
    const idx = this.records.findIndex((r) => r.id === record.id);
    if (idx >= 0) {
      this.records[idx] = record;
      this.persistAll();
      return;
    }
    this.records.push(record);
    mkdirSync(dirname(this.filePath), { recursive: true });
    appendFileSync(this.filePath, JSON.stringify(record) + "\n", "utf8");
  }

  async findById(id: string): Promise<MemoryRecord | null> {
    this.ensureLoaded();
    return this.records.find((r) => r.id === id) ?? null;
  }

  async query(query: MemoryStoreQuery): Promise<MemoryRecord[]> {
    this.ensureLoaded();
    return applyMemoryQuery(this.records, query);
  }

  async deleteById(id: string): Promise<void> {
    this.ensureLoaded();
    this.records = this.records.filter((r) => r.id !== id);
    this.persistAll();
  }

  async clear(): Promise<void> {
    this.loaded = true;
    this.records = [];
    this.persistAll();
  }
}
