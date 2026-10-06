/**
 * بدنه موتور ویژگی (FeatureEngineImpl) — PHASE 6 / P6-03
 * ------------------------------------------------------
 * چهارمین موتور بدنه‌دار (پس از Context / Memory / Retrieval).
 *
 * قرارداد v1 (دست‌نخورده — engines/feature.ts):
 *  - compute(query: FeatureQuery): Promise<FeatureSet> — پل عمومی روی
 *    builderهای دامنه‌ای؛ dispatch بر «query.domain».
 *
 * متدهای افزودنی (قاعده طلایی فاز — افزودنی، نه تغییری):
 *  - extractPropertyFeatures / extractCustomerFeatures /
 *    extractExpertFeatures / extractMarketFeatures — با کش FeatureStore
 *    (کلید «{نوع}:{شناسه}» + نسخه featureVersion).
 *
 * مرز (قوانین اجرایی): صفر Prisma / صفر @/lib/db / صفر fetch / صفر React.
 * builderها خالص‌اند؛ این بدنه فقط هم‌نشانی و کش است.
 *
 * ⚠️ اعلام صادقانه (قانون H): در PHASE 6 هیچ مسیر خروجی ایجنت این موتور را
 * صدا نمی‌زند — مصرف با تصمیم آگاهانه از PHASE 7-8.
 */

import type { FeatureEngine, FeatureQuery, FeatureSet } from "../engines/feature";
import type { FeatureStore } from "./feature-store";
import {
  buildPropertyFeatures,
  type PropertyInput,
  type PropertyFeatureSet,
  type PropertyTextSignals,
} from "./builders/property-features";
import {
  buildMarketFeatures,
  type MarketSampleInput,
  type MarketFeatureSet,
} from "./builders/market-features";
import {
  buildCustomerFeatures,
  type CustomerInput,
  type CustomerFeatureSet,
} from "./builders/customer-features";
import {
  buildExpertFeatures,
  type ExpertInput,
  type ExpertFeatureSet,
} from "./builders/expert-features";

// ===================== نسخه‌های ویژگی =====================

export const PROPERTY_FEATURES_VERSION = "property-features-v1";
export const CUSTOMER_FEATURES_VERSION = "customer-features-v1";
export const EXPERT_FEATURES_VERSION = "expert-features-v1";
export const MARKET_FEATURES_VERSION = "market-features-v1";

// ===================== کمکی‌های flatten پل v1 =====================

/**
 * خواندن bundleهای شناخته‌شده از source آزاد قرارداد v1.
 * فقط کلیدهای قراردادی این بدنه خوانده می‌شوند — هیچ فرض دیگری روی source نیست.
 */
interface ComputeSource {
  asOf?: string;
  property?: PropertyInput;
  market?: MarketFeatureSet;
  textSignals?: PropertyTextSignals;
  customer?: CustomerInput;
  expert?: ExpertInput;
  marketSnapshot?: MarketSampleInput;
  areaId?: string;
}

/** flatten مجموعه دامنه‌ای به بردار عددی v1 — رشته/آرایه در بردار جایی ندارند */
function flattenToVector(set: Record<string, unknown>): Record<string, number> {
  const vector: Record<string, number> = {};
  for (const [key, value] of Object.entries(set)) {
    if (typeof value === "number" && !Number.isNaN(value)) vector[key] = value;
    else if (typeof value === "boolean") vector[key] = value ? 1 : 0;
    // string / array / Date — عمداً خارج از بردار (شکل v1 فقط عددی است؛ سنداً ثبت شد)
  }
  return vector;
}

// ===================== بدنه =====================

export class FeatureEngineImpl implements FeatureEngine {
  readonly contractVersion = 1 as const;

  /** کش اختیاری — نبود = همیشه ساخت تازه (حتمی) */
  constructor(private readonly store?: FeatureStore) {}

  // ---------- قرارداد v1: compute ----------

