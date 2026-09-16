# سند طراحی PHASE 3 — معماری BaseIntelligentAgent با ۱۱ موتور

**پروژه:** ملک تبریز — داشبورد هوشمند چندعامله CRM
**مرجع دستور:** سند شماره ۴ شورای راهبری (PHASE 3 — ساخت «شکل» مغز، بدون «بدنه»)
**وضعیت سند:** نسخه ۱٫۰ — پیش از پیاده‌سازی (GATE-D بخش ۱)
**قانون طلایی این فاز:** PHASE 3 فقط «شکل» موتورها (interface خالص) را می‌سازد؛ «بدنه» آن‌ها در PHASE 4 تا 8 پر می‌شود. **صفر پیاده‌سازی موتور، صفر Feature قابل‌مشاهده، صفر Migration اسکیما.**

---

## ۰. خلاصه اجرایی (برای مالک)

انبار داده (لایه Repository) در PHASE 2 کامل شد. حالا اسکلت «مغز» را می‌سازیم: کلاس پایه‌ای به نام `BaseIntelligentAgent` که فرزندِ همان `BaseLearningAgent` امروزی است و ۱۱ «جای موتور» (interface) برای توانایی‌های هوشمند دارد: زمینه، حافظه، بازیابی، ویژگی، پیش‌بینی، تصمیم، برنامه‌ریز اقدام، پیامد، ارزیابی، یادگیری و ایمنی.

**در این فاز هیچ‌کدام از این ۱۱ موتور کار واقعی نمی‌کنند** — فقط قراردادشان (شکل ورودی/خروجی) تعریف می‌شود و یک ایجنت (درخواست ملک) به‌عنوان نخستین نمونه به این اسکلت منتقل می‌شود با **تضمین خروجی بایت‌به‌بایت یکسان**. همه ۱۲ ایجنت دیگر مثل قبل با `BaseLearningAgent` کار می‌کنند — هیچ چیزی در ظاهر برنامه تغییر نمی‌کند.

---

## ۱. معماری و اصل سازگاری عقب‌وار

### ۱٫۱ زنجیره وراثت

```
BaseLearningAgent                    (امروز — دست‌نخورده، ۱۲ ایجنت فعال)
  └── BaseIntelligentAgent           (جدید در PHASE 3 — اسکلت، بدون منطق جدید)
        └── RequestAgent             (P3-03 — نخستین نمونه مرجع)
        └── [PHASE 4+ — ایجنت‌های بعدی]
```

- `BaseIntelligentAgent` از `BaseLearningAgent` **extend** می‌کند؛ یعنی هر متد امروز (renderInsights، submitFeedback، rollbackPolicy، learningStats و…) بدون هیچ تغییری در دسترس می‌ماند.
- سازنده `BaseIntelligentAgent` علاوه بر deps موجود، `engineDeps` اختیاری می‌گیرد (ظرف تزریق موتورها). بدون engineDeps → همه موتورها به حالت «جای‌گزین BaseLearningAgent» (fallback) برمی‌گردند.
- `BaseLearningAgent` **هرگز حذف یا تغییر نمی‌کند** (قانون حفاظت فاز).

### ۱٫۲ چیدمان فایل‌ها

```
src/core/intelligence/
  engines/
    context.ts          ← قرارداد موتور زمینه
    memory.ts           ← قرارداد موتور حافظه
    retrieval.ts        ← قرارداد موتور بازیابی
    feature.ts          ← قرارداد موتور ویژگی
    prediction.ts       ← قرارداد موتور پیش‌بینی
    decision.ts         ← قرارداد موتور تصمیم
    action-planner.ts   ← قرارداد برنامه‌ریز اقدام
    outcome.ts          ← قرارداد موتور پیامد
    evaluation.ts       ← قرارداد موتور ارزیابی
    learning.ts         ← قرارداد موتور یادگیری
    safety.ts           ← قرارداد موتور ایمنی
    index.ts            ← صادرات واحد
  base-intelligent-agent.ts  ← کلاس پایه جدید (اسکلت)
  engine-deps.ts        ← ظرف تزریق موتورها (EngineDeps + سازنده پیش‌فرض)
  index.ts              ← نقطه ورود لایه هوشمندی
```

