# سند طراحی PHASE 6 — موتورهای ویژگی و پیش‌بینی (Feature + Prediction Engine)

**نسخه:** 1.0 · **اصل حاکم:** Preserve → Refactor → Harden → Upgrade Intelligence
**شعار فاز:** «حافظه ساخته شد، جستجو یاد گرفت. الان سیستم یاد می‌گیرد پیش‌بینی کند.»

---

## ۱. هدف و دامنه

تبدیل قراردادهای Feature و Prediction از «interface خالص» به «بدنه واقعی» با شش قابلیت کلیدی:

1. **FeatureSet Builders چهارگانه** — Property / Customer / Expert / Market: توابع خالص تبدیل موجودیت به ویژگی
2. **FeatureEngine بدنه‌دار** — قرارداد v1 (`compute`) + چهار متد افزودنی استخراج دامنه‌ای + FeatureStore (کش)
3. **PredictionRecord استاندارد** — ساختار ۱۲+۱ فیلدی قابل‌ارزیابی برای PHASE 7 (با snapshot و drivers و risks)
4. **سه Predictor heuristic شفاف** — Property (۹ خروجی فایل‌یابی) / Customer / Expert
5. **PredictionRepository** — دو پیاده‌سازی (in-memory + JSONL فایلی) آماده برای حلقه Outcome در PHASE 7
6. **متد افزودنی چهارم روی ایجنت** — `predict` protected با duck-typing؛ صفر مصرف اجباری

خارج از دامنه (ممنوع مطلق): Feature قابل‌مشاهده · Migration Schema · تغییر قرارداد v1 · مصرف اجباری در ایجنت‌ها · حذف BaseLearningAgent · ادعای دقت پیش‌بینی پیش از PHASE 7 (قانون H).

## ۲. معماری و جریان وابستگی

```
feature/builders/property-features.ts   ─┐ توابع خالص (صفر import ارزشی)
feature/builders/customer-features.ts   ─┤ PropertyInput → PropertyFeatureSet
feature/builders/expert-features.ts     ─┤ CustomerInput → CustomerFeatureSet
feature/builders/market-features.ts     ─┘ ExpertInput / MarketSampleInput → ...
↓ (نوع‌محور)
feature/feature-engine.ts   ← FeatureEngineImpl: قرارداد v1 (compute) + ۴ متد افزودنی
feature/feature-store.ts    ← FeatureStore: InMemory + FileSystem (کش نسخه‌دار)
↓
prediction/prediction-record.ts  ← PredictionRecord + Driver + Risk + سه Payload
prediction/predictors/property-predictor.ts  ← ۹ احتمال فایل‌یابی (heuristic شفاف)
prediction/predictors/customer-predictor.ts  ← churn / conversion
prediction/predictors/expert-predictor.ts    ← capacitySaturation / topRank
↓
prediction/prediction-engine.ts ← PredictionEngineImpl: قرارداد v1 (predict) + ۳ متد افزودنی
prediction/prediction-repository.ts ← InMemory + FileSystem(JSONL) + linkedOutcomeId
↓
engine-deps.ts (فیلد اختیاری جدید: predictionRepository — افزودنی)
↓
BaseIntelligentAgent.predict (P6-06 — متد افزودنی protected چهارم؛ duck-typing)
```

جهت import یک‌سویه و بی‌چرخه: `prediction → feature/builders` (فقط type) · `feature-engine → builders + store` · `engine-deps → prediction-repository (type)` · هیچ فایلی در feature از prediction import نمی‌کند. مرز ممیزی `--strict` در تمام فایل‌ها: صفر Prisma / صفر `@/lib/db` / صفر fetch / صفر React.

## ۳. تصمیم‌های طراحی (و انحرافات صادقانه از پیش‌نویس دستور)

### ۳-۱. برخوردن از تصادم نام `PredictionResult` با قرارداد v1

پیش‌نویس دستور ساختار استاندارد را `PredictionResult<T>` نام‌گذاری کرده؛ اما این نام در قرارداد v1 (`engines/prediction.ts`) معنای ثابت دارد (`{id, tileId, target, predictedValue, unit, confidence, …}`). هر دو با `export *` از `index.ts` لایه بیرون می‌آیند — هم‌نامی = ابهام کامپایل یا تغییر v1 (ممنوع). حل (همان رویه P5-01 با `RetrievedItem`):

