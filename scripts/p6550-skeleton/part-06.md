
---
---

# بخش سوم — باطن

---

# فصل ۱۰ — هستهٔ هوشمندی (۱۱ موتور)

> **نقشهٔ کد:** قراردادها در `src/core/intelligence/engines/*.ts` (فاز ۳ — «قرارداد خالص، هیچ پیاده‌سازی»)؛ بدنه‌ها در `src/core/intelligence/<دامنه>/*.ts` (فازهای ۴-۸)؛ وابستگی‌های مشترک در `engine-deps.ts`؛ رجیستری مدل‌ها در `models/registry.ts`.
> **قاعدهٔ طلایی فازها:** فاز ۳ فقط `type/interface` صادر می‌کند؛ فازهای بعدی بدنه را از همان قرارداد پر می‌کنند — امضای `contractVersion: 1` در همهٔ موتورها قرارداد را نسخه‌بندی می‌کند.

## ۱۰٫۱ — موتور زمینه (Context Engine)

- **هدف:** تجمیع همهٔ آنچه یک تصمیم باید «بداند» — کدام کاشی، چه زمانی، چه کاربری، وضعیت دادهٔ امروز، پیکربندی فعال. تنها منبع حقیقت برای «محیط اجرای تصمیم».
- **قرارداد** (`engines/context.ts`):
```ts
export interface ContextEngine {
  readonly contractVersion: 1;
  buildContext(query: ContextQuery): Promise<AgentContext>;
}
```
- **پیاده‌سازی:** `src/core/intelligence/context/context-engine.ts` (۲۷۵ خط) + `index.ts`
- **وضعیت:** بدنه‌دار ✅ · **فاز ساخت:** PHASE 4 · **شاهد:** `tests/phase4-engines.test.ts`

## ۱۰٫۲ — موتور حافظه (Memory Engine)

- **هدف:** لایه‌بندی حافظهٔ شش‌لایه (عامل/اپیزودیک/معنایی/رویه‌ای/نهادی/جهانی — معماری هدف ممیزی PHASE 0) به‌جای «یک جدول همه‌کاره»؛ خواندن/نوشتن رویدادها و بازخوردها با نسخه‌بندی.
- **قرارداد** (`engines/memory.ts`):
```ts
export interface MemoryEngine {
  readonly contractVersion: 1;
  append(entry: MemoryAppend): Promise<void>;
  query(query: MemoryQuery): Promise<MemoryEntry[]>;
}
```
- **پیاده‌سازی:** `src/core/intelligence/memory/memory-engine.ts` (۲۷۱ خط) + `memory-store.ts` + `vector-index.ts` (شاخص برداری TF-IDF برای RAG)
- **وضعیت:** بدنه‌دار ✅ · **فاز:** PHASE 4 · **شاهد:** `tests/phase4-engines.test.ts`, `tests/phase5-retrieval.test.ts`

## ۱۰٫۳ — موتور بازیابی (Retrieval Engine)

- **هدف:** یافتن قطعات حافظهٔ مرتبط با یک پرسش/بینش (RAG اختصاصی کاشی)؛ ارتقاء از TF+Cosine به بازیابی هیبریدی (واژگانی + معنایی) با رتبه‌بند مجدد و ساخت استناد.
- **قرارداد** (`engines/retrieval.ts`):
```ts
export interface RetrievalEngine {
  readonly contractVersion: 1;
  retrieve(query: RetrievalQuery): Promise<RetrievalResult>;
}
```
- **پیاده‌سازی:** `src/core/intelligence/retrieval/` — `retrieval-engine.ts`, `hybrid-retriever.ts`, `keyword-search.ts`, `reranker.ts`, `citation-builder.ts` (۶۹ خط), `metadata.ts`
- **وضعیت:** بدنه‌دار ✅ (هیبرید) · **فاز:** PHASE 5 · **شاهد:** `tests/phase5-retrieval.test.ts`