### ۱٫۳ قواعد خلوص (اجباری و گارد‌شده)

1. **صفر Prisma** در کل `src/core/intelligence/` — نه import مستقیم، نه انتقالی (اسکریپت ممیزی `scripts/audit-intelligence-boundary.sh` با پیمایشگر بازگشتی گراف import، الگوی P1-03).
2. **صفر fetch / HTTP زنده** — موتورها فقط از طریق Repository تزریقی با داده کار می‌کنند.
3. **صفر React / JSX** — این لایه منطق سرور خالص است.
4. **صفر new بدون تزریق** در کلاس‌ها — همه وابستگی‌ها از سازنده (الگوی E.3 پروژه).
5. DTOهای موجود لایه Repository (مثل `AgentMemoryDTO`، `PolicyRecordDTO`) تنها از طریق `import type` به‌عنوان **نوع** عبور می‌کنند — نوع‌ها آلودگی runtime ندارند و در ممیزی مجازند.

---

## ۲. مشخصات ۱۱ موتور

هر موتور: **ورودی / خروجی / مسئولیت / مرز / نسخه قرارداد / فاز پیاده‌سازی**.

> ⚠️ اعلام صادقانه (قانون H): همه ۱۱ قرارداد زیر در PHASE 3 فقط «interface خالص» هستند. هیچ موتوری منطق ندارد، هیچ موتوری «آماده» نیست و هیچ ادعای «هوشمند شدن سیستم» تا PHASE 4-8 معتبر نیست.

---

### ۲٫۱ موتور زمینه — ContextEngine

| بند | مشخصات |
|---|---|
| **مسئولیت** | تجمیع همه آنچه یک تصمیم باید «بداند»: کدام کاشی، چه زمانی، چه کاربری، وضعیت داده امروز، پیکربندی فعال. تنها منبع حقیقت برای «محیط اجرای تصمیم». |
| **ورودی** | `ContextQuery { tileId: string; purpose: ContextPurpose; asOf?: Date }` که `ContextPurpose` در PHASE 3 فقط `"insight-render"` است (فازهای بعد: `"prediction"`، `"action"`، `"evaluation"`). |
| **خروجی** | `AgentContext { tileId: string; generatedAt: string; purpose: ContextPurpose }` — در PHASE 3 دقیقاً همین دو فیلد + مهر زمان؛ فازهای بعد فیلدهای غنی‌تر (نقش کاربر،Snapshot داده، پیکربندی) **افزودنی** اضافه می‌کنند. |
| **مرز** | فقط خواندن؛ هرگز DB مستقیم (در پیاده‌سازی آینده فقط از Repositoryهای تزریقی)؛ خروجی همیشه سریال‌پذیر (JSON-safe) تا در contextSnapshot بازخوردها ذخیره شود. |
| **نسخه قرارداد** | `1` (فیلدها فقط افزودنی رشد می‌کنند — قانون نسخه‌بندی ۲٫۰) |
| **فاز پیاده‌سازی** | بدنه واقعی: PHASE 4 (P4-x). در P3-03: Placeholder خنثی که فقط `{tileId, generatedAt: new Date().toISOString(), purpose}` برمی‌گرداند. |

---

### ۲٫۲ موتور حافظه — MemoryEngine

