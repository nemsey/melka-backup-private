# قرارداد پیش‌بینی (PREDICTION-CONTRACT) — PHASE 6

**نسخه:** 1.0 · **مکمل:** `docs/PHASE-6-DESIGN.md`
**قاعده بالاتر:** قرارداد v1 (`src/core/intelligence/engines/prediction.ts` و `engines/feature.ts`) دست‌نخورده؛ همه ساختارهای این سند **افزودنی** هستند.

---

## ۱. FeatureSetهای دامنه‌ای (خروجی builderها)

### ۱-۱. PropertyFeatureSet — `feature/builders/property-features.ts`

| فیلد | نوع | semantics |
|---|---|---|
| areaId / areaName | string | شناسه و نام منطقه |
| districtId? | string | محله (اختیاری) |
| price | number | قیمت کل (تومان) |
| pricePerMeter | number | قیمت هر متر |
| areaMedianPricePerMeter | number | میانه منطقه — از MarketFeatureSet |
| underpriceRatio | number | **(median − pricePerMeter) / median** — مثبت = ارزان‌تر از میانه؛ میانگین صفر ⇔ ۰ (گارد تقسیم) |
| propertyType / tradeType | string | apartment, villa, … / buy, sell, rent |
| meterage / rooms / floor / age | number | مشخصات فیزیکی |
| hasElevator / hasParking | boolean | امکانات |
| photoCount | number | تعداد عکس آگهی |
| hasVideo | boolean | ویدیو دارد |
| descriptionLength | number | طول متن آگهی (نویسه) — از ورودی محاسبه می‌شود |
| descriptionKeywordScore | number | امتیاز BM25 توضیح (از textSignals؛ پیش‌فرض ۰) |
| publisherType | 'personal' \| 'agency' \| 'unknown' | نوع آگهی‌دهنده |
| publishedHoursAgo | number | ساعت‌شمار انتشار — **از ورودی** (ساعت‌دار بودن حذف از builder) |
| priceChangeCount | number | تعداد تغییر قیمت |
| previousPriceDelta | number | دلتای علامت‌دار آخرین تغییر (منفی = کاهش) |

ورودی: `PropertyInput` — همان فیلدهای خام + `id: string` + `description?: string` (برای طول) — **بدون Prisma**.

### ۱-۲. CustomerFeatureSet — `feature/builders/customer-features.ts`

`recencyDays`, `frequencyCount`, `monetaryValue` (RFM) · `responseRate`, `seriousnessScore`, `budgetCompatibility`, `activityScore` (۰..۱) · `previousInquiries`, `previousVisits`, `previousTransactions` · `preferredAreas: string[]`, `preferredPropertyTypes: string[]`, `preferredTradeType`. ورودی `CustomerInput` = همین + `id`. نقش builder: clamp نمره‌ها به [0,1]، کپی آرایه‌ها (دفاعی)، گارد اعداد نامنفی.

### ۱-۳. ExpertFeatureSet — `feature/builders/expert-features.ts`

`personnelCode` · `activeDaysLast30`, `interactionsLast30` · `responseRate`, `conversionRate`, `cooperationScore` · `currentLoad`, `capacityScore` · `networkSize`, `networkQuality`. ورودی `ExpertInput` = همین + `id`.

### ۱-۴. MarketFeatureSet — `feature/builders/market-features.ts`

`areaId`, `snapshotDate` (Date) · `medianPricePerMeter`, `averagePricePerMeter`, `sampleSize`, `confidence` · `priceTrend7d`, `priceTrend30d`, `volumeTrend7d` (کسری؛ 0.03 = +۳٪) · `volatility`, `supplyDemandRatio` (فعال/تقاضا؛ ۱=متعادل؛ <۱ بازار فروشنده).