## ۱۰٫۴ — موتور ویژگی (Feature Engine)

- **هدف:** تبدیل «دادهٔ خام» به «ویژگی عددی/ترتیبی استاندارد» برای پیش‌بینی: نرمال‌سازی، پنجرهٔ زمانی، مشتق‌گیری روند. تنها نقطهٔ رسیدن DTOهای Repository به بردار ویژگی.
- **قرارداد** (`engines/feature.ts`):
```ts
export interface FeatureEngine {
  readonly contractVersion: 1;
  compute(query: FeatureQuery): Promise<FeatureSet>;
}
```
- **پیاده‌سازی:** `src/core/intelligence/feature/feature-engine.ts` (۲۰۶ خط) + `feature-store.ts` + سازنده‌های چهارگانه در `builders/`: `property-features.ts`, `expert-features.ts`, `customer-features.ts`, `market-features.ts` (+ `guards.ts` گارد ورودی)
- **وضعیت:** بدنه‌دار ✅ · **فاز:** PHASE 6 · **شاهد:** `tests/phase6-features.test.ts`

## ۱۰٫۵ — موتور پیش‌بینی (Prediction Engine)

- **هدف:** تولید پیش‌بینی احتمالاتی استاندارد `PredictionResult` به‌جای heuristicهای هاردکد: موضوع، مقدار نقطه‌ای، بازهٔ اطمینان، افق، نسخهٔ مدل، توضیح.
- **قرارداد** (`engines/prediction.ts`):
```ts
export interface PredictionEngine {
  readonly contractVersion: 1;
  predict(query: PredictionQuery): Promise<PredictionResult>;
}
```
- **پیاده‌سازی:** `src/core/intelligence/prediction/prediction-engine.ts` (۲۱۲ خط) + `predictors/` (پیش‌بین‌های خانواده) + `prediction-record.ts` + `prediction-repository.ts` + `models/registry.ts` (رجیستری مدل با نسخه)
- **وضعیت:** بدنه‌دار ✅ · **فاز:** PHASE 6 · **شاهد:** `tests/phase6-prediction.test.ts`, خط پایه در `docs/PREDICTION-BASELINE.md`

## ۱۰٫۶ — موتور پیامد (Outcome Engine)

- **هدف:** ثبت و نگاشت «آنچه واقعاً شد» به پیش‌بینی/توصیعی که داده شد (بستن حلقه) — اتصال `OutcomeRecord ↔ PredictionResult`؛ پایهٔ یادگیری واقعی به‌جای تعدیل وزن بازخوردی صرف.
- **قرارداد** (`engines/outcome.ts`):
```ts
export interface OutcomeEngine {
  readonly contractVersion: 1;
  record(entry: OutcomeRecord): Promise<void>;
  query(query: OutcomeQuery): Promise<OutcomeRecord[]>;
  linkage(tileId: string): Promise<OutcomeLinkage>;
}
```
- **پیاده‌سازی:** `src/core/intelligence/outcome/outcome-engine.ts` (۹۸ خط) + `outcome-store.ts`
- **وضعیت:** بدنه‌دار ✅ · **فاز:** PHASE 7 · **شاهد:** `tests/phase7-outcome-safety-action.test.ts`

## ۱۰٫۷ — موتور ارزیابی (Evaluation Engine)

- **هدف:** سنجش کیفیت پیش‌بینی‌ها با معیارهای استاندارد: **Brier Score** (دقت احتمالاتی)، **Calibration** (توافق احتمال با واقعیت)، پوشش بازهٔ اطمینان و نرخ یادگیری.
- **قرارداد** (`engines/evaluation.ts`):
```ts
export interface EvaluationEngine {
  readonly contractVersion: 1;
  evaluate(query: EvaluationQuery): Promise<EvaluationReport>;
}
```
- **پیاده‌سازی:** `src/core/intelligence/evaluation/evaluation-engine.ts` (۲۴۰ خط) + `calibration/calibration-map.ts`
- **وضعیت:** بدنه‌دار ✅ · **فاز:** PHASE 8 · **شاهد:** `tests/phase8-evaluation-learning-decision.test.ts`, `scripts/run-outcome-loop-official.ts`