- ساختار استاندارد جدید: **`PredictionRecord<T = unknown>`** `{predictionId, predictionType, probability, confidence, expectedValue?, expectedTimeWindow?, drivers, risks, assumptions, modelVersion, featureVersion, contextSnapshot, createdAt, linkedOutcomeId?}`
- قرارداد v1 `PredictionResult` با نام و شکل خودش **دست‌نخورده** می‌ماند؛ `PredictionEngineImpl.predict(query)` همان شکل v1 را برمی‌گرداند (پل کم‌افت با عرضه صادقانه).

### ۳-۲. تصحیح نام متد قرارداد v1: `compute` (نه `extract`)

دستور می‌نویسد «متد قرارداد v1: extract (همان امضای PHASE 3)» — اما امضای واقعی PHASE 3 برابر `compute(query: FeatureQuery): Promise<FeatureSet>` است (فایل `engines/feature.ts`). طبق قاعده بالاتر «قرارداد v1 دست‌نخورده»، بدنه پیاده‌کننده **`compute`** را پیاده می‌کند؛ نام `extract` در پیش‌نویس خطای یادآوری بود. متدهای افزودنی دامنه‌ای (`extractPropertyFeatures` و…) همان‌طور که دستور نام‌گذاری کرده با پیشوند `extract` ادامه می‌دهند.

### ۳-۳. ورودی‌های ضدفساد (Anti-Corruption Inputs) — تایپ ساده، بدون Prisma

هر builder ورودی خودش را با تایپ ساده می‌گیرد (`PropertyInput`, `CustomerInput`, `ExpertInput`, `MarketSampleInput`) — نه DTO پرایسما نه هیچ تایپ بیرونی. دیسپلین حذفی: هر چیز «ساعت‌دار» از ورودی حذف و به‌جایش مقدار از پیش‌محاسبه‌شده می‌آید (`publishedHoursAgo` به‌جای `publishedAt`) تا **خالص‌بودن ریاضی** تضمین شود (ورودی یکسان ⇔ خروجی یکسان، بدون تزریق clock). دیسپلین نقش: builder فقط «نرمال‌سازی + گارد مقادیر + مشتق صریح» است — مشتق‌سازی جعلی نمی‌سازد.

### ۳-۴. Payload تایپ‌شده روی رکورد — ۹ خروجی فایل‌یابی

`PredictionRecord<T>` generic است. برای ملک: `PropertyPredictionPayload` با ۹ فیلد طبق دستور PHASE 0 (`personalProbability`, `underpriceProbability`, `contactProbability`, `ownerVerificationProbability`, `negotiationProbability`, `crmRegistrationProbability`, `transactionProbability`, `expectedRevenue`, `expectedTimeToConversionDays`). `probability` سطح رکورد = احتمال اصلی (برای PROPERTY: `transactionProbability`). برای مشتری و کارشناس هم Payload اختصاصی. فیلد `predictionType: 'MARKET'` در union رزرو است اما **MarketPredictor در این فاز ساخته نمی‌شود** (دستور فقط سه predictor خواسته) — درخواست MARKET از متد ایجنت ⇔ null صادقانه.

### ۳-۵. حتمیت (determinism) و مهرهای زمانی

قاعده: «ورودی یکسان ⇔ خروجی یکسان». استثناهای ساختاری ناگزیر: فیلدهای زمانی که **خود قرارداد** الزام کرده (`FeatureSet.computedAt` در v1، `PredictionRecord.createdAt` / `contextSnapshot.capturedAt`):

- v1 `compute`: `computedAt` از `source.asOf` (if present) وگرنه `new Date()` — پیمانه source آزاد است و تغییر v1 لازم نیست.
- Predictors: پارامتر `options.now?: Date` (الگوی `asOf` در PHASE 4)؛ تست‌ها now ثابت می‌دهند.
- تست حتمیت: مقایسه **بدون** فیلدهای زمانی (سنداً ذکر می‌شود).

### ۳-۶. FeatureStore — کش با نسخه‌بندی و کلید استادارد

`save(key, features, version)` / `load<T>(key, version)` (null اگر نسخه ناهماهنگ) / `invalidate(pattern)` (تطبیق زیررشته‌ای صادقانه — بدون glob؛ سنداً ثبت شد) / `clear()`. دو پیاده‌سازی: InMemory (Map) و FileSystem (JSONL الحاقی، بارگذاری تنبل، بازنویسی هنگام invalidate — الگوی P4-02). بارگذاری با `structuredClone` تا فراخواننده با جهش، کش را نفسد نکند. `FeatureEngineImpl` پیش از ساخت از کش می‌خواند و پس از ساخت در آن می‌نویسد؛ کلید = `"{نوع}:{شناسه}"`، نسخه = `featureVersion` همان دامنه.