| بند | مشخصات |
|---|---|
| **مسئولیت** | لایه‌بندی حافظه (۶ لایه طبق معماری هدف ممیزی PHASE 0: عامل/اپیزودیک/معنایی/رویه‌ای/نهادی/جهانی) به‌جای جریان امروز «یک جدول همه‌کاره». خواندن/نوشتن رویدادها و بازخوردها با نسخه‌بندی. |
| **ورودی** | `MemoryQuery { tileId: string; layer?: MemoryLayer; kinds?: string[]; since?: string; take?: number }` برای خواندن؛ `MemoryAppend { tileId: string; layer: MemoryLayer; kind: string; payload: Record<string, unknown> }` برای نوشتن. `MemoryLayer = "AGENT" \| "EPISODIC" \| "SEMANTIC" \| "PROCEDURAL" \| "INSTITUTIONAL" \| "GLOBAL"`. |
| **خروجی** | `MemoryEntry[] { id: string; tileId: string; layer: MemoryLayer; kind: string; text: string; sentiment: number; createdAt: string }` — ابرنوعی که `MemorySnippet` امروزی را پوشش می‌دهد (فیلد `text` همان ترکیب امروزی است). |
| **مرز** | فقط افزودنی (append-only) — هرگز به‌روزرسانی/حذف منطق امروزی را تغییر نمی‌دهد. نگاشت به جدول `AgentMemory` موجود از طریق `AgentMemoryRepository` تزریقی؛ **بدون Migration** — لایه در PHASE 3 یک فیلد منطقی است که از `kind` امروز مشتق می‌شود (نگاشت پیش‌فرض: همه → AGENT). |
| **نسخه قرارداد** | `1` |
| **فاز پیاده‌سازی** | بدنه واقعی: PHASE 4. در P3-03: fallback کامل به رفتار `BaseLearningAgent` (همان listRecent/listFeedbacks از امروز). |

---

### ۲٫۳ موتور بازیابی — RetrievalEngine (Prototype TF/Cosine)

| بند | مشخصات |
|---|---|
| **مسئولیت** | یافتن قطعات حافظه مرتبط با یک پرسش/بینش (RAG اختصاصی کاشی). در PHASE 3 قرارداد = همان الگوریتم امروزی (TF + Cosine) به‌صورت موتور قابل‌جایگزینی؛ ارتقاء به Hybrid (واژگانی + معنایی) در فاز بعد. |
| **ورودی** | `RetrievalQuery { tileId: string; query: string; k?: number; layers?: MemoryLayer[] }` |
| **خروجی** | `RetrievalResult { snippets: MemoryEntry[]; hitCount: number; method: "TF_COSINE" \| "HYBRID" }` — `method` صادقانه روش استفاده‌شده را اعلام می‌کند (در PHASE 3 همیشه `"TF_COSINE"`). |
| **مرز** | تابع‌های خالص `termVector` و `cosineSimilarity` از `base-agent.ts` **انتقال نمی‌یابند** — موتور آن‌ها را از محل موجود import می‌کند (یک منبع واحد)؛ صفر I/O مستقیم — خواندن حافظه فقط از MemoryEngine. |
| **نسخه قرارداد** | `1` |
| **فاز پیاده‌سازی** | بدنه واقعی: PHASE 5 (Hybrid قرارداد-اول). در P3-03: fallback کامل به `retrieveRelevant` امروزی. |

---

### ۲٫۴ موتور ویژگی — FeatureEngine

| بند | مشخصات |
|---|---|
| **مسئولیت** | تبدیل «داده خام» به «ویژگی عددی/ترتیبی استاندارد» برای پیش‌بینی: نرمال‌سازی، پنجره‌زمانی، مشتق‌گیری روند. تنها نقطه‌ای که از DTOهای Repository به بردار ویژگی می‌رسیم. |
| **ورودی** | `FeatureQuery { tileId: string; domain: string; windowDays?: number; source?: Record<string, unknown> }` — `source` در PHASE 3 مجهول می‌ماند چون مصرف‌کننده‌ای ندارد. |
| **خروجی** | `FeatureSet { tileId: string; domain: string; computedAt: string; vector: Record<string, number>; missing: string[] }` — `vector` نام‌دار و بازتولیدپذیر (بدون شبه‌تصادفی)، `missing` فهرست صادقانه ویژگی‌های در دسترس‌نیافته. |
| **مرز** | تابع خالص — ورودی یکسان همیشه خروجی یکسان (بدون زمان در محاسبه). صفر نوشتن. |
| **نسخه قرارداد** | `1` |
| **فاز پیاده‌سازی** | بدنه واقعی: PHASE 5. در PHASE 3 فقط قرارداد؛ هیچ مصرف‌کننده‌ای ندارد. |