## ۱۰٫۸ — موتور یادگیری (Learning Engine)

- **هدف:** به‌روزرسانی سیاست بر اساس Outcome (نه فقط بازخورد صریح): ترکیب سیگنال بازخورد + نتیجهٔ واقعی اقدامات → نسخهٔ جدید سیاست با rationale.
- **قرارداد** (`engines/learning.ts`):
```ts
export interface LearningEngine {
  readonly contractVersion: 1;
  learn(query: LearningQuery): Promise<LearningResult>;
}
```
- **پیاده‌سازی:** `src/core/intelligence/learning/learning-engine.ts` (۲۰۴ خط)
- **وضعیت:** بدنه‌دار ✅ · **فاز:** PHASE 8 · **شاهد:** همان تست فاز ۸ + شواهد اجرای دیمن در `download/p6545/` (retrain-proof.json)

## ۱۰٫۹ — موتور تصمیم (Decision Engine)

- **هدف:** ترکیب سه منبع — پیش‌بینی (`PredictionResult`) + قواعد (سیاست فعال و آستانه‌ها) + ایمنی (`SafetyEngine`) → یک تصمیم قابل‌توضیح با اولویت و سطح اطمینان.
- **قرارداد** (`engines/decision.ts`):
```ts
export interface DecisionEngine {
  readonly contractVersion: 1;
  decide(query: DecisionQuery): Promise<DecisionResult>;
}
```
- **پیاده‌سازی:** `src/core/intelligence/decision/decision-engine.ts` (۱۴۵ خط) — چهار ناحیهٔ تصمیم + قواعد دامنه (فصل ۱۴)
- **وضعیت:** بدنه‌دار ✅ · **فاز:** PHASE 8 · **شاهد:** `tests/phase8-evaluation-learning-decision.test.ts`, `download/p6537/p8-decisions.json`

## ۱۰٫۱۰ — برنامه‌ریز اقدام (Action Planner)

- **هدف:** تبدیل تصمیم به برنامهٔ اقدام مشتری‌محور: گام‌های مرتب با ابزار UI مربوطه + فیلد `requiredApproval` (دروازهٔ انسانی — هر اقدام پرخطر/پرهزینه/برون‌سازمانی پیش از اجرا تأیید صریح می‌خواهد).
- **قرارداد** (`engines/action-planner.ts`):
```ts
export interface ActionPlannerEngine {
  readonly contractVersion: 1;
  plan(query: ActionPlanQuery): Promise<ActionPlan>;
}
```
- **پیاده‌سازی:** `src/core/intelligence/action/action-planner-engine.ts` (۱۱۰ خط) — پنج الگوی اقدام (فصل ۱۴٫۲)
- **وضعیت:** بدنه‌دار ✅ · **فاز:** PHASE 7 · **شاهد:** `tests/phase7-outcome-safety-action.test.ts`

## ۱۰٫۱۱ — موتور ایمنی (Safety Engine)

- **هدف:** دروازهٔ تأیید انسانی — طبقه‌بندی ریسک هر تصمیم/اقدام پیش از اجرا و تعیین `requiredApproval`. **هیچ اقدام HIGH هرگز بدون تأیید صریح مالک اجرا نمی‌شود (قاعدهٔ سازنده).**
- **قرارداد** (`engines/safety.ts`):
```ts
export interface SafetyEngine {
  readonly contractVersion: 1;
  assess(query: SafetyQuery): Promise<SafetyVerdict>;
}
```
- **پیاده‌سازی:** `src/core/intelligence/safety/safety-engine.ts` (۱۱۹ خط)
- **وضعیت:** بدنه‌دار ✅ · **فاز:** PHASE 7 · **شاهد:** `tests/phase7-outcome-safety-action.test.ts`