ورودی `MarketSampleInput`: `{areaId, snapshotDate, samples: {pricePerMeter}[], priceTrend7d?, priceTrend30d?, volumeTrend7d?, volatility?, supplyDemandRatio?}`. builder میانه/میانگین/اندازه را از samples محاسبه می‌کند (نمونه صفر ⇔ هر دو ۰ + confidence ۰)؛ روند غایب ⇔ ۰. `confidence = clamp01(sampleSize/50) × (روندهای ۳گانه حاضر؟ ۱ : ۰٫۷)`.

**قاعده مشترک builderها:** خالص (صفر DB/fetch/React/clock) · ورودی یکسان ⇔ خروجی یکسان · اعداد ۰..۱ با `clamp01` گارد می‌شوند.

## ۲. PredictionRecord — ساختار استاندارد (افزودنی؛ نام متمایز از v1 طبق بند ۳-۱ سند طراحی)

```typescript
export interface PredictionRecord<T = unknown> {
  predictionId: string;               // UUID (crypto.randomUUID)
  predictionType: 'PROPERTY' | 'CUSTOMER' | 'EXPERT' | 'MARKET';
  probability: number;                // احتمال اصلی ۰..۱ (PROPERTY ⇔ transactionProbability)
  confidence: number;                 // ۰..۱ — اعتماد به داده پشت محاسبه
  expectedValue?: number;             // PROPERTY ⇔ expectedRevenue (تومان)
  expectedTimeWindow?: { minDays: number; maxDays: number; mostLikelyDays: number };
  drivers: PredictionDriver[];        // حداقل ۳
  risks: PredictionRisk[];
  assumptions: string[];
  modelVersion: string;               // "property-predictor-v0.1" و…
  featureVersion: string;             // "property-features-v1" و…
  contextSnapshot: {
    agentId: string;                  // "" اگر محرک مستقل بود
    tileId: string;                   // "" اگر خارج از ایجنت
    entityId: string;
    entityType: string;               // "property" | "customer" | "expert" | "market"
    capturedAt: Date;
    features: Record<string, unknown>; // snapshot کل FeatureSet ورودی
  };
  createdAt: Date;
  linkedOutcomeId?: string;           // PHASE 7 — حلقه Outcome
}

export interface PredictionDriver {
  feature: string;                    // نام ویژگی
  value: number | string;
  contribution: number;               // w·x — سهم در امتیاز نهایی
  weight: number;                     // وزن در جدول heuristic
  direction: 'positive' | 'negative' | 'neutral';
}

export interface PredictionRisk {
  type: string;                       // DATA_QUALITY | LOW_SAMPLE | SUSPICIOUS_UNDERPRICE | OVERLOADED | …
  description: string;                // فارسی
  severity: 'low' | 'medium' | 'high';
}
```

## ۳. Payloadهای تایپ‌شده

**PropertyPredictionPayload** — ۹ خروجی فایل‌یابی (دستور PHASE 0): `personalProbability`, `underpriceProbability`, `contactProbability`, `ownerVerificationProbability`, `negotiationProbability`, `crmRegistrationProbability`, `transactionProbability`, `expectedRevenue` (تومان), `expectedTimeToConversionDays` (روز).

**CustomerPredictionPayload**: `churnProbability`, `conversionProbability`.
**ExpertPredictionPayload**: `capacitySaturation`, `topRankProbability`.

**احتمال اصلی سطح رکورد (`probability`):** PROPERTY ⇔ `transactionProbability` · CUSTOMER ⇔ `conversionProbability` · EXPERT ⇔ `topRankProbability` (سنداً ثبت شد — payload کامل هر دو/همه را حمل می‌کند).

## ۴. جدول‌های مرجع heuristic (نسخه v0 — قابل تنظیم؛ کالیبره در PHASE 7)

نمادها: `clamp01(x)=min(1,max(0,x))` · همه وزن‌ها ثابت‌های exported در فایل predictor.

### ۴-۱. PropertyPredictor — `property-predictor-v0.1`