---

### ۲٫۵ موتور پیش‌بینی — PredictionEngine

| بند | مشخصات |
|---|---|
| **مسئولیت** | تولید پیش‌بینی احتمالاتی استاندارد `PredictionResult` به‌جای heuristicهای هاردکد امروزی. هر پیش‌بینی: موضوع، مقدار نقطه‌ای، بازه اطمینان، افق، نسخه مدل، توضیح. |
| **ورودی** | `PredictionQuery { tileId: string; target: string; features: FeatureSet; horizonDays?: number }` |
| **خروجی** | `PredictionResult { id: string; tileId: string; target: string; predictedValue: number; unit: string; confidence: number; lowerBound?: number; upperBound?: number; horizonDays: number; modelVersion: string; rationale: string; computedAt: string }` — ساختار استاندارد یکسان برای همه ایجنت‌ها (طبق دستور). |
| **مرز** | احتمالات همیشه در بازه [0,1] یا مقیاس اعلام‌شده؛ rationale فارسی و قابل‌نمایش؛ ذخیرهسازی از طریق `PredictionRepository` تزریقی (فقط در فاز پیاده‌سازی). |
| **نسخه قرارداد** | `1` |
| **فاز پیاده‌سازی** | بدنه واقعی: PHASE 6. در PHASE 3 فقط قرارداد. |

---

### ۲٫۶ موتور تصمیم — DecisionEngine

| بند | مشخصات |
|---|---|
| **مسئولیت** | ترکیب سه منبع: پیش‌بینی (PredictionResult) + قواعد (سیاست فعال و آستانه‌ها) + ایمنی (SafetyEngine) → یک تصمیم قابل‌توضیح با اولویت و سطح اطمینان. جانشین معماری‌پذیرِ «وزن‌دهی بینش» امروزی. |
| **ورودی** | `DecisionQuery { context: AgentContext; candidates: DecisionCandidate[]; policy: AgentPolicyContent }` که `DecisionCandidate { key: string; domain: string; severity: InsightSeverity; prediction?: PredictionResult; metadata?: Record<string, unknown> }`. |
| **خروجی** | `DecisionResult { ranked: RankedDecision[]; topKey: string; appliedRuleIds: string[] }` که `RankedDecision { key: string; score: number; rationale: string; requiresApproval: boolean }`. |
| **مرز** | بدون عارضه جانبی — خالص و بازتولیدپذیر؛ هرگز خودش اقدام اجرا نمی‌کند (کار ActionPlanner)؛ قبل از خروجی نهایی، SafetyEngine را برای برچسب requiredApproval مشورت می‌دهد. |
| **نسخه قرارداد** | `1` |
| **فاز پیاده‌سازی** | بدنه واقعی: PHASE 6. در P3-03: fallback کامل به مرتب‌سازی وزن سیاست امروزی. |

---

### ۲٫۷ برنامه‌ریز اقدام — ActionPlannerEngine