### ۳-۷. PredictionRepository — آماده PHASE 7 بدون Migration

`save / findById / findByEntity / findByModel / findPendingOutcome(olderThan, limit) / linkOutcome(predictionId, outcomeId)`. فیلد `linkedOutcomeId?: string` روی رکورد (بند ۳-۱). `findPendingOutcome` = رکوردهای `createdAt < olderThan` **و** `linkedOutcomeId` ناموجود — دقیقاً ورودی حلقه Outcome در PHASE 7. دو پیاده‌سازی: InMemory (تست) و FileSystem JSONL (production بدون Schema). `linkOutcome` در JSONL = بازنویسی فایل با رکورد اصلاح‌شده (صادق و ساده؛ حجم فعلی کوچک).

### ۳-۸. اتصال به BaseIntelligentAgent — متد افزودنی چهارم (الگوی P4-06 / P5-07)

```typescript
protected async predict<T extends PredictionRecord>(
  predictionType: 'PROPERTY' | 'CUSTOMER' | 'EXPERT' | 'MARKET',
  entityId: string,
  entityData: unknown,
): Promise<T | null>
```

- بدون `engines.prediction` یا بدون قابلیت تولیدکننده (duck-typing روی `PredictionProducer`) ⇔ `null`
- `entityData` بسته‌های قراردادی: `{property, market}` / `{customer}` / `{expert}` / `{market}` (آخری در PHASE 6 ⇔ null)
- محاسبه ⇔ ذخیره در `engines.predictionRepository` (اختیاری؛ خطای ذخیره بلعیده می‌شود) ⇔ بازگشت رکورد
- خطای محاسبه ⇔ `null` (پیش‌بینی هرگز جریان ایجنت را نمی‌شکند — الگوی بلع observe در P4-06)
- **صفر تغییر** سازنده/فیلد/امضای موجود؛ هیچ مسیر خروجی آن را صدا نمی‌زند
- `EngineDeps` فقط یک فیلد اختیاری جدید می‌گیرد: `predictionRepository?: PredictionRepository` (افزودنی؛ غیبتش = رفتار قبل)

### ۳-۹. heuristicهای شفاف — «baseline قابل ارزیابی»، نه ML

محرک هر predictor جدول وزن صریح و بازرسی‌پذیر است (ثابت‌های exported — قابل تنظیم برای PHASE 7): ترکیب خطیِ سیگنال‌های نرمال‌شده + `clamp01`. هر driver `{feature, value, contribution = w·x, weight, direction}` ثبت می‌شود ⇔ **حداقل ۳ driver در هر رکورد** (قابل توضیح). risks قاعده‌محور (نمونه کوچک بازار، آگهی‌دهنده نامشخص، زیرقیمت مشکوک، اشباع ظرفیت کارشناس…). assumptions همیشه شامل: «heuristic نسخه v0 — نه مدل آموخته‌شده؛ کالیبره در PHASE 7» (قانون H). فرمول‌های مرجع کامل در `docs/PREDICTION-CONTRACT.md`.

### ۳-۱۰. پل v1 موتور پیش‌بینی — صادق و کم‌افت

`PredictionEngineImpl.predict(query)` (شکل v1): از `query.features.vector` (v1 FeatureSet) خوانده می‌شود؛ اگر `query.target` یکی از اهداف شناخته‌شده جدول‌های heuristic باشد و کلیدهای لازم حاضر باشند، همان heuristic روی بردار اجرا و به شکل v1 (`predictedValue`, `unit: "probability"`, `rationale` فارسی، `horizonDays = query.horizonDays ?? 30`) برگردانده می‌شود؛ وگرنه نتیجه «داده ناکافی» با `confidence: 0` و rationale صادقانه. این پل **پرندار** است (شکل v1 جایی برای drivers/risks ندارد) — دقیقاً همان دلیلی که PredictionRecord استاندارد وجود دارد. سنداً ثبت: پل v1 در PHASE 6 هیچ مصرف‌کننده‌ای ندارد.

## ۴. پیکربندی اثبات P6-07 (الگوی P4-07/P5-08 — وضعیت تازه در هر پیکربندی)

