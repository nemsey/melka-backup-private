/**
 * P6545 / گام ۳ — BLOCK 3.4: Feature Store مشترک (src/core/features/store.ts)
 * ---------------------------------------------------------------------------
 * «ویژگی‌ها یک‌بار استخراج، چندبار مصرف»:
 *   · منبع استخراج: ۱۵ ایجنت موجود src/core/agent + builderهای خالص هستهٔ هوش
 *   · کش درون‌فرایندی + انبار ماندگار JSONL (intelligence-data/features.jsonl)
 *   · تست کلیدی: یک ویژگی، دو ایجنت، نتیجهٔ یکسان (قطعیت استخراج)
 *
 * ≥ ۵۰ ویژگی در ۴ دامنه (property ~۲۰ · market ~۱۰ · customer ~۱۰ · expert ~۱۰)
 */
import { existsSync, readFileSync, appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { buildPropertyFeatures, type PropertyInput } from "@/core/intelligence/feature/builders/property-features";
import { buildMarketFeatures, type MarketSampleInput, type MarketFeatureSet } from "@/core/intelligence/feature/builders/market-features";
import { buildCustomerFeatures, type CustomerInput } from "@/core/intelligence/feature/builders/customer-features";
import { buildExpertFeatures, type ExpertInput } from "@/core/intelligence/feature/builders/expert-features";

export type FeatureDomain = "property" | "market" | "customer" | "expert";

export interface FeatureKey {
  domain: FeatureDomain;
  entityId: string;
}

interface CacheEntry {
  value: unknown;
  extractedAt: number;
}

/** نسخهٔ استخراج — با تغییر builderها باید بالا برود */
export const FEATURE_STORE_VERSION = "shared-feature-store-v1";

/** عمر کش ویژگی (میلی‌ثانیه) — ۳۰ دقیقه */
const CACHE_TTL_MS = 30 * 60 * 1000;

export interface SharedFeatureStoreOptions {
  /** مسیر انبار ماندگار — پیش‌فرض intelligence-data/features.jsonl */
  persistPath?: string;
  /** غیرفعال‌سازی کش (تست) */
  noCache?: boolean;
  /** غیرفعال‌سازی انبار (تست) */
  noPersist?: boolean;
}

export class SharedFeatureStore {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly persistPath: string | null;
  private readonly useCache: boolean;
  private readonly usePersist: boolean;
  /** شمارنده‌های شفافیت */
  readonly stats = { extracts: 0, cacheHits: 0, persisted: 0 };

  constructor(opts: SharedFeatureStoreOptions = {}) {
    this.useCache = !opts.noCache;
    this.usePersist = !opts.noPersist;
    this.persistPath = opts.persistPath ?? path.join(process.cwd(), "intelligence-data", "features.jsonl");
  }

  /* ───────────────── extraction — منبع یگانه ───────────────── */

  async propertyFeatures(entityId: string, input: PropertyInput, market: MarketFeatureSet): Promise<Record<string, unknown>> {
    return this.extract("property", entityId, () => buildPropertyFeatures(input, market) as unknown as Record<string, unknown>);
  }

  async marketFeatures(entityId: string, input: MarketSampleInput): Promise<Record<string, unknown>> {
    return this.extract("market", entityId, () => buildMarketFeatures(input) as unknown as Record<string, unknown>);
  }

  async customerFeatures(entityId: string, input: CustomerInput): Promise<Record<string, unknown>> {
    return this.extract("customer", entityId, () => buildCustomerFeatures(input) as unknown as Record<string, unknown>);
  }

  async expertFeatures(entityId: string, input: ExpertInput): Promise<Record<string, unknown>> {
    return this.extract("expert", entityId, () => buildExpertFeatures(input) as unknown as Record<string, unknown>);
  }

  /** خواندن ویژگی کش‌شده بدون استخراج مجدد (مصرف دوم ایجنت دیگر) */
  peek(domain: FeatureDomain, entityId: string): unknown {
    const key = `${domain}:${entityId}`;
    const entry = this.cache.get(key);
    if (!entry || Date.now() - entry.extractedAt > CACHE_TTL_MS) return undefined;
    this.stats.cacheHits += 1;
    return entry.value;
  }

  /** تعداد ویژگی‌های کش‌شده (برای گارد ≥ ۵۰) */
  get cachedCount(): number {
    return this.cache.size;
  }

  private async extract(domain: FeatureDomain, entityId: string, builder: () => Record<string, unknown>): Promise<Record<string, unknown>> {
    const key = `${domain}:${entityId}`;
    if (this.useCache) {
      const hit = this.cache.get(key);
      if (hit && Date.now() - hit.extractedAt <= CACHE_TTL_MS) {
        this.stats.cacheHits += 1;
        return hit.value as Record<string, unknown>;
      }
    }
    const value = builder();
    this.stats.extracts += 1;
    if (this.useCache) this.cache.set(key, { value, extractedAt: Date.now() });
    if (this.usePersist) this.persist(domain, entityId, value);
    return value;
  }

  private persist(domain: FeatureDomain, entityId: string, value: Record<string, unknown>): void {
    try {
      if (this.persistPath && !existsSync(path.dirname(this.persistPath))) {
        mkdirSync(path.dirname(this.persistPath), { recursive: true });
      }
      appendFileSync(
        this.persistPath!,
        JSON.stringify({ version: FEATURE_STORE_VERSION, domain, entityId, value, at: new Date().toISOString() }) + "\n",
      );
      this.stats.persisted += 1;
    } catch {
      // انبار ماندگار هرگز استخراج را نمی‌شکند
    }
  }

  /** خواندن انبار ماندگار — برای شاهد و تست */
  static readPersisted(persistPath = path.join(process.cwd(), "intelligence-data", "features.jsonl")): Array<{ domain: string; entityId: string; value: Record<string, unknown>; at: string }> {
    if (!existsSync(persistPath)) return [];
    return readFileSync(persistPath, "utf8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l));
  }
}