## ۱۰٫۱۲ — جدول جمع‌بندی موتورها

| # | موتور | قرارداد | بدنه | خط بدنه | فاز | تست شاهد |
|---|---|---|---|---|---|---|
| ۱ | Context | `engines/context.ts` | `context/context-engine.ts` | ۲۷۵ | P4 | phase4-engines |
| ۲ | Memory | `engines/memory.ts` | `memory/memory-engine.ts` | ۲۷۱ | P4 | phase4-engines |
| ۳ | Retrieval | `engines/retrieval.ts` | `retrieval/*` (۶ فایل) | ~۶۰۰ | P5 | phase5-retrieval |
| ۴ | Feature | `engines/feature.ts` | `feature/feature-engine.ts` | ۲۰۶ | P6 | phase6-features |
| ۵ | Prediction | `engines/prediction.ts` | `prediction/prediction-engine.ts` | ۲۱۲ | P6 | phase6-prediction |
| ۶ | Outcome | `engines/outcome.ts` | `outcome/outcome-engine.ts` | ۹۸ | P7 | phase7-outcome… |
| ۷ | Evaluation | `engines/evaluation.ts` | `evaluation/evaluation-engine.ts` | ۲۴۰ | P8 | phase8-… |
| ۸ | Learning | `engines/learning.ts` | `learning/learning-engine.ts` | ۲۰۴ | P8 | phase8-… |
| ۹ | Decision | `engines/decision.ts` | `decision/decision-engine.ts` | ۱۴۵ | P8 | phase8-… |
| ۱۰ | ActionPlanner | `engines/action-planner.ts` | `action/action-planner-engine.ts` | ۱۱۰ | P7 | phase7-… |
| ۱۱ | Safety | `engines/safety.ts` | `safety/safety-engine.ts` | ۱۱۹ | P7 | phase7-… |

**حلقهٔ سرنوشت (چطور ۱۱ موتور قفل می‌شوند):** `src/lib/intelligence/core-cycle.ts` ترتیب را می‌سازد، `outcome-loop.ts` پیامد واقعی را می‌بندد، `daemon.ts` (۲۱۲ خط) آن را در پس‌زمینهٔ سرور می‌چرخاند و `learning-adapter.ts` نتیجه را به سیاست کاشی‌ها برمی‌گرداند. جزئیات در فصل ۱۲.

---

# فصل ۱۱ — ایجنت‌های هوشمند

## ۱۱٫۱ — ایجنت پایه (BaseLearningAgent)

`src/core/agent/base-agent.ts` (۴۲۲ خط) — سه سازوکار یادگیری:

۱. **حافظهٔ Append-only:** جداول `AgentMemory` و `AgentFeedback` — هرگز Update/Delete؛ هر رخداد یک ردیف جدید (حسابرسی کامل).
۲. **RAG اختصاصی کاشی:** `termVector` + `cosineSimilarity` روی متن بازخوردها/خاطرات — بینش جدید با خاطرات مشابه مقایسه می‌شود: بازخورد مثبت مشابه = تقویت، منفی = تضعیف (در `renderInsights` اعمال).
۳. **سیاست نسخه‌بندی‌شده:** `AgentPolicyVersion` — پس از ≥۵ بازخورد و |score|≥۲ → وزن `+0.15×score` (مهار ۰٫۳–۱٫۸) و ساخت نسخهٔ جدید؛ نسخه‌های قبلی محفوظ؛ Rollback فقط OWNER.

**ایزوله‌سازی:** کلید هر عملیات حافظه `tileId` است — تست ایزوله‌سازی در `tests/agent.test.ts` اثبات می‌کند بازخورد ایجنت الف بر آمار ایجنت ب بی‌اثر است.