| بند | مشخصات |
|---|---|
| **مسئولیت** | تبدیل تصمیم به برنامه اقدام مشتری‌محور: گام‌های مرتب با ابزار UI مربوطه + **فیلد `requiredApproval`** (دروازه انسانی — هر اقدام پرخطر/پرهزینه/برون‌سازمانی پیش از اجرا تأیید صریح می‌خواهد). |
| **ورودی** | `ActionPlanQuery { context: AgentContext; decision: DecisionResult }` |
| **خروجی** | `ActionPlan { steps: ActionStep[]; createdAt: string }` که `ActionStep { id: string; title: string; rationale: string; uiAction?: string; requiredApproval: boolean; riskLevel: "LOW" \| "MEDIUM" \| "HIGH" }`. |
| **مرز** | فقط برنامه می‌سازد — هرگز اجرا نمی‌کند؛ `uiAction` فقط شناسه کلید/مؤلفه UI موجود است (بدون تغییر UI در این فاز). |
| **نسخه قرارداد** | `1` |
| **فاز پیاده‌سازی** | بدنه واقعی: PHASE 7. در PHASE 3 فقط قرارداد. |

---

### ۲٫۸ موتور پیامد — OutcomeEngine

| بند | مشخصات |
|---|---|
| **مسئولیت** | ثبت و نگاشت «آنچه واقعاً شد» به پیش‌بینی/توصیعی که داده شد (حلقه بسته). اتصال `OutcomeRecord ↔ PredictionResult` — پایه یادگیری واقعی به‌جای تعدیل وزن بازخوردی صرف. |
| **ورودی** | ثبت: `OutcomeRecord { tileId: string; predictionId?: string; decisionKey?: string; outcome: string; occurredAt: string; evidence?: Record<string, unknown> }` — خواندن: `OutcomeQuery { tileId: string; since?: string; predictionId?: string }`. |
| **خروجی** | خواندن: `OutcomeRecord[]` + `OutcomeLinkage { matched: number; unmatched: number }` (پیش‌بینی‌هایی که پیامدی نداشتند = unmatched — سیگنال کیفیت). |
| **مرز** | فقط افزودنی؛ منبع داده امروز (`LookupLog`/`DivarRejectLog`/`CommissionCalcLog` از `OutcomeRepository` موجود) در فاز پیاده‌سازی به این قرارداد نگاشت می‌شود؛ **بدون Migration جدید**. |
| **نسخه قرارداد** | `1` |
| **فاز پیاده‌سازی** | بدنه واقعی: PHASE 7. در PHASE 3 فقط قرارداد. |

---

### ۲٫۹ موتور ارزیابی — EvaluationEngine

| بند | مشخصات |
|---|---|
| **مسئولیت** | سنجش کیفیت پیش‌بینی‌ها با معیارهای استاندارد: **Brier Score** (دقت احتمالاتی)، **Calibration** (توافق احتمال با واقعیت)، **Lift** (ارزش نسبت به تصادفی). پایان «پیش‌بینی بدون داوری» (یافته F3 ممیزی). |
| **ورودی** | `EvaluationQuery { tileId: string; windowDays?: number; target?: string }` |
| **خروجی** | `EvaluationReport { tileId: string; windowDays: number; sampleSize: number; brierScore?: number; calibration?: { bucket: string; predicted: number; observed: number }[]; lift?: number; verdict: "INSUFFICIENT_DATA" \| "BELOW_BASELINE" \| "AT_BASELINE" \| "ABOVE_BASELINE"; computedAt: string }` — `verdict` همیشه صادقانه؛ نمونه < حداقل → INSUFFICIENT_DATA. |
| **مرز** | فقط خواندن + محاسبه خالص؛ ورودی از OutcomeEngine (جفت‌های پیش‌بینی↔پیامد). |
| **نسخه قرارداد** | `1` |
| **فاز پیاده‌سازی** | بدنه واقعی: PHASE 8. در PHASE 3 فقط قرارداد. |

---

### ۲٫۱۰ موتور یادگیری — LearningEngine