  /**
   * پل عمومی v1 — dispatch بر query.domain:
   *  - "property" ⇔ source.property + source.market (+ source.textSignals اختیاری)
   *  - "customer" ⇔ source.customer
   *  - "expert"   ⇔ source.expert
   *  - "market"   ⇔ source.marketSnapshot (+ source.areaId اختیاری برتر است)
   *  - دامنه ناشناخته یا bundle ناقص ⇔ بردار خالی + missing صادقانه
   *
   * computedAt: از source.asOf (رشته ISO — اگر فراخواننده داد) وگرنه اکنون؛
   * این تنها رشته غیرحتمی خروجی است (تست حتمیت بدون آن مقایسه می‌کند).
   */
  async compute(query: FeatureQuery): Promise<FeatureSet> {
    const source = (query.source ?? {}) as ComputeSource;
    const computedAt = typeof source.asOf === "string" ? source.asOf : new Date().toISOString();

    let vector: Record<string, number> = {};
    const missing: string[] = [];

    switch (query.domain) {
      case "property": {
        if (source.property && source.market) {
          vector = flattenToVector(
            buildPropertyFeatures(source.property, source.market, source.textSignals) as unknown as Record<string, unknown>,
          );
        } else {
          if (!source.property) missing.push("source.property");
          if (!source.market) missing.push("source.market");
        }
        break;
      }
      case "customer": {
        if (source.customer) {
          vector = flattenToVector(buildCustomerFeatures(source.customer) as unknown as Record<string, unknown>);
        } else missing.push("source.customer");
        break;
      }
      case "expert": {
        if (source.expert) {
          vector = flattenToVector(buildExpertFeatures(source.expert) as unknown as Record<string, unknown>);
        } else missing.push("source.expert");
        break;
      }
      case "market": {
        if (source.marketSnapshot) {
          vector = flattenToVector(
            buildMarketFeatures({ ...source.marketSnapshot, areaId: source.areaId ?? source.marketSnapshot.areaId }) as unknown as Record<string, unknown>,
          );
        } else missing.push("source.marketSnapshot");
        break;
      }
      default:
        missing.push(`domain:${query.domain}`);
    }

    return { tileId: query.tileId, domain: query.domain, computedAt, vector, missing };
  }

  // ---------- متدهای افزودنی دامنه‌ای (با کش) ----------

  /** استخراج ویژگی ملک — کش بر «property:{id}» + نسخه v1 */
  async extractPropertyFeatures(
    property: PropertyInput,
    market: MarketFeatureSet,
    textSignals?: PropertyTextSignals,
  ): Promise<PropertyFeatureSet> {
    const key = `property:${property.id}`;
    const cached = this.store ? await this.store.load<PropertyFeatureSet>(key, PROPERTY_FEATURES_VERSION) : null;
    if (cached) return cached;
    const built = buildPropertyFeatures(property, market, textSignals);
    if (this.store) {
      await this.store.save(key, built, PROPERTY_FEATURES_VERSION);
      // جداسازی مرجع: خروجی و کش مستقل‌اند (درس خودافشای تست — aliasing)
      return structuredClone(built);
    }
    return built;
  }

  /** استخراج ویژگی مشتری — کش بر «customer:{id}» */
  async extractCustomerFeatures(customer: CustomerInput): Promise<CustomerFeatureSet> {
    const key = `customer:${customer.id}`;
    const cached = this.store ? await this.store.load<CustomerFeatureSet>(key, CUSTOMER_FEATURES_VERSION) : null;
    if (cached) return cached;
    const built = buildCustomerFeatures(customer);
    if (this.store) {
      await this.store.save(key, built, CUSTOMER_FEATURES_VERSION);
      return structuredClone(built);
    }
    return built;
  }

  /** استخراج ویژگی کارشناس — کش بر «expert:{id}» */
  async extractExpertFeatures(expert: ExpertInput): Promise<ExpertFeatureSet> {
    const key = `expert:${expert.id}`;
    const cached = this.store ? await this.store.load<ExpertFeatureSet>(key, EXPERT_FEATURES_VERSION) : null;
    if (cached) return cached;
    const built = buildExpertFeatures(expert);
    if (this.store) {
      await this.store.save(key, built, EXPERT_FEATURES_VERSION);
      return structuredClone(built);
    }
    return built;
  }

  /** استخراج ویژگی بازار — کش بر «market:{areaId}»؛ areaId پارامتر برتر است (امضای دستور) */
  async extractMarketFeatures(areaId: string, snapshot: MarketSampleInput): Promise<MarketFeatureSet> {
    const key = `market:${areaId}`;
    const cached = this.store ? await this.store.load<MarketFeatureSet>(key, MARKET_FEATURES_VERSION) : null;
    if (cached) return cached;
    const built = buildMarketFeatures({ ...snapshot, areaId });
    if (this.store) {
      await this.store.save(key, built, MARKET_FEATURES_VERSION);
      return structuredClone(built);
    }
    return built;
  }
}