**قابلیت‌های اعلامی هر کاشی** (`capabilities`): `memory`, `feedback`, `policy-versions`, `rollback`.

## ۱۱٫۲ — ایجنت‌های تخصصی (۱۳)

| ایجنت | فایل | کاشی | دامنه‌ها | مدل |
|---|---|---|---|---|
| ArmListingAgent | `arm-listing-agent.ts` | M1 | VOLUME, TOP_EXPERTS, REGION, COVERAGE, FRESHNESS, VISIT_ATTENTION | BaseLearningAgent + RAG |
| ArmRequestAgent | `arm-request-agent.ts` | M2 | FUNNEL, BOTTLENECK, STALLED, SHARE, DOCUMENT, REJECT | همان |
| TransactionsContractsAgent | `transactions-contracts-agent.ts` | M3 | VOLUME, TREND, COMPOSITION, CONVERSION, DOCUMENT | همان |
| ExpertAgent | `expert-agent.ts` | M4 | COMPOSITION, ACTIVITY, GROWTH, NETWORK, RISK, VISIT_LEADERSHIP, DEAL_ACTIVITY, COVERAGE | همان |
| DivarAgent | `divar-agent.ts` | فایل‌یابی | SCAN, PERSONAL, PRICE, OTHER, LOCATION, LEARNING | همان (یادگیری از ثبت/رد آگهی) |
| ListingAgent | `listing-agent.ts` | آگهی ملکا | REGISTRY, CRM, INSTAGRAM, COMPLETENESS, SOURCE | همان |
| RequestAgent | `request-agent.ts` | درخواست ملکا | VOLUME, TREND, STATUS, LEADERSHIP, ATTENTION | همان |
| FinanceAgent | `finance-agent.ts` | مالی (قراردادها) | TARIFF, REVENUE, SETTLEMENT, BRANCH, PIPELINE | همان |
| ContractAgent | `contract-agent.ts` | اسناد | VOLUME, TREND, COMPOSITION, CONVERSION, DOCUMENT | همان |
| CustomerClubAgent | `customer-club-agent.ts` | باشگاه مشتریان (آرشیو) | COMMUNITY, REPEAT, GROWTH, LOYALTY, CATALOG, CUST_CONTACT | همان |
| TransactionAgent | `transaction-agent.ts` | legacy | VOLUME, TREND, COMPOSITION, CONVERSION, DOCUMENT | همان |
| VisitsAgent | `visits-agent.ts` | بازدیدها (آرشیو) | VISIT_* | همان |
| ایجنت‌های M5-M8 | تعریف درون `index.ts` کاشی | M5-M8 | MATCH · MARKET · COVERAGE · LEARNING+DIAGNOSIS | همان |

**تحلیل‌گرهای خالص:** `src/core/agent/analyzers.ts` (۶۷۵ خط) — توابع بدون I/O: `monthlySeries`, `growthRate`, `matchComposition`, `mostVisitedProperties`, `expertSegments`, ... ورودی DTO خالص؛ ورودی/خروجی کامل تست‌پذیر.

**ایجنت‌های دامنه‌ای هسته:** `src/core/intelligence/agents/domain-agents.ts` — ایجنت‌های سطح هسته که به‌جای کاشی، به حلقهٔ سرنوشت خدمت می‌کنند.

## ۱۱٫۳ — API ایجنت‌ها (هر کاشی)

| روت | متد | کار |
|---|---|---|
| `/api/agent/[tileId]/insight` | GET | بینش‌های وزن‌خوردهٔ فعلی |
| `/api/agent/[tileId]/feedback` | POST | ثبت مفید/نامفید (append-only) |
| `/api/agent/[tileId]/stats` | GET | آمار حافظه/بازخورد/سیاست |
| `/api/agent/[tileId]/policy` | GET/POST | فهرست نسخه‌ها / Rollback (OWNER) |

---

# فصل ۱۲ — حلقهٔ یادگیری

## ۱۲٫۱ — چرخهٔ کامل