| پیکربندی | سیم‌کشی | انتظار خروجی |
|---|---|---|
| A | `RequestAgent()` — بدون موتور (PHASE 3) | مرجع |
| B | بدنه‌های PHASE 4 (Context+Memory واقعی + ۱۲ خاطره) | بایت‌به‌بایت = A |
| C | B + `RetrievalEngineImpl` کامل (Hybrid+Reranker) تزریق + فراخوانی واقعی | بایت‌به‌بایت = A |
| D | C + `FeatureEngineImpl` تزریق + استخراج واقعی FeatureSet چهارگانه پیش از خروجی | بایت‌به‌بایت = A |
| E | D + `PredictionEngineImpl` + متد `predict` ایجنت: پیش‌بینی PROPERTY واقعی محاسبه + ذخیره + شاهد `findById` | بایت‌به‌بایت = A |

گاردها: ۱۷ فایل مسیر خروجی عیناً با `pre-phase6-baseline` · سیم‌کشی زنده (حداقل یک PredictionRecord واقعاً محاسبه و ذخیره و بازیابی شود) · خروجی = `learningStats + renderInsights` (stats-first).

## ۵. ممیزی دیدپذیری (اسکنر جدید P6-08)

`audit-feature-visibility.sh`: صفر import از `feature/` و `prediction/` در `src/app/**` (UI) و صفر import در `src/app/api/**` (دسترسی فقط از طریق ایجنت). اسکنر در گارد ۴-بخشی به‌عنوان بند پنجم فعال می‌شود. کاذب‌مثبت‌ها با بازبینی دستی و تنظیم اسکنر (نه حذف قانون) رفع می‌شوند.

## ۶. پوشش تست (هدف ≥۳۰؛ مجموع ≥۶۴۹)

| بلوک | تعداد | نمونه |
|---|---|---|
| Feature Builders | ۸ | هر ۴ builder با fixture · حتمیت · edge (تقسیم‌برصفر میانگین بازار · clamp) |
| FeatureEngine | ۵ | compute v1 (پل + missing) · extractPropertyFeatures · کش (بار دوم از کش) · invalidate · FileSystem |
| PredictionEngine | ۸ | ۳ predictor · drivers ≥۳ · risks · حتمیت با now ثابت |
| PredictionRepository | ۴ | save/findById · findByEntity/Model · findPendingOutcome · linkOutcome |
| اتصال ایجنت | ۳ | null بدون موتور · ذخیره با موتور · snapshot درست |
| مرز visibility | ۲ | صفر import در UI · صفر در api |

## ۷. معیار موفقیت فاز

سنجه ← هدف: بدنه‌دار شدن موتورهای چهارم و پنجم (Feature + Prediction) · ۴ builder خالص · PredictionRecord استاندارد (تمام فیلدها) · PredictionRepository دوپیاده‌سازی · ≥۳۰ تست جدید · مجموع ≥۶۴۹ · صفر fail دو-سبز · صفر تفاوت بصری · صفر تفاوت خروجی بینش (۵ پیکربندی) · صفر Migration · صفر تغییر اجباری ایجنت · اسکنر visibility فعال · GATE-G ✅

## ۸. نقشه خطر و مسیر جایگزین (تعهد عدم توقف)

| مانع | راه جایگزین |
|---|---|
| Builderها پیچیده‌تر از انتظار | تقسیم به زیر-builder خالص و تست‌پذیر |
| ناسازگاری heuristicها | جداسازی هر predictor + تست A/B روی fixture |
| حجیم‌شدن PredictionRecord (snapshot) | snapshot خلاصه (فقط features کلیدی) + ذخیره reference |
| شکست گارد ۱۷ فایل | ریشه‌یابی همان گام + بازگشت جزئی |
| دو-سبز نشدن | ریشه آلودگی مشترک (درس P2-06) |
| کاذب‌مثبت اسکنر visibility | تنظیم اسکنر + بازبینی دستی موارد مشکوک |
| تأخیر تأیید مالک (D5) | PHASE 7 در «آماده شروع» — بدون پیش‌روی |

## ۹. قانون عدم خودفریبی (بخش H دستور — تشدیدشده)

ممنوع بدون شاهد: «پیش‌بینی دقیق» (تا PHASE 7 که Outcome دارد) · «مدل یادگیری» (وقتی heuristic است — درست: «baseline قابل ارزیابی») · «هوش پیش‌بینی» (تا ارزیابی نشود) · «سیستم می‌فهمد» (فقط «سیستم محاسبه می‌کند»). مجاز: «FeatureEngine — ۴ builder خالص با ۸ تست fixture-ثابت» · «PredictionEngine — ۳ predictor heuristic با شفافیت کامل drivers و risks» · «N پیش‌بینی ذخیره شد — آماده ارزیابی در PHASE 7» · «Baseline ثبت شد — پایه سنجش دقت در PHASE 7».