```
personalProbability = clamp01(0.55·pubBase + 0.25·clamp01(keywordScore) + 0.20·(1 − clamp01(photoCount/20)))
  pubBase: personal=1, agency=0, unknown=0.5
underpriceProbability = clamp01(0.65·clamp01(underpriceRatio·5) + 0.20·clamp01(publishedHoursAgo/720) + 0.15·(previousPriceDelta < 0 ? 1 : 0))
freshness = 1 − clamp01(publishedHoursAgo/336)
contactProbability = clamp01(0.45·personalProbability + 0.35·underpriceProbability + 0.20·freshness)
ownerVerificationProbability = clamp01(0.60·personalProbability + 0.25·clamp01(photoCount/20) + 0.15·(hasVideo?1:0))
negotiationProbability = clamp01(0.50·underpriceProbability + 0.30·(priceChangeCount>0?1:0) + 0.20·clamp01(publishedHoursAgo/720))
crmRegistrationProbability = clamp01(0.60·contactProbability + 0.25·(publisherType==='personal'?1:0.3) + 0.15·clamp01(descriptionLength/1000))
transactionProbability = clamp01(0.50·contactProbability + 0.25·clamp01(0.5 + priceTrend30d·5) + 0.25·(1 − clamp01(supplyDemandRatio/2)))
expectedRevenue = transactionProbability × price × 0.01        // کارمزد فرضی ۱٪ — در assumptions
expectedTimeToConversionDays = round(7 + 30·(1 − transactionProbability))  // پنجره: [⌈m/3⌉, 2m]
confidence = clamp01(0.4 + 0.3·(publisherType!=='unknown'?1:0) + 0.3·clamp01(market.sampleSize/50))
```

drivers اصلی (≥۳ همیشه): `publisherType`, `descriptionKeywordScore`, `photoCount`, `underpriceRatio`, `publishedHoursAgo`, `previousPriceDelta`, `priceTrend30d`, `supplyDemandRatio`.

### ۴-۲. CustomerPredictor — `customer-predictor-v0.1`

```
churnProbability = clamp01(0.50·clamp01(recencyDays/60) + 0.30·(1 − clamp01(responseRate)) + 0.20·(1 − clamp01(activityScore)))
conversionProbability = clamp01(0.40·clamp01(seriousnessScore) + 0.35·clamp01(budgetCompatibility) + 0.25·clamp01(previousVisits/5))
confidence = clamp01(0.4 + 0.3·clamp01(frequencyCount/10) + 0.3·(previousTransactions>0?1:0.3))
```

انحراف صادقانه: فرمول دستور `matchCount` می‌خواهد؛ این فیلد در CustomerFeatureSet نیست — `previousVisits` به‌عنوان proxy فعالیت واقعی جایگزین و سنداً ثبت شد (افزودن فیلد جدید به FeatureSetِ مصوب دستور ممنوع بود).

### ۴-۳. ExpertPredictor — `expert-predictor-v0.1`

```
loadRatio = clamp01(currentLoad/20)                            // ۲۰ پرونده فعال = اشباع مرجع
capacitySaturation = clamp01(0.70·loadRatio + 0.30·(1 − clamp01(capacityScore)))
activityProxy = clamp01(activeDaysLast30/30)                   // انحراف صادقانه — بند پایین
topRankProbability = clamp01(0.40·clamp01(conversionRate) + 0.30·clamp01(networkQuality) + 0.30·activityProxy)
confidence = clamp01(0.4 + 0.3·clamp01(interactionsLast30/100) + 0.3·clamp01(networkSize/20))
```

انحراف صادقانه دوم: فرمول دستور `activityScore` می‌خواهد؛ این فیلد در ExpertFeatureSetِ مصوب نیست — `clamp01(activeDaysLast30/30)` (نرخ روزهای فعال) به‌عنوان proxy شفاف جایگزین و سنداً ثبت شد.