```
        ┌──────────────────────────────────────────────────────┐
        │   دیمن مغز (src/lib/intelligence/daemon.ts)          │
        │   تیک دوره‌ای پس از هر بوت سرور (instrumentation.ts)   │
        └──────┬───────────────────────────────────────────────┘
               ▼
  ۱) ContextEngine.buildContext()  ← «الان کجاییم؟ کدام کاشی؟ چه داده‌ای تازه است؟»
               ▼
  ۲) FeatureEngine.compute()       ← DTOها → FeatureSet استاندارد (فقط ویژگی‌های تازه)
               ▼
  ۳) PredictionEngine.predict()    ← PredictionResult {موضوع، مقدار، بازهٔ اطمینان، افق، مدل، توضیح}
               ▼                                   │
  (زمان می‌گذرد؛ واقعیت رخ می‌دهد)                   │ ثبت
               ▼                                   ▼
  ۴) OutcomeEngine.record()  ←── نگاشت «آنچه واقعاً شد» به پیش‌بینی ثبت‌شده
               ▼
  ۵) EvaluationEngine.evaluate()   ← Brier + Calibration + پوشش بازه (EvaluationReport)
               ▼
  ۶) LearningEngine.learn()        ← سیاست/مدل → نسخهٔ جدید با rationale
               ▼
  ۷) بازگشت به ایجنت کاشی (learning-adapter.ts) — چرخهٔ بعدی با سیاست بهتر
```

- **اجرای واقعی و شاهد‌دار:** `scripts/run-outcome-loop-official.ts` + شواهد `download/p6545/retrain-proof.json` و `download/p6537/` (گزارش‌های p7/p8/p9/p10/p11).
- **حالت خاموشی:** `MELK_INTELLIGENCE_DAEMON=disabled` (پیش‌فرض در تست‌ها خاموش).

## ۱۲٫۲ — چارچوب ارزیابی سایه (Shadow Evaluation)

پیش از آنکه یک پیش‌بینی وزن اجرایی بگیرد، در «سایه» با دادهٔ واقعی مقایسه می‌شود (`scripts/p6545-shadow-check.ts`): مدل جدید و مدل فعلی روی همان پنجرهٔ داده ارزیابی می‌شوند؛ فقط اگر مدل جدید در Brier بهتر بود، رجیستری مدل (`models/registry.ts`) نسخهٔ فعال را جابه‌جا می‌کند. گزارش در `download/p6545/models-registry.json`.

## ۱۲٫۳ — آشکارسازی رانش (Drift Detection)

`src/core/intelligence/p10-core.ts` (فصل ۱۵) الگوریتم‌های رانش (توزیع ورودی/هدف) را در تیک‌های دوره‌ای می‌سنجد: اگر فاصلهٔ توزیع از پنجرهٔ مرجع از آستانه عبور کند → رخداد رانش + پیشنهاد بازآموزی/کالیبراسیون در صف تصمیم‌های شورا.

## ۱۲٫۴ — سیستم Tier (۵ لایه)

| Tier | نام | معنا | قفل‌ها |
|---|---|---|---|
| T0 | خام | مدل/سیاست تازه؛ فقط سایه | هیچ اقدام اجرایی |
| T1 | زیر نظر | پیشنهاد می‌دهد ولی هر مورد نیاز بازبورد انسانی دارد | requiredApproval همیشه |
| T2 | نیمه‌خودکار | اقدامات کم‌ریسک خودکار، پرریسک نیاز تأیید | SafetyEngine فعال سخت‌گیر |
| T3 | خودکار مشروط | در دامنهٔ مجاز خودکار؛ خارج دامنه نیاز تأیید | ConsultantScope + آستانه‌ها |
| T4 | خودکار کامل | فقط با مصوبهٔ صریح مالک/شورا | قفل شورا (requires_council) |

