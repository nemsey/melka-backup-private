/**
 * درگاه ذخیره‌سازی ویژگی (FeatureStore) — PHASE 6 / P6-03
 * ------------------------------------------------------
 * کش نسخه‌دار FeatureSetها برای FeatureEngineImpl. دو پیاده‌سازی:
 *  - InMemoryFeatureStore (پیش‌فرض): Map در حافظه — صفر وابستگی
 *  - FileSystemFeatureStore (اختیاری): JSONL الحاقی با بارگذاری تنبل
 *    (الگوی P4-02) — «فایل، نه Migration».
 *
 * قرارداد (دستور P6-03 + سند طراحی بند ۳-۶):
 *  - save(key, features, version) / load<T>(key, version):
 *    نسخه‌ی ناهماهنگ ⇔ null (بدون بازگشت خاموش مقدار کهنه).
 *  - invalidate(pattern): تطبیق «زیررشته‌ای» صادقانه — بدون glob؛ سنداً ثبت شد.
 *  - load همیشه structuredClone برمی‌گرداند تا فراخواننده با جهش،
 *    کش را نفسد نکند.
 *
 * مرز: صفر Prisma / صفر @/lib/db / صفر fetch / صفر React.
 * سیاست کش: کلید = «{نوع}:{شناسه}» — به‌روزرسانی ورودی‌ای مثل بازار
 * نیازمند invalidate توسط مصرف‌کننده است (مصرف واقعی از PHASE 7).
 */

import { mkdirSync, appendFileSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { dirname } from "node:path";

// ===================== درگاه =====================

export interface FeatureStore {
  save(key: string, features: unknown, version: string): Promise<void>;
  load<T>(key: string, version: string): Promise<T | null>;
  /** حذف همه کلیدهای شامل «pattern» (زیررشته — بدون glob) */
  invalidate(pattern: string): Promise<void>;
  clear(): Promise<void>;
}

/** رکورد داخلی JSONL فروشگاه فایلی */
interface FeatureStoreEntry {
  key: string;
  version: string;
  features: unknown;
  /** ISO 8601 — فقط متادیتای ذخیره‌سازی (نه بخشی از ویژگی) */
  savedAt: string;
}

// ===================== پیاده‌سازی در حافظه =====================

export class InMemoryFeatureStore implements FeatureStore {
  private readonly entries = new Map<string, FeatureStoreEntry>();

  async save(key: string, features: unknown, version: string): Promise<void> {
    // ذخیره با مهر زمان ذخیره‌سازی — خارج از شکل ویژگی
    this.entries.set(`${key}\u0000${version}`, {
      key,
      version,
      features,
      savedAt: new Date().toISOString(),
    });
  }

  async load<T>(key: string, version: string): Promise<T | null> {
    const hit = this.entries.get(`${key}\u0000${version}`);
    return hit ? (structuredClone(hit.features) as T) : null;
  }

  async invalidate(pattern: string): Promise<void> {
    for (const composite of Array.from(this.entries.keys())) {
      if (composite.includes(pattern)) this.entries.delete(composite);
    }
  }

  async clear(): Promise<void> {
    this.entries.clear();
  }
}

// ===================== پیاده‌سازی فایل (JSONL) =====================

/**
 * ذخیره‌سازی فایل — JSONL الحاقی (یک رکورد در هر خط).
 *  - بارگذاری تنبل: نخستین خواندن فایل موجود را یک بار می‌خواند؛
 *    خط‌های خراب بی‌صدا نادیده گرفته می‌شوند.
 *  - load: «آخرین» رکورد منطبق بر (key, version) برنده است —
 *    الحاق مکرر همان کلید = بازنویسی منطقی مقدار.
 *  - invalidate/clear: بازنویسی کل فایل.
 */
export class FileSystemFeatureStore implements FeatureStore {
  private loaded = false;
  private entries: FeatureStoreEntry[] = [];

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
        const parsed = JSON.parse(trimmed) as FeatureStoreEntry;
        if (typeof parsed?.key === "string" && typeof parsed?.version === "string") {
          this.entries.push(parsed);
        }
      } catch {
        // خط ناقص/خراب — نادیده گرفته می‌شود (صلبیت بارگذاری — الگوی P4-02)
      }
    }
  }

  private persistAll(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(
      this.filePath,
      this.entries.map((e) => JSON.stringify(e)).join("\n") + (this.entries.length ? "\n" : ""),
      "utf8",
    );
  }

  async save(key: string, features: unknown, version: string): Promise<void> {
    this.ensureLoaded();
    this.entries.push({ key, version, features, savedAt: new Date().toISOString() });
    mkdirSync(dirname(this.filePath), { recursive: true });
    appendFileSync(this.filePath, JSON.stringify(this.entries[this.entries.length - 1]) + "\n", "utf8");
  }

  async load<T>(key: string, version: string): Promise<T | null> {
    this.ensureLoaded();
    // آخرین منطبق — پیمایش از انتها
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i]!;
      if (e.key === key && e.version === version) {
        return structuredClone(e.features) as T;
      }
    }
    return null;
  }

  async invalidate(pattern: string): Promise<void> {
    this.ensureLoaded();
    this.entries = this.entries.filter((e) => !e.key.includes(pattern));
    this.persistAll();
  }

  async clear(): Promise<void> {
    this.loaded = true;
    this.entries = [];
    if (existsSync(this.filePath)) rmSync(this.filePath);
  }
}