### ۴-۴. risks قاعده‌محور (نمونه‌ها)

PROPERTY: `publisherType=unknown` → DATA_QUALITY/medium · `market.sampleSize<10` → LOW_SAMPLE/high · `underpriceRatio>0.3` → SUSPICIOUS_UNDERPRICE/high (احتمال خطای داده) · `photoCount=0` → THIN_LISTING/low.
CUSTOMER: `recencyDays>30` → INACTIVITY/medium · `previousTransactions=0` → NO_HISTORY/low.
EXPERT: `capacitySaturation>0.8` → OVERLOADED/high · `networkSize<3` → SMALL_NETWORK/low.

**assumptions همیشه حاضر:** «heuristic v0 — نه مدل آموخته‌شده؛ کالیبره با Outcome در PHASE 7» + فرض‌های خاص (کارمزد ۱٪، مرجع اشباع ۲۰ پرونده، روند بازار معتبر).

## ۵. امضاهای موتورها (افزودنی روی بدنه پیاده‌کننده قرارداد v1)

```typescript
// FeatureEngineImpl — implements FeatureEngine (v1: compute)
extractPropertyFeatures(property: PropertyInput, market: MarketFeatureSet, textSignals?: { keywordScore: number }): Promise<PropertyFeatureSet>
extractCustomerFeatures(customer: CustomerInput): Promise<CustomerFeatureSet>
extractExpertFeatures(expert: ExpertInput): Promise<ExpertFeatureSet>
extractMarketFeatures(areaId: string, snapshot: MarketSampleInput): Promise<MarketFeatureSet>

// PredictionEngineImpl — implements PredictionEngine (v1: predict)
predictProperty(property: PropertyFeatureSet, market: MarketFeatureSet, options?: PredictOptions): Promise<PredictionRecord<PropertyPredictionPayload>>
predictCustomer(customer: CustomerFeatureSet, options?: PredictOptions): Promise<PredictionRecord<CustomerPredictionPayload>>
predictExpert(expert: ExpertFeatureSet, options?: PredictOptions): Promise<PredictionRecord<ExpertPredictionPayload>>

// PredictOptions — الگوی asOf فاز ۴
{ now?: Date; agentId?: string; tileId?: string; entityId?: string }
```

نسخه‌ها: `property-features-v1`, `customer-features-v1`, `expert-features-v1`, `market-features-v1` · `property-predictor-v0.1`, `customer-predictor-v0.1`, `expert-predictor-v0.1`.

## ۶. PredictionRepository (P6-05)

```typescript
export interface PredictionRepository {
  save(prediction: PredictionRecord): Promise<void>;
  findById(predictionId: string): Promise<PredictionRecord | null>;
  findByEntity(entityId: string, entityType: string): Promise<PredictionRecord[]>;
  findByModel(modelVersion: string, limit?: number): Promise<PredictionRecord[]>;
  findPendingOutcome(olderThan: Date, limit?: number): Promise<PredictionRecord[]>;  // createdAt < olderThan && !linkedOutcomeId
  linkOutcome(predictionId: string, outcomeId: string): Promise<void>;
}
```

InMemoryPredictionRepository (تست) · FileSystemPredictionRepository (JSONL؛ ذخیره الحاقی، linkOutcome با بازنویسی، بارگذاری تنبل). صفر Migration.

## ۷. پل v1 و قانون H

پل `compute`/`predict` شکل v1 را عیناً برمی‌گرداند (بند ۳-۱۰ سند طراحی) — پرندار به drivers/risks؛ سنداً ثبت: مصرف‌کننده‌ای در PHASE 6 ندارد. **هیچ ادعای دقت پیش‌بینی تا PHASE 7 مجاز نیست** — این ساختارها «baseline قابل ارزیابی» هستند؛ کیفیت تنها با Outcome واقعی و Brier/Calibration در PHASE 7 سنجیده می‌شود.