- نمایش عمومی Tier: کاشی M8 (`LearningTierPage`) + `GET /api/intelligence/status`.
- پیشرفت Tier مستقل **برای هر مدل** است (نه سراسری) — نوار پیشرفت هر مدل در M8.
- سیاست ارزیابی: **Brier کالیبرهٔ مصوب** (خط پایه در `docs/PREDICTION-BASELINE.md` + قرارداد `docs/PREDICTION-CONTRACT.md`).

---

## ۱۲٫۵ — متن کامل دیمن مغز (`daemon.ts`)

> عین `src/lib/intelligence/daemon.ts` (۲۱۲ خط) — حلقهٔ پس‌زمینهٔ حلقهٔ سرنوشت:

```ts
{{FILE:src/lib/intelligence/daemon.ts}}
```

---

# فصل ۱۳ — حاکمیت و ایمنی

## ۱۳٫۱ — ۱۵ قاعدهٔ Governance

۱. هر اقدام اجرایی `requiredApproval` دارد مگر SafetyEngine ریسک LOW تشخیص دهد.
۲. اقدامات HIGH هرگز بدون تأیید صریح مالک اجرا نمی‌شوند (قاعدهٔ سازنده).
۳. تمام رخدادهای معنادار در `AuditLog` (actor, action, target, detail, ip, userAgent).
۴. سیاست‌ها نسخه‌بندی می‌شوند؛ حذف نسخه ممنوع؛ Rollback فقط OWNER با ثبت دلیل.
۵. حافظه و بازخورد append-only.
۶. تغییر اسکیما فقط افزودنی؛ پیش از هر تغییر `VACUUM INTO` (قانون دادهٔ مقدس).
۷. آرشیو به‌جای حذف (`archivedAt` روی Session و مشابه).
۸. مرز لایه‌ای با گارد `--strict` تضمین می‌شود (فصل ۲۲).
۹. دامنهٔ دسترسی داده: `accessScope` هر نشست (OWNER/BRANCH/CONSULTANT) در همهٔ کوئری‌ها (`src/core/repositories/tenant.ts`).
۱۰. ایجنت‌ها فقط از Repository می‌خوانند — هرگز `db.*`.
۱۱. توکن‌های سامانه‌های خارجی فقط AES-256-GCM رمزنگاری‌شده (`arm-vault.ts`).
۱۲. هر تغییر کد باید تست‌ها را سبز نگه دارد (دو-سبز پیاپی).
۱۳. هیچ دمو/دادهٔ ساختگی واردProduction نمی‌شود (اتصال همیشه واقعی).
۱۴. مهر نسخهٔ زنده باید با HEAD یکی باشد تا پرونده بسته شود (قانون طلایی).
۱۵. گزارش‌ها با جدول لینک‌های زندهٔ بند «م» قانون تثبیت ۰۳۵-A تمام می‌شوند.

## ۱۳٫۲ — ۷ قاعدهٔ Safety

۱. طبقه‌بندی ریسک: LOW / MEDIUM / HIGH / CRITICAL.
۲. اقدامات برون‌سازمانی (ارسال پیامک، انتشار، تماس) همیشه ≥ MEDIUM.
۳. اقدامات پرهزینه (پاک‌سازی، بازنویسی دسته‌ای) همیشه HIGH.
۴. قفل‌های ابدی: `auto_execute=false` (پیش‌فرض) و `requires_council=true` برای طبقهٔ CRITICAL.
۵. دروازهٔ تأیید: `ActionPlan.step.requiredApproval` + UI تأیید دوعاملی.
۶. ایمنی داده: ریست اتصال فقط با بکاپ خودکار `VACUUM INTO backups/pre-reset-*` (`AGENTS.md` §۶).
۷. ایمنی اجرا: خطای یک موتور/ایجنت هرگز سرور را نمی‌اندازد (ایزوله‌سازی try/catch لایه‌ای).

## ۱۳٫۳ — قفل‌های ابدی و AuditLog

