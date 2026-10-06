/**
 * انبار پیامد (OutcomeStore) — PHASE 7 / بدنه
 * ------------------------------------------------------
 * ذخیره‌سازی الحاقی OutcomeRecord — دو پیاده‌سازی عین الگوی
 * P6-05 (PredictionRepository):
 *  - InMemoryOutcomeStore (تست/پیش‌فرض): Map در حافظه
 *  - FileSystemOutcomeStore (production بدون Schema): JSONL الحاقی،
 *    بارگذاری تنبل، صلب در برابر خط خراب
 *
 * صفر Migration — فقط file/in-memory (قاعده فاز).
 * مرز: صفر Prisma / صفر fetch / صفر react (گارد P3-06).
 */

import { mkdirSync, appendFileSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type { OutcomeRecord } from "../engines/outcome";

// ===================== رکورد ذخیره‌شده =====================

/**
 * OutcomeRecord قراردادی (v1) شناسه ندارد؛ انبار برای یکپارچگی
 * پیوند (predictionRepository.linkOutcome) شناسهٔ پایدار می‌سازد —
 * فیلدهای افزودنی، شکل v1 را دست‌نخورده نگه می‌دارند.
 */
export interface StoredOutcomeRecord extends OutcomeRecord {
  outcomeId: string;
  recordedAt: string;
}

// ===================== درگاه =====================

export interface OutcomeStore {
  append(entry: OutcomeRecord): Promise<StoredOutcomeRecord>;
  /** همهٔ رکوردها — جدیدترین-اول (occurredAt نزولی، پایدار روی تساوی) */
  list(): Promise<StoredOutcomeRecord[]>;
  /** حذف — فقط چرخهٔ عمر تست؛ موتور هرگز حذف نمی‌کند (سیاست الحاقی) */
  clear(): Promise<void>;
}

// ===================== کمکی‌های مشترک =====================

/** شناسهٔ پایدار و بازتولیدپذیر — از محتوای رکورد (بدون UUID تصادفی) */
export function makeOutcomeId(entry: OutcomeRecord, index: number): string {
  const key = `${entry.tileId}|${entry.predictionId ?? "no-prediction"}|${entry.outcome}|${entry.occurredAt}|${index}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < key.length; i++) {
    h1 = (h1 ^ key.charCodeAt(i)) * 0x01000193;
    h2 = (h2 + key.charCodeAt(i) * (i + 7)) | 0;
  }
  return `out-${((h1 >>> 0) % 0xffffffff).toString(16).padStart(8, "0")}${(h2 >>> 0).toString(16).padStart(8, "0")}`;
}

/** اعتبارسنجی ورودی — پیش‌شرط هر append */
export function validateOutcomeEntry(entry: OutcomeRecord): string | null {
  if (!entry.tileId || entry.tileId.trim() === "") return "tileId الزامی است";
  if (!entry.outcome || entry.outcome.trim() === "") return "outcome الزامی است";
  if (Number.isNaN(Date.parse(entry.occurredAt))) return "occurredAt باید ISO معتبر باشد";
  return null;
}

function sortByNewest(records: StoredOutcomeRecord[]): StoredOutcomeRecord[] {
  return [...records].sort((a, b) =>
    a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : a.outcomeId < b.outcomeId ? 1 : -1,
  );
}

// ===================== در حافظه =====================

export class InMemoryOutcomeStore implements OutcomeStore {
  private readonly records: StoredOutcomeRecord[] = [];

  async append(entry: OutcomeRecord): Promise<StoredOutcomeRecord> {
    const stored: StoredOutcomeRecord = {
      ...entry,
      outcomeId: makeOutcomeId(entry, this.records.length),
      recordedAt: new Date().toISOString(),
    };
    this.records.push(stored);
    return stored;
  }

  async list(): Promise<StoredOutcomeRecord[]> {
    return sortByNewest(this.records);
  }

  async clear(): Promise<void> {
    this.records.length = 0;
  }
}

// ===================== فایل‌سیستم (JSONL) =====================

export class FileSystemOutcomeStore implements OutcomeStore {
  private cache: StoredOutcomeRecord[] | null = null;
  /** شمارندهٔ الحاق — برای شناسه‌های پایدار و یکتا در طول عمر فایل */
  private appendCount = 0;

  constructor(private readonly filePath: string) {}

  private ensureLoaded(): StoredOutcomeRecord[] {
    if (this.cache) return this.cache;
    const records: StoredOutcomeRecord[] = [];
    if (existsSync(this.filePath)) {
      const lines = readFileSync(this.filePath, "utf8").split("\n");
      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        try {
          records.push(JSON.parse(t) as StoredOutcomeRecord);
          this.appendCount += 1;
        } catch {
          // خط خراب = نادیده (صلب‌بودن — الگوی P4-02/P6-05)
        }
      }
    }
    this.cache = records;
    return records;
  }

  async append(entry: OutcomeRecord): Promise<StoredOutcomeRecord> {
    const records = this.ensureLoaded();
    const stored: StoredOutcomeRecord = {
      ...entry,
      outcomeId: makeOutcomeId(entry, this.appendCount),
      recordedAt: new Date().toISOString(),
    };
    records.push(stored);
    this.appendCount += 1;
    mkdirSync(dirname(this.filePath), { recursive: true });
    appendFileSync(this.filePath, `${JSON.stringify(stored)}\n`, "utf8");
    return stored;
  }

  async list(): Promise<StoredOutcomeRecord[]> {
    return sortByNewest(this.ensureLoaded());
  }

  async clear(): Promise<void> {
    this.cache = [];
    this.appendCount = 0;
    if (existsSync(this.filePath)) writeFileSync(this.filePath, "", "utf8");
  }
}
