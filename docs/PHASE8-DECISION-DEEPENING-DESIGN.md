# سند طراحی فاز ۸ — تعمیق موتور تصمیم: تصمیم + برنامه‌ریز اقدام + نگهبان ایمنی

## ملکا · شماره سند: PN-019-DES8-1405 · نسخه ۱٫۰ · تاریخ: ۱۴۰۵/۰۷/۲۰

> «تصمیم بدون امنیت، فاجعه است. برنامه بدون بازگشت، قمار است.
> و تصمیمی که هرگز منقضی نشود، اسیر گذشته است.» — فلسفهٔ حاکم بر این سند

---

## فهرست

1. [خلاصهٔ اجرایی](#۱-خلاصهٔ-اجرایی)
2. [تحلیل وضع موجود](#۲-تحلیل-وضع-موجود)
3. [اهداف و غیراهداف](#۳-اهداف-و-غیراهداف)
4. [معماری کلی — سه لایهٔ تعمیق](#۴-معماری-کلی--سه-لایهٔ-تعمیق)
5. [مدل داده — چهار جدول تازه](#۵-مدل-داده--چهار-جدول-تازه)
6. [DecisionRecord پندرگانه (۱۵ فیلد)](#۶-decisionrecord-پندرگانه-۱۵-فیلد)
7. [تعمیق موتور تصمیم](#۷-تعمیق-موتور-تصمیم)
8. [Expected Impact — تحلیل اثر کمی](#۸-expected-impact--تحلیل-اثر-کمی)
9. [Alternatives Ranking — حداقل سه گزینه](#۹-alternatives-ranking--حداقل-سه-گزینه)
10. [Expiration — چرخهٔ عمر تصمیم](#۱۰-expiration--چرخهٔ-عمر-تصمیم)
11. [Action Planner تعمیق‌یافته](#۱۱-action-planner-تعمیق‌یافته)
12. [simulate() و estimateImpact()](#۱۲-simulate-و-estimateimpact)
13. [Safety — هفت قاعدهٔ سخت fail-closed](#۱۳-safety--هفت-قاعدهٔ-سخت-fail-closed)
14. [Shadow Mode — ثبت تصمیم، صفر اجرا](#۱۴-shadow-mode--ثبت-تصمیم-صفر-اجرا)
15. [لایهٔ سرویس](#۱۵-لایهٔ-سرویس)
16. [طراحی API](#۱۶-طراحی-api)
17. [یکپارچگی Worker](#۱۷-یکپارچگی-worker)
18. [قواعد Tier-aware](#۱۸-قواعد-tier-aware)
19. [ملاحظات امنیتی](#۱۹-ملاحظات-امنیتی)
20. [طرح تست (سلبی و ایجابی)](#۲۰-طرح-تست)
21. [طرح گارد](#۲۱-طرح-گارد)
22. [طرح شواهد](#۲۲-طرح-شواهد)
23. [ریسک‌ها و کاهش‌ها](#۲۳-ریسک‌ها-و-کاهش‌ها)
24. [بدیل‌های بررسی‌شده و ردشده](#۲۴-بدیل‌های-بررسی‌شده-و-ردشده)
25. [پیوست الف — ماشین حالت تصمیم](#پیوست-الف--ماشین-حالت-تصمیم)
26. [پیوست ب — پارامترها و پیش‌فرض‌ها](#پیوست-ب--پارامترها-و-پیشفرضها)

---

## ۱. خلاصهٔ اجرایی

فاز ۸ «تعمیق» است نه «تولید از صفر». سه موتور تصمیم (Decision + ActionPlanner +
Safety) از فازهای پیشین به‌صورت غنی اما **در حافظه** (in-memory) در
`src/core/intelligence/p8-core.ts` موجودند و روی دادهٔ واقعی در فاز ۵ (PN-014)
اعتبارسنجی شده بودند (۱۰ هشدار واقعی · صفر گام خودکار). آنچه فاز ۸ به آن
**نیاز ندارد** بازنویسی موتورهاست؛ آنچه به آن **نیاز دارد** چهار چیز است:

1. **پایاوری (Persistence):** تصمیم‌ها، برنامه‌ها و گزارش‌های ایمنی امروز در
   آرایه‌های درون‌حافظه زندگی می‌کنند و با ری‌استارت می‌میرند. چهار جدول تازه
   (DecisionRecord · ActionPlanRecord · SafetyCheckRecord · ShadowDecisionRun)
   آن‌ها را به خط پایای حافظهٔ مؤسسه تبدیل می‌کند.
2. **تحلیل اثر کمی (Expected Impact):** امروز «expectedOutcome» یک رشتهٔ
   توصیفی است («قیمت رقابتی‌تر می‌شود»)؛ فاز ۸ آن را به مدل کمی سه‌مؤلفه‌ای
   (lift · reach · horizon) ارتقا می‌دهد که قابل جمع، مقایسه و ممیزی است.
3. **رتبه‌بندی بدیل‌ها با حداقل سه گزینه:** امروز تابع `rankAlternatives`
   در بدترین حالت فقط ۲ گزینه برمی‌گرداند؛ فاز ۸ تضمین نوعی می‌سازد که هر
   تصمیم ثبت‌شده همیشه ≥۳ بدیل رتبه‌بندی‌شده با دلیل رد دارد.
4. **انقضای فعال (Active Expiration):** فیلد `expiresAt` از قبل وجود دارد اما
   هیچ‌کس آن را بررسی نمی‌کند؛ فاز ۸ ماشین انقضا می‌سازد: تصمیم منقضی
   «قابل‌اقدام» نیست، گارد چرخهٔ عمر را چک می‌کند و Worker هر ۶ ساعت
   تصمیم‌های سرسشده را بدون حذف فیزیکی بازنشسته می‌کند.

### چرا این چهار مورد؟

زیرا فاز ۹ (حاکمیت) که بلافاصله پس از این فاز اجرا می‌شود، به **خط پایا**
نیاز دارد: نمی‌توان «هر تصمیم ۹۰ روز حفظ شود» (GOV-DECISION-002) را روی
تصمیم‌های فرّار در حافظه اعمال کرد. پایاوری فاز ۸، پیش‌نیاز حاکمیت فاز ۹ است.

---

## ۲. تحلیل وضع موجود

### ۲.۱ دارایی‌های موجود

| دارایی | محل | وضعیت | محدودیت |
|---|---|---|---|
| DecisionEngineImpl | `p8-core.ts` (۴۱۵ خط) | غنی: ۴ ناحیهٔ احتمال + ۳ قاعدهٔ دامنه + بدیل‌ها | در حافظه؛ بدیل می‌تواند ۲ بماند؛ اثر کیفی نه کمی |
| ActionPlannerEngineImpl | همان | ۵ الگو + simulate + estimateImpact | در حافظه؛ rollback فقط برای adjust_price |
| SafetyEngineImpl | همان | ۷ قاعدهٔ SAF + auditTrail درون‌حافظه | رد حسابرسی با ری‌استارت می‌میرد |
| قراردادهای v1 | `engines/decision.ts` و دو همتا | رابط خالص برای معماری‌های آینده | — |
| جفت‌های واقعی | `intelligence-data/*.jsonl` | ۷۷۲ جفت + قهرمان v1 | — |
| AuditLog | جدول موجود | ثبت هر کنش حساس | — |

### ۲.۲ شکاف‌ها (Gap Analysis)

1. **G-DEC-01 (پایاوری):** `records: DecisionRecord[] = []` — آرایهٔ خصوصی؛
   هیچ مسیری از بیرون به DB نمی‌رسد. بازیابی پس از ری‌استارت ناممکن؛
   GOV-DECISION-002 (حفظ ۹۰ روز) ناپذیر است.
2. **G-DEC-02 (اثر کمی):** `expectedOutcome: string` — توصیفی. مقایسهٔ
   دو تصمیم (کدام بیشتر اثر دارد؟) ممکن نیست.
3. **G-DEC-03 (بدیل ≥۳):** `rankAlternatives` گزینه‌های شرطی دارد؛ اگر هیچ
   قاعدهٔ دامنه‌ای فعال نباشد فقط ۲ گزینه تولید می‌شود — نقض «حداقل ۳».
4. **G-DEC-04 (انقضای فعال):** `expiresAt` نوشته می‌شود اما `isExpired()`
   وجود ندارد؛ تصمیم سرسشده مثل تازه رفتار می‌کند.
5. **G-ACT-01 (rollback ناقص):** فقط `adjust_price` طرح بازگشت دارد؛
   چهار الگوی دیگر بی‌بازگشت‌اند.
6. **G-SAF-01 (حسابرسی ناپایدار):** `auditTrail` درون‌حافظه است؛ SAF-006
   («صفر تغییر داده بدون audit») عملاً بدون شاهد است.
7. **G-SHD-01 (بدون Shadow Mode):** هیچ مسیر تولیدی که تصمیم بسازد،
   ثبتش کند و هرگز اجرایش نکند، وجود ندارد.

### ۲.۳ درس‌های PN-018 که این سند رعایت می‌کند

- **تاریخ‌ها epoch-ms اند** (کشف ۶): همهٔ مقایسه‌های زمانی SQL خام با
  پرانتس عددی انجام می‌شود، نه رشته.
- **جریان‌های live جدا از snapshot تاریخی** (کشف ۵): ثبت تصمیم زنده در
  جدول تازه؛ فایل‌های jsonl دیمن دست‌نخورده می‌مانند.
- **هر تغییر مدل رفتار، مهر نسخهٔ مدل می‌خورد** (فاز ۷): هر تصمیم
  ثبت‌شده شناسهٔ نسخهٔ قهرمان لحظهٔ ساخت را حمل می‌کند.
- **بدهی گام ۲ (TS2393):** هر فایل TS تازه پیش از دروازه با tsc دو
  پیکربندی (app + scripts) بررسی می‌شود.

---

## ۳. اهداف و غیراهداف

### ۳.۱ اهداف

1. OG-8-1: پایاوری کامل سه موتور تصمیم در چهار جدول تازه با AuditLog.
2. OG-8-2: `expectedImpact` کمی سه‌مؤلفه‌ای روی هر تصمیم + سقف مهارشده.
3. OG-8-3: تضمین نوعی «≥۳ بدیل رتبه‌بندی‌شده با whyRejected».
4. OG-8-4: ماشین انقضای فعال + بازنشستی بدون حذف (دکترین دادهٔ مقدس).
5. OG-8-5: rollback برای هر ۵ الگوی برنامهٔ اقدام.
6. OG-8-6: Shadow Mode زنده روی دادهٔ واقعی: تولید تصمیم از جفت‌های
   قهرمان، ثبت، صفر اجرا — با شاهد قابل بازتولید.
7. OG-8-7: پنج روت OWNER-only + آینهٔ v1.
8. OG-8-8: گارد `audit-decision-safety.sh` با دریل منفی.
9. OG-8-9: ≥۲۰ تست تازه شامل تست‌های سلبی (نقض type-level + runtime).

### ۳.۲ غیراهداف

1. اجرای خودکار هر گام — **ممنوع مطلق** (قید سازنده؛ autoExecute=false).
2. تغییر الگوریتم نمره‌دهی/رتبه‌بندی موجود — تعمیق یعنی پایاوری+اثر+بدیل+انقضا،
   نه بازنویسی ریاضیات معتبر PN-014.
3. LLM یا تماس برون‌سازمانی در مسیر تصمیم — SAF-007 صریحاً می‌بندد.
4. UI تازه — سه روت API و شاهد JSON کافی است؛ کاشی تصمیم به فاز ملی.

---

## ۴. معماری کلی — سه لایهٔ تعمیق

```
┌─────────────────────────────────────────────────────────────────┐
│ لایهٔ ۳ — سرویس و API (تازه)                                     │
│   decision-service.ts · /api/admin/decisions (+v1 mirror)        │
│   makeDecisionFromPrediction() · expireSweep() · shadowRun()    │
├─────────────────────────────────────────────────────────────────┤
│ لایهٔ ۲ — پایاوری (تازه)                                          │
│   DecisionRecord · ActionPlanRecord · SafetyCheckRecord           │
│   ShadowDecisionRun  +  AuditLog برای هر transition               │
├─────────────────────────────────────────────────────────────────┤
│ لایهٔ ۱ — موتور خالص (موجود، تعمیق‌یافته)                          │
│   p8-core.ts: DecisionEngineImpl · ActionPlannerEngineImpl        │
│   SafetyEngineImpl  — بدون I/O، بازتولیدپذیر، تست‌پذیر            │
└─────────────────────────────────────────────────────────────────┘
```

قاعدهٔ لایه‌بندی (عین دکترین پروژه): موتور خالص هرگز DB را نمی‌شناسد؛
سرویس هرگز ریاضیات موتور را بازپیاده نمی‌کند؛ API هرگز منطق دامنه ندارد.

---

## ۵. مدل داده — چهار جدول تازه

### ۵.۱ DecisionRecord (پایاوری تصمیم)

ستون‌ها دقیقاً ۱۵ فیلد پندرگانهٔ §۶ + دو ستون فنی Prisma (id زمان‌دار cuid).
قید کلیدی: `autoExecute Boolean @default(false)` در سطح DB؛
`requiresApproval Boolean @default(true)`.

### ۵.۲ ActionPlanRecord

برنامهٔ اقدام مرجطه: `decisionId` + `pattern` + `stepsJson` + `rollbackPlan`
(همیشه غیر-null پس از فاز ۸) + `simulationJson` + `impactJson` + `autoExecute=false`.

### ۵.۳ SafetyCheckRecord

هر اجرای `check()`: `decisionId` + `passed` + `blockedByJson` + `warningsJson`
+ `checkedRulesJson` — شاهد SAF-006 (تغییر داده بدون audit → ممنوع).

### ۵.۴ ShadowDecisionRun

هر اجرای سایه: `sourcePredictionId` + `decisionId` + `executedSteps=0`
(قید type-level `literal 0`) + `verdict` + `ranAt`.

### ۵.۵ قواعد مهاجرت

- `prisma db push` (الگوی مستند P6.5 — migrate dev ریست می‌خواهد).
- هر جدول append-mostly: فقط به‌روزرسانی وضعیت (active→expired) مجاز است؛
  حذف فیزیکی ممنوع (دکترین دادهٔ مقدس).
- Indexها: `DecisionRecord(expiresAt, status)` برای جاروب انقضا؛
  `SafetyCheckRecord(decisionId)`؛ `ShadowDecisionRun(ranAt)`.

---

## ۶. DecisionRecord پندرگانه (۱۵ فیلد)

| # | فیلد | نوع | توضیح |
|---|---|---|---|
| ۱ | id | String @id | کلید یکتا (cuid) |
| ۲ | predictionId | String | ارجاع به پیش‌بینی مبدأ (SAF-001) |
| ۳ | decisionType | String | یکی از هفت نوع |
| ۴ | proposedAction | String | کنش پیشنهادی نخست |
| ۵ | confidence | Float | اطمینان ۰..۱ (SAF-002: ≥۰٫۳) |
| ۶ | rationale | String | دلیل فارسی کامل (SAF-003) |
| ۷ | expectedImpact | Json | سه‌مؤلفه‌ای §۸ |
| ۸ | alternativesJson | Json | ≥۳ گزینهٔ رتبه‌بندی‌شده §۹ |
| ۹ | requiredResourcesJson | Json | فهرست منابع |
| ۱۰ | safetyReportJson | Json | گزارش هفت‌قاعده‌ای |
| ۱۱ | status | String | active/expired/superseded |
| ۱۲ | expiresAt | DateTime | انقضا §۱۰ |
| ۱۳ | createdAt | DateTime | لحظهٔ ثبت |
| ۱۴ | tierAtCreation | Int | Tier لحظهٔ ساخت |
| ۱۵ | modelVersionId | String? | مهر قهرمان لحظهٔ تصمیم |

دو ستون `updatedAt`/`requiresApproval`/`autoExecute` در سطح type لفظی
(literal) قفل می‌شوند: `requiresApproval: true` و `autoExecute: false` —
نقض آن در تایپ‌اسکریپت خطای کامپایل است، نه رفتار.

---

## ۷. تعمیق موتور تصمیم

### ۷.۱ آنچه تغییر نمی‌کند

- فرمول ناحیهٔ احتمال (۴ ناحیه: <۰٫۲۵ منتظر · <۰٫۵ بررسی · <۰٫۷۵ تماس ·
  بقیه فوری) عین سند ۰۲۷ §۳.۳.۱.
- سه قاعدهٔ دامنه: قیمت <۰٫۸× میانگین محلی → تعدیل؛ نرخ کارشناس ≥۰٫۹ →
  تخصیص؛ >۹۰ روز بازار → بازبینی.
- سازوکار id تصیم و ترتیب ثبت.

### ۷.۲ آنچه تعمیق می‌یابد

1. `decide()` خروجی خود را به سرویس تحویل می‌دهد که **الزاماً** ثبت DB
   می‌کند؛ مسیر «تصمیم بدون ثبت» حذف می‌شود.
2. `rankAlternatives` پس از رتبه‌بندی، اگر <۳ گزینه باشد، گزینهٔ
   «بازبینی در چرخهٔ بعد» را به‌عنوان بدیل محافظه‌کارانه اضافه می‌کند —
   بنابراین همیشه ≥۳.
3. `expectedImpact` به‌جای رشته، ساختار §۸ تولید می‌کند و در rationale
   خلاصهٔ فارسی آن می‌آید.

---

## ۸. Expected Impact — تحلیل اثر کمی

### ۸.۱ مدل سه‌مؤلفه‌ای

```ts
interface ExpectedImpact {
  liftPercent: number;    // برآورد بهبود احتمال موفقیت (۰..۴۰)
  reach: "listing" | "owner" | "branch" | "market"; // دامنهٔ اثر
  horizonDays: number;    // افق تحقق (۷..۹۰)
  basis: string;          // مبنای برآورد — قابل‌ممیزی
}
```

### ۸.۲ جدول پایهٔ lift (بازرسی‌پذیر — عین الگوی estimateImpact)

| decisionType | lift | reach | horizon |
|---|---|---|---|
| priority_action | ۱۵ | listing | ۷ |
| contact_owner | ۱۵ | listing | ۱۴ |
| assign_expert | ۱۸ | listing | ۳۰ |
| adjust_price | ۲۵ | listing | ۴۵ |
| schedule_visit | ۲۰ | listing | ۳۰ |
| investigate | ۵ | listing | ۲۱ |
| wait | ۰ | listing | ۳۰ |

### ۸.۳ قواعد مهار (guard-rails)

1. `liftPercent` کلمپ ۰..۴۰ — هیچ تصمیمی ادعای بیش از ۴۰٪ ندارد.
2. `basis` اجباری — «جدول پایهٔ فاز ۸ §۸.۲ + قاعدهٔ دامنهٔ فعال».
3. مقایسهٔ دو تصمیم فقط روی ضرب `liftPercent × confidence` مجاز است
   (اثر وزنی) — در rationale ذکر می‌شود.

---

## ۹. Alternatives Ranking — حداقل سه گزینه

هر تصمیم ثبت‌شده آرایه‌ای از:

```ts
interface DecisionAlternativeV2 {
  action: string;         // کنش
  whyRejected: string;    // دلیل رد (خالی فقط برای گزینۀ برتر)
  expectedValue: number;  // مقدار انتظاری قابل‌مقایسه
  rank: number;           // ۱ = برتر
}
```

قاعدهٔ تضمین: سازندهٔ سرویس پس از رتبه‌بندی، `alternatives.length < 3`
را با خطای دامنه رد می‌کند (`ALTERNATIVES_MIN` راه‌اندازی نمی‌شود، نه
پرکردن خاموش) — خطای بلند به‌جای دادهٔ ناقص (fail-loud).

---

## ۱۰. Expiration — چرخهٔ عمر تصمیم

### ۱۰.۱ ماشین حالت

active → (expiresAt ≤ now) → expired → (تصمیم تازه همان predictionId) → superseded

### ۱۰.۲ قواعد

1. TTL پیش‌فرض ۷ روز (env `MELK_DECISION_TTL_DAYS`).
2. `isExpired(r, now)` خالص در موتور؛ سرویس فقط wrapper.
3. جاروب Worker هر ۶ ساعت: `status='active' AND expiresAt <= now` →
   `status='expired'` + AuditLog — **بدون حذف**.
4. خواندن تصمیم منقضی در API، برچسب `expired: true` برمی‌گرداند؛
   ساخت برنامهٔ اقدام روی تصمیم منقضی → خطای ۴۰۹ `DECISION_EXPIRED`.

---

## ۱۱. Action Planner تعمیق‌یافته

### ۱۱.۱ rollback برای هر ۵ الگو

| pattern | rollbackPlan |
|---|---|
| direct_call | «نیازی به بازگردانی نیست — تماس ثبتِپذیر است؛ در صورت خطای شماره، اصلاح دفترچهٔ تماس» |
| property_visit | «لغو هماهنگی بازدید و عذرخواهی از مالک — هیچ دادهٔ برون‌سیستمی تغییر نکرده» |
| price_adjust | «بازگرداندن قیمت قبلی در ARM و ثبت دلیل در حسابرسی» |
| expert_assign | «لغو تخصیص و بازگشت به صف بررسی — سوابق کارشناس دست‌نخورده» |
| smart_wait | «بازگشت به صف پایش هفتگی — بدون کنش» |

### ۱۱.۲ گام‌ها با مالک صریح

هر ActionStep مالک دارد (system/consultant/owner) و گام‌های مالک‌دار در
simulate به‌عنوان bottleneck برمی‌گردند.

---

## ۱۲. simulate() و estimateImpact()

- `simulate(plan)`: زمان کل، مسیر بحرانی، گلوگاه‌های مالک — عین موجود،
  اما خروجی در `simulationJson` ثبت می‌شود.
- `estimateImpact(plan, decision)`: lift الگو + rationale فارسی — خروجی
  در `impactJson` ثبت می‌شود و با `expectedImpact` تصمیم سازگاری
  cross-check می‌شود (نقض >۵ واحد → هشدار در warnings).

---

## ۱۳. Safety — هفت قاعدهٔ سخت fail-closed

عین SAF-001..007 موجود؛ تعمیق فقط در **پایاوری**: هر `check()` یک ردیف
SafetyCheckRecord + AuditLog می‌سازد. تست سلبی مرزی:

1. تصمیم بدون predictionId → block (SAF-001).
2. confidence < ۰٫۳ → block (SAF-002).
3. rationale خالی → block (SAF-003).
4. `autoExecute=true` تلاش شود → **خطای تایپ کامپایل** + در runtime
   سازنده سرویس با ۴۲۲ رد می‌کند (دو لایه).
5. financialAuto=true زمینه‌ای → block (SAF-004).
6. تماس بدون تأیید → block (SAF-005).
7. تغییر داده بدون AuditLog → block (SAF-006).

fail-closed یعنی: هر استثنای ناشناخته در مسیر ارزیابی → `passed:false`
با `blockedBy:["SAF-000"]` — هرگز pass خاموش.

---

## ۱۴. Shadow Mode — ثبت تصمیم، صفر اجرا

### ۱۴.۱ جریان سایه (هر ۶ ساعت، کار Worker)

1. آخرین قهرمان هر مدل را بگیر (ModelVersion champion).
2. از جفت‌های واقعی زنده، نمونهٔ تازه بگیر (تا ۵ در هر اجرا).
3. برای هر نمونه: decide → check → plan → simulate → estimateImpact.
4. همه در جداول ثبت؛ `ShadowDecisionRun.executedSteps = 0` همیشه.
5. AuditLog: `SHADOW_DECISION_RUN` با شمارش.

### ۱۴.۲ گارانتی صفر-اجرا

- `executedSteps` در type لفظی ۰ است (literal zero).
- گارد §۲۱ فیلد را در DB چک می‌کند (نقض = FAIL).
- هیچ مسیر کدی که ActionPlan را «اجرا» کند وجود ندارد — جستجوی گارد.

---

## ۱۵. لایهٔ سرویس

`src/lib/services/decision-service.ts`:

- `createDecisionFromPrediction(input)` — از پیش‌بینی قهرمان تصمیم می‌سازد،
  ثبت می‌کند، گزارش ایمنی می‌سازد، برنامه + شبیه‌سازی + اثر می‌سازد.
- `listDecisions({status, includeExpired})`.
- `getDecision(id)` + `isExpired` برچسب.
- `expireSweep(now)` — جاروب انقضا.
- `shadowDecisionTick()` — جریان §۱۴.
- هر transition → AuditLog.

---

## ۱۶. طراحی API

| روت | متد | نقش | شرح |
|---|---|---|---|
| /api/admin/decisions | GET | OWNER | فهرست + فیلتر وضعیت |
| /api/admin/decisions | POST | OWNER | ساخت سایهٔ تصمیم از predictionId |
| /api/admin/decisions/stats | GET | OWNER | شمارش per status/type |
| /api/admin/action-plans | GET | OWNER | برنامه‌ها + شبیه‌سازی |
| /api/admin/decisions/expire | POST | OWNER | جاروب دستی انقضا (شفافیت) |

آینهٔ v1 هر پنج روت — مانیفست ۸۴→۸۹.
خطاها: `DECISION_EXPIRED` (۴۰۹) · `PREDICTION_NOT_FOUND` (۴۰۴) ·
`SAFETY_BLOCKED` (۴۲۲) · `ALTERNATIVES_MIN` (۵۰۰ — نقص سازنده، بلند).

---

## ۱۷. یکپارچگی Worker

کار یازدهم: `decision-shadow` — هر ۶ ساعت (`MELK_DECISION_SHADOW_INTERVAL_H`):
shadowTick + expireSweep. Worker ۱۰→۱۱ کار. شکست = لاگ INFRA_ALERT، نه کرش
(الگوی drift-guard).

---

## ۱۸. قواعد Tier-aware

- Tier 0-1: shadow فقط ثبت؛ هیچ پیشنهاد شخصی‌سازی.
- Tier 2+: `category` از زمینه در تصمیم ثبت می‌شود.
- Tier 3+: `personalizedFor` مالک پر می‌شود.
- مهر `tierAtCreation` روی هر ردیف — گارد رانش/حاکمیت می‌خواندش.

---

## ۱۹. ملاحظات امنیتی

1. همهٔ روت‌ها OWNER-only با `requireRole` (الگوی model-versions).
2. هیچ دادهٔ شخصی در rationale درج نمی‌شود — فقط کد/دامنه/درصد.
3. AuditLog برای هر ساخت/انقضا/سایه.
4. SQL خام ممنوع در سرویس — فقط Prisma typed.
5. مهر نسخهٔ مدل بر هر تصمیم (قابلیت ردیابی قهرمان).

---

## ۲۰. طرح تست

≥۲۰ تست تازه در `tests/pn019-phase8.test.ts`:

**ایجابی (۱۲):** ساخت تصمیم از جفت واقعی · ۱۵ فیلد کامل · ≥۳ بدیل ·
انقضای زمان‌پیمایی · rollback هر ۵ الگو · simulate اعداد درست ·
impact سازگار · ثبت SafetyCheck · ShadowRun با executedSteps=0 ·
API ۲۰۰ با نقش OWNER · آینهٔ v1 · expireSweep تغییر وضعیت.

**سلبی (۸):** predictionId خالی → SAF-001 block · confidence ۰٫۲ → block ·
autoExecute=true در runtime → ۴۲۲ · ساخت برنامه روی منقضی → ۴۰۹ ·
بدیل <۳ → ALTERNATIVES_MIN · بدون OWNER → ۴۰۳ · روت v1 بدون نقش → ۴۰۱ ·
SAF-006 بدون AuditLog → block.

---

## ۲۱. طرح گارد

`scripts/audit-decision-safety.sh` — وارسی‌های DB + کد:

1. هیچ DecisionRecord با `autoExecute=1` وجود ندارد.
2. هیچ SafetyCheckRecord با passed=1 و blockedBy غیرخالی.
3. هر ShadowDecisionRun با executedSteps≠0 → FAIL.
4. هر ActionPlanRecord دارای rollbackPlan غیرخالی.
5. هر DecisionRecord دارای ≥۳ alternativesJson.
6. جستجوی کد: هیچ `executePlan|runAction` در مسیر سرویس وجود ندارد.
7. هر تصمیم active با expiresAt گذشته → هشدار (باید جاروب شده باشند).

خروج ۰ = PASS. دریل منفی: کاشت ردیف autoExecute=1 → گارد قرمز → پاکسازی.

---

## ۲۲. طرح شواهد

`download/pn019/decision-deepened.json`: فهرست ۱۵ فیلد با نمونهٔ واقعی ·
`action-planner.json`: هر ۵ الگو با rollback/simulate/impact ·
`safety.json`: هفت قاعده × پاس سلبی/ایجابی · شمارش نهایی جداول.

---

## ۲۳. ریسک‌ها و کاهش‌ها

| ریسک | احتمال | کاهش |
|---|---|---|
| رشد جدول تصمیم (هر ۶ ساعت × ۵) | کم | سقف نمونه؛ پایش سایز گارد size-guard |
| هم‌زمانی جاروب و خواندن | کم | append-mostly + وضعیت اتمیک |
| نقض نوعی در آینده | متوسط | دو لایه: تایپ + runtime 422 + گارد |

---

## ۲۴. بدیل‌های بررسی‌شده و ردشده

1. **ذخیرهٔ تصمیم در jsonl** — رد: بدون پرس‌وجو/ایندکس/تراکنش؛
   GOV-DECISION-002 ناپذیر.
2. **بازنویسی موتور از صفر** — رد: PN-014 روی دادهٔ واقعی اعتبارسنجی
   شده؛ تعمیق ≠ بازتولید.
3. **Execution محدود با سقف** — رد مطلق: قید سازنده فاز ۸؛ هر گام اجرا
   نیازمند تأیید انسانی است و اجرای خودکار در فاز ملی هم ممنوع می‌ماند.
4. **Expiration با حذف فیزیکی** — رد: دکترین دادهٔ مقدس (لایهٔ خام محفوظ).

---

## پیوست الف — ماشین حالت تصمیم

```
      decide()
   ┌──────────┐  expiresAt≤now   ┌─────────┐  decision جدید همان predictionId
   │  active  │ ───────────────▶ │ expired │ ───────────────▶ ┌────────────┐
   └──────────┘                   └─────────┘                  │ superseded │
        │                                                          └────────────┘
        │ check() هر ساخت
        ▼
   SafetyCheckRecord (append-only)
```

## پیوست ب — پارامترها و پیش‌فرض‌ها

| پارامتر | پیش‌فرض | env |
|---|---|---|
| TTL تصمیم | ۷ روز | MELK_DECISION_TTL_DAYS |
| فاصلهٔ سایه | ۶ ساعت | MELK_DECISION_SHADOW_INTERVAL_H |
| نمونهٔ هر سایه | ۵ | MELK_DECISION_SHADOW_SAMPLE |
| حداقل بدیل | ۳ | ثابت (قابل تغییر نیست) |
| سقف lift | ۴۰٪ | ثابت |

---

*پایان سند طراحی فاز ۸ — PN-019-DES8-1405 · نسخه ۱٫۰*