- **AuditLog** (مدل Prisma، فصل ۱۸): ثبت رخدادهای امنیتی/داده‌ای با `actorCode` — دروازهٔ یگانه `src/lib/audit.ts`.
- **ConsultantScope** (`src/lib/access/scope.ts` + `repositories/tenant.ts`): مشاور فقط دادهٔ شعبه/خودش را می‌بیند؛ مالک همه را. فیلتر در سطح Repository اعمال می‌شود (نه UI) — گارد `phase65-scope-audit.test.ts`.

## ۱۳٫۴ — رخدادهای حسابرسی نمونه

`DATA_SYNC_BACKGROUND`, `MASTER_LOGIN`, `OTP_REQUEST`, `SESSION_REVOKE`, `POLICY_ROLLBACK`, `RESET_CONNECTION`, `KEY_ROTATION`, `RECOVERY_AUTO` — همه با actor + جزئیات + زمان.

---

# فصل ۱۴ — موتور تصمیم و برنامه‌ریز اقدام

## ۱۴٫۱ — Decision Engine (چهار ناحیه + قواعد دامنه)

`src/core/intelligence/decision/decision-engine.ts` — تصمیم‌ها در **چهار ناحیهٔ دامنه** ساخته می‌شوند:

| ناحیه | پرسش محوری | ورودی‌ها |
|---|---|---|
| قیمت‌گذاری | این ملک در این منطقه چه قیمتی باید داشته باشد؟ | FeatureStore (ناحیه/نوع/متراژ) + PriceIndexHistory + MarketPriceStat |
| تطبیق | این درخواست به کدام آگهی می‌خورد؟ | FeatureSet آگهی + درخواست + وزن‌های آموخته |
| عملکرد کارشناس | این کارشناس در مسیر رشد یا ریسک است؟ | FeatureStore کارشناس + روند شخصی |
| سلامت داده | کدام ستون/منطقه نیازمند غنی‌سازی است؟ | Coverage audits + روند sync |

**قواعد دامنه:** هر ناحیه آستانه‌های خودش را از سیاست فعال می‌خواند؛ خروجی `DecisionResult` شامل priority (0-100)، confidence، rationale فارسی و ارجاع به منابع.

## ۱۴٫۲ — Action Planner (۵ الگو)

`action/action-planner-engine.ts` — هر تصمیم به یکی از **پنج الگوی اقدام** نگاشت می‌شود:

۱. **نمایش بینش** (کم‌ریسک): فقط карточه بینش در کاشی مربوط.
۲. **پیشنهاد جست‌وجو**: باز کردن فهرست با فیلتر پیشنهادی (مثلاً «نمایش آگهی‌های منطقهٔ X زیر ۱۰ میلیارد»).
۳. **پیشنهاد اقدام کاشی**: باز کردن دیالوگ آماده (مثلاً ثبت رویداد پیگیری برای درخواست راکد).
۴. **اقدام نیازمند تأیید**: same as ۳ + `requiredApproval=true` → مودال تأیید.
۵. **پیشنهاد شورا**: تصمیم CRITICAL → صف تصمیم‌های M8 (`requires_council`) با گزارش کامل.

## ۱۴٫۳ — Safety Engine در مسیر تصمیم

`decide()` پیش از بازگرداندن نتیجه، `SafetyEngine.assess()` را روی اقدام پیشنهادی صدا می‌زند؛ رأی HIGH/CRITICAL برنامهٔ اقدام را به الگوی ۴/۵ بازنویسی می‌کند — تصمیم «پیشنهاد» می‌ماند، «اجرا» نمی‌شود.

## ۱۱٫۴ — متن کامل ایجنت پایه (`base-agent.ts`)

> عین فایل `src/core/agent/base-agent.ts` (۴۲۲ خط) — قلب سازوکار حافظه/RAG/سیاست:

```ts
{{FILE:src/core/agent/base-agent.ts}}
```