| بند | مشخصات |
|---|---|
| **مسئولیت** | به‌روزرسانی سیاست **بر اساس Outcome** (نه فقط بازخورد صریح کاربر): ترکیب سیگنال بازخورد + نتیجه واقعی اقدامات → نسخه جدید سیاست با rationale. ارتقاء «سیاست نسخه‌بندی‌شده» امروزی به یادگیری حلقه‌بسته. |
| **ورودی** | `LearningQuery { tileId: string; trigger: "FEEDBACK_THRESHOLD" \| "OUTCOME_BATCH" \| "MANUAL" \| "SCHEDULED" }` |
| **خروجی** | `LearningResult { updated: boolean; newVersion: number | null; rationale: string; signalBreakdown: { feedbackSignals: number; outcomeSignals: number } }` — شفافیت منبع سیگنال. |
| **مرز** | تنها نویسنده سیاست در معماری هدف؛ در PHASE 3 مسیر `reviewPolicyIfNeeded` امروزی دست‌نخورده می‌ماند (fallback)؛ نوشتن فقط از `PolicyRepository` تزریقی؛ هر به‌روزرسانی = نسخه جدید (بدون بازنویسی). |
| **نسخه قرارداد** | `1` |
| **فاز پیاده‌سازی** | بدنه واقعی: PHASE 8. در P3-03: fallback کامل به `reviewPolicyIfNeeded` امروزی. |

---

### ۲٫۱۱ موتور ایمنی — SafetyEngine

| بند | مشخصات |
|---|---|
| **مسئولیت** | دروازه تأیید انسانی: طبقه‌بندی ریسک هر تصمیم/اقدام پیش از اجرا (LOW/MEDIUM/HIGH) و تعیین `requiredApproval`. هیچ اقدام HIGH هرگز بدون تأیید صریح مالک اجرا نمی‌شود — قاعده سازنده. |
| **ورودی** | `SafetyQuery { context: AgentContext; proposal: { kind: "DECISION" \| "ACTION" \| "POLICY_CHANGE"; description: string; affectsExternalSystem: boolean; isDestructive: boolean; estimatedCost?: number } }` |
| **خروجی** | `SafetyVerdict { riskLevel: "LOW" \| "MEDIUM" \| "HIGH"; requiredApproval: boolean; reason: string; ruleIds: string[] }` — قاعده سخت: `affectsExternalSystem ∨ isDestructive` → همیشه `requiredApproval = true`. |
| **مرز** | قواعد در PHASE 3 به‌صورت ثابت‌های قراردادی اعلام می‌شوند (فهرست بالا)؛ بدنه قاعده‌محرک واقعی + AuditLog در PHASE 4-7. صفر اجرای اقدام. |
| **نسخه قرارداد** | `1` |
| **فاز پیاده‌سازی** | بدنه واقعی: PHASE 7 (همزمان ActionPlanner). در PHASE 3 فقط قرارداد. |

---

## ۳. ظرف تزریق — EngineDeps

```typescript
// فقط شکل قراردادی — پیاده‌سازی در P3-02
interface EngineDeps {
  context?: ContextEngine;
  memory?: MemoryEngine;
  retrieval?: RetrievalEngine;
  feature?: FeatureEngine;
  prediction?: PredictionEngine;
  decision?: DecisionEngine;
  actionPlanner?: ActionPlannerEngine;
  outcome?: OutcomeEngine;
  evaluation?: EvaluationEngine;
  learning?: LearningEngine;
  safety?: SafetyEngine;
}
```

- همه فیلدها **اختیاری** — نبودِ هر موتور = fallback به رفتار `BaseLearningAgent` (تضمین سازگاری عقب‌وار کامل).
- سازنده پیش‌فرض (کارخانه) در `engine-deps.ts` در PHASE 3 فقط Placeholderهای خنثی می‌سازد؛ فازهای بعد، پیاده‌سازی‌های واقعی را جایگزین می‌کنند بدون تغییر امضا.
- تست‌ها می‌توانند هر زیرمجموعه‌ای از موتورها را stub کنند (پذیرش P3-05: «۱۱ interface قابل mock»).

## ۴. استراتژی Placeholder در P3-03 (نمونه مرجع: RequestAgent)

قانون: **خروجی بایت‌به‌بایت یکسان با امروز.**

1. `RequestAgent extends BaseIntelligentAgent` (به‌جای BaseLearningAgent) — `computeRawInsights()` **متن‌به‌ متن بدون تغییر** منتقل می‌شود.
2. موتورها با Placeholder خنثی تزریق می‌شوند:
   - ContextEngine → فقط `{tileId, generatedAt, purpose: "insight-render"}` (بدون هیچ اثری روی خروجی).
   - Memory/Retrieval/Decision/Learning → fallback داخلی به همان متدهای `BaseLearningAgent` (هیچ مسیر جدیدی اجرا نمی‌شود).
   - Feature/Prediction/ActionPlanner/Outcome/Evaluation/Safety → در P3-03 اصلاً فراخوانی نمی‌شوند (فقط سازنده/نوع).
3. اثبات: اسکریپت مقایسه قبل/بعد الگوی P1-02 (`scripts/verify-p3-03.ts`) روی داده ۱۰۰۰-نمونه‌ای + `tests/agent.test.ts` بدون هیچ تغییری سبز + تست جدید با موتورهای stub.
4. رول‌بک: بازگردانی `extends BaseLearningAgent` (یک خط) — فایل مرجع `git show pre-phase3-baseline:src/core/agent/request-agent.ts`.

## ۵. آنچه صراحتاً خارج از محدوده PHASE 3 است

- ❌ هرگونه منطق واقعی در ۱۱ موتور (حتی یک خط محاسبه)
- ❌ هرگونه تغییر قابل‌مشاهده در UI / API / رفتار ایجنت‌ها
- ❌ هرگونه Migration اسکیما یا تغییر Prisma schema
- ❌ حذف/تغییر BaseLearningAgent یا هر متد آن
- ❌ مهاجرت ۱۱ ایجنت دیگر (فقط RequestAgent اجباری + divar اختیاری)
- ❌ ادعای «هوشمند شدن» — تا PHASE 4-8 فقط «جای هوشمندی» ساخته می‌شود

## ۶. معیارهای پذیرش فاز (یادآوری دستور)

| معیار | هدف |
|---|---|
| interface موتور | ۱۱ فایل خالص، صفر Prisma/fetch/React |
| آلودگی Prisma لایه هوشمندی | ۰ (ممیزی بازگشتی گراف import) |
| ایجنت مهاجرت‌یافته | ≥۱ (RequestAgent) — هدف ۲ (+divar اختیاری) |
| خروجی RequestAgent | بایت‌به‌بایت یکسان (اسکریپت اثبات) |
| تست جدید | ≥۲۰ · مجموع ≥۵۴۵ · صفر fail |
| رگرسیون عددی ۱۰۰۰-نمونه | صفر تفاوت |
| رگرسیون بصری ۳ صفحه | چهارلایه — صفر تفاوت |
| BaseLearningAgent | زنده و بدون تغییر قرارداد |
| گیت تحویل P3-D | D0 تا D5 کامل |

## ۷. ریسک‌ها و مسیرهای جایگزین (پیش‌تعریف)

| مانع | مسیر جایگزین | تصمیم |
|---|---|---|
| تعارض interface با ساختار موجود | طراحی کش‌سان (فیلدهای اختیاری + fallback) | ادامه بدون توقف |
| تغییر خروجی RequestAgent | رول‌بک فوری + ریشه‌یابی + مهاجرت مجدد | ادامه پس از رفع |
| طولانی‌شدن مهاجرت divar (P3-04) | انتقال به PHASE 4 و بستن P3-03 به‌تنهایی | ادامه بدون توقف |
| شکست دو-سبز پیاپی تست جدید | ریشه‌یابی آلودگی جدول مشترک و رفع درجا | ادامه بدون توقف |

**شعار فاز:** «انبار ساخته شد. الان مغز اول را می‌سازیم.»
