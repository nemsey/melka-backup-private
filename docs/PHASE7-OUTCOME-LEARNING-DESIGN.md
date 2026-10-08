# سند طراحی فاز ۷ — یادگیری از نتیجه (Outcome Learning)
## ملکا · شماره سند: PN-018-DES-1405 · نسخه ۱٫۰ · تاریخ: ۱۴۰۵/۰۷/۲۰

> «فازهای ۷ تا ۱۱ نه فقط قابلیت‌های تازه، بلکه بلوغ کامل مغز است.» — دبیر شورای عالی ملکا، جلسهٔ ۰۲۲

---

## فهرست

۱. خلاصهٔ اجرایی
۲. تحلیل وضع موجود
۳. اهداف و غیراهداف
۴. معماری کلی
۵. مدل داده (دو جدول تازه)
۶. چارچوب Champion/Challenger
۷. دروازهٔ تأیید شورا (Council Approval Gate)
۸. آشکارساز رانش (Drift Detection) — سه نوع
۹. حلقهٔ کامل یادگیری
۱۰. لایهٔ سرویس (مرز مخزن)
۱۱. طراحی API
۱۲. یکپارچگی Worker
۱۳. قواعد Tier-aware
۱۴. کالیبراسیون اطمینان
۱۵. ملاحظات امنیتی
۱۶. طرح تست (≥۴۰)
۱۷. طراحی سه گارد
۱۸. طرح استقرار
۱۹. طرح شواهد
۲۰. ریسک‌ها و کاهش‌ها
۲۱. بدیل‌های بررسی‌شده
۲۲. پیوست الف — ماشین حالت نسخهٔ مدل
۲۳. پیوست ب — نمودار توالی حلقهٔ کامل
۲۴. پیوست ج — پارامترها و پیش‌فرض‌ها

---

## ۱. خلاصهٔ اجرایی

### ۱.۱ مسئله

مغز ملکا ۱۱ موتور دارد که در PN-014 همگی روی دادهٔ واقعی VALIDATED شدند (Brier=۰٫۲۳۵۴). اما این موتورها «در مرز سطح ۲ و ۳» هستند: هر اجرای دیمن، ارزیابی را از صفر محاسبه می‌کند، خروجی در `loop-latest.json` بازنویسی می‌شود و **هیچ حافظهٔ نسخه‌ای از خودِ مدل وجود ندارد**. یعنی:

- اگر امروز وزن‌های آموخته بهتر باشند، فردا اثری از آن بهتر بودن باقی نمی‌ماند؛
- نمی‌دانیم «مدل فعلی» دقیقاً کدام پیکربندی است و از چه لحظه‌ای قهرمان (Champion) شده؛
- اگر کیفیت مدل افت کند، هیچ سازوکاری افت را خودکار نمی‌بیند و هیچ مسیر ایمنی برای بازگشت (Rollback) وجود ندارد.

### ۱.۲ راه‌حل در یک پاراگراف

فاز ۷ سه ستون به مغز اضافه می‌کند: (۱) **جدول ModelVersion** — رجیستری پایدار نسخه‌های مدل با وضعیت قهرمان/چالشگر/بازنشسته/ردشده و امتیاز Brier هر یک؛ (۲) **دروازهٔ تأیید شورا** — هیچ ارتقای مدل بدون تأیید صریح شورا انجام نمی‌شود (قید سند ۰۲۷ §۲.۴)؛ (۳) **آشکارساز رانش سه‌گانه** — رانش داده/مفهوم/عملکرد هر ۶ ساعت در Worker اجرا می‌شود و در صورت انحراف، هشدار به شورا (AuditLog) صادر می‌شود. با این سه ستون، حلقهٔ کامل بسته می‌شود: پیش‌بینی → پیامد → ارزیابی → یادگیری → **ساخت چالشگر → ارزیابی سایه → ارتقا با تأیید → پیش‌بینی تازه با نسخهٔ جدید**.

### ۱.۳ معیار پذیرش (خلاصه)

| # | معیار | سنجه |
|---|---|---|
| A1 | حداقل یک چرخهٔ کامل روی دادهٔ واقعی | full-loop.json با هر شش مرحله + شاهد |
| A2 | هیچ ارتقا بدون تأیید شورا | تست منفی + گارد |
| A3 | رانش سه‌گانه زنده در Worker | کار drift-guard هر ۶ ساعت + ردیف DriftCheck |
| A4 | ≥۴۰ تست تازه | دو-سبز یکسان در CI |
| A5 | سه گارد سبز | champion-challenger · drift · learning-loop |
| A6 | صفر تغییر رفتار موتورهای موجود | ۲۰۷۲ تست موجود سبز بمانند |

---

## ۲. تحلیل وضع موجود

### ۲.۱ آنچه هست (دارایی‌ها)

| دارایی | مکان | وضعت |
|---|---|---|
| PredictionEngine | `src/core/intelligence/engines/prediction.ts` | بدنهٔ کامل — ۷۷۲ پیش‌بینی واقعی |
| OutcomeEngine | `src/lib/intelligence/outcome-loop.ts` | ۷۷۲ پیامد واقعی ARM پیوندشده |
| EvaluationEngine (Brier) | `p7-core.ts` L157 | Brier=۰٫۲۳۶۸ روی پنجرهٔ کامل |
| LearningEngine | `p7-core.ts` L286 | بازنویسی وزن‌ها بر اساس بازخورد — بدون نسخه‌بندی پایدار |
| ShadowEvaluationFramework | `p7-core.ts` L416 | معیار ارتقا §۲.۴ پیاده شده — اما **فقط در حافظه** |
| DriftDetector (سه‌گانه) | `p7-core.ts` L438 | سه آشکارساز کامل — اما **فقط در گزارش لحظه‌ای** |
| دیمن هوش | `src/lib/intelligence/daemon.ts` | هر ۶ ساعت — بدون شاخهٔ رانش |
| دیمن کاتالوگ | `src/lib/melk-api/catalog-daemon.ts` | مستقل از این فاز |
| رجیستری مدل‌ها | `src/core/intelligence/models/registry.ts` | ۱۱ مدل پیکربندی — `engineSet: "SHARED-11"` |
| کالیبراسیون | `calibration/calibration-map.ts` | نقشهٔ مصوب شورا (جلسهٔ ۰۳۳) |

### ۲.۲ شکاف‌ها (چرا حلقه بسته نیست)

1. **بدون حافظهٔ نسخه:** `ShadowEvaluationFramework.build()` هر بار شیء تازه می‌سازد؛ `verdict` محاسبه می‌شود و در همان اجرا گم می‌شود.
2. **بدون مسیر ارتقا:** هیچ جدول/سرویسی «چالشگر → قهرمان» را ثبت نمی‌کند؛ `retrain-state.json` تنها یک پروندهٔ یک‌بارهٔ دستی است (شاهد P6545).
3. **بدون رانش پایدار:** `DriftDetector` خروجی را در گزارش چرخه می‌ریزد؛ هیچ ردیفی برای پایش روند ذخیره نمی‌شود و Worker آن را اجرا نمی‌کند.
4. **بدون قید شورا در کد:** معیار §۲.۴ «تأیید شورا» پارامتر ورودی است — هیچ API‌ای آن را الزامی نمی‌کند.
5. **پیش‌بینی بی‌مهر نسخه:** رکوردهای `predictions.jsonl` نمی‌گویند توسط کدام نسخهٔ مدل تولید شده‌اند (بزرگ‌ترین عامل غیرقابل-بازگشت).

### ۲.۳ نقشهٔ وابستگی‌ها

```
predictions.jsonl ──┐
                    ├─→ EvaluationEngine ─→ Brier قهرمان
outcomes.jsonl ─────┘         ↑
                              │ مقایسه
Challenger (وزن‌های آموخته) ──┘ ─→ Shadow verdict
                                        │
                    ┌─── promote ←──────┤
                    │  (نیازمند تأیید شورا)
                    ↓
              ModelVersion (جدول تازه)
                    │
                    ├─→ مهر روی پیش‌بینی‌های تازه
                    └─→ rollback ⇒ بازگشت به نسخهٔ پیشین
```

---

## ۳. اهداف و غیراهداف

### ۳.۱ اهداف

1. **G1 — رجیستری پایدار نسخه:** هر مدل دامنه‌ای می‌تواند چند نسخه داشته باشد؛ در هر لحظه حداکثر یک قهرمان.
2. **G2 — ارزیابی سایهٔ خودکار:** چالشگر روی همان جفت‌های واقعی قهرمان ارزیابی می‌شود؛ معیار §۲.۴ عیناً اعمال می‌شود (ΔBrier ≤ −۰٫۰۲ · ≥۵۰ نمونه · ≥۷ روز).
3. **G3 — دروازهٔ شورا:** ارتقا فقط با `councilApproval=true` صریح + ثبت منبع تأیید در AuditLog.
4. **G4 — رانش سه‌گانه در Worker:** هر ۶ ساعت؛ سه نوع رانش؛ آستانه‌ها از Policy؛ هشدار escalate/retrain به AuditLog.
5. **G5 — حلقهٔ کامل مهرشده:** پیش‌بینی‌های تازه شناسهٔ نسخهٔ فعال را حمل می‌کنند.
6. **G6 — بازگشت ایمن:** rollback به نسخهٔ بازنشسته با یک فراخوان + ثبت کامل.

### ۳.۲ غیراهداف (صریح)

- **N1:** تغییر الگوریتم خودِ موتورها (وزن‌ها/فرمول‌ها دست‌نخورده — قید SHARED-11).
- **N2:** ارتقای خودکار بدون شورا — هرگز (قید مطلق سند ۰۲۷).
- **N3:** فازهای ۸-۱۱ (تصمیم/حاکمیت/خودتشخیص/خودترمیری) — در PN-019/020.
- **N4:** مدل‌سازی آماری پیچیده (Bayesian updating و امثال آن) — وزن‌های خطی موجود با تفسیرپذیری بالا نگه داشته می‌شوند.

---

## ۴. معماری کلی

### ۴.۱ لایه‌ها (الگوی مرز مخزن پروژه)

```
┌────────────────────────────────────────────────────────────┐
│ API (لاغر — فقط Auth+Validation+Service+Response)            │
│   /api/admin/model-versions        GET · POST               │
│   /api/admin/model-versions/[id]/promote   POST (شورا)      │
│   /api/admin/model-versions/[id]/reject    POST             │
│   /api/admin/model-versions/[id]/rollback  POST (شورا)      │
│   /api/admin/drift-checks            GET                    │
├────────────────────────────────────────────────────────────┤
│ سرویس (تک‌نقطهٔ منطق)                                        │
│   model-versioning-service.ts   — چرخهٔ عمر نسخه            │
│   drift-service.ts              — سه آشکارساز + پایدارسازی   │
│   learning-loop-service.ts      — ارکستration حلقهٔ کامل    │
├────────────────────────────────────────────────────────────┤
│ موتورها (موجود — دست‌نخورده)                                │
│   ShadowEvaluationFramework · DriftDetector ·               │
│   EvaluationEngineImpl · LearningEngineImpl                  │
├────────────────────────────────────────────────────────────┤
│ داده                                                        │
│   ModelVersion · DriftCheck (تازه) · AuditLog ·             │
│   predictions.jsonl · outcomes.jsonl · loop-latest.json     │
└────────────────────────────────────────────────────────────┘
```

### ۴.۲ اصل «صفر تغییر موتور»

هر سه سرویس تازه **فقط مصرف‌کنندهٔ** موتورهای موجودند. هیچ امضایی در `p7-core.ts` تغییر نمی‌کند؛ تنها استثنا: صادرکردن (export) توابعی که از پیش عمومی‌اند. این اصل تضمین می‌کند ۲۰۷۲ تست موجود بدون تغییر معنایی سبز بمانند.

---

## ۵. مدل داده

### ۵.۱ جدول ModelVersion (پایگاه تولید — مهاجرت افزایشی pn018)

| ستون | نوع | توضیح |
|---|---|---|
| id | String @id (cuid) | شناسهٔ ردیف |
| modelId | String | شناسهٔ پایدار مدل (مثل melka-property-v3) |
| version | Int | شمارهٔ نسخه — یکتا در دامنهٔ مدل |
| status | String | champion · challenger · retired · rejected |
| brierScore | Float? | امتیاز ارزیابی (null = هنوز ارزیابی نشده) |
| sampleSize | Int @default(0) | نمونه‌های ارزیابی‌شده |
| windowDays | Int @default(0) | طول پنجرهٔ ارزیابی |
| weightsJson | String? | وزن‌های آموخته (عین خروجی LearningEngine) |
| calibrated | Boolean @default(false) | آیا Brier کالیبره‌شده است؟ |
| councilApproved | Boolean @default(false) | تأیید شورا برای این نسخه |
| approvalSource | String? | منبع تأیید (شماره سند شورا) |
| promotedAt | DateTime? | لحظهٔ قهرمانی |
| retiredAt | DateTime? | لحظهٔ بازنشستگی |
| notes | String? | توضیح آزاد |
| createdAt | DateTime | — |
| updatedAt | DateTime | — |

**قیدهای یکتایی/ایندکس:** `@@unique([modelId, version])` · `@@index([modelId, status])`

### ۵.۲ جدول DriftCheck

| ستون | نوع | توضیح |
|---|---|---|
| id | String @id | — |
| modelId | String | — |
| driftType | String | performance · data · concept |
| magnitude | Float | ۰..۱ |
| action | String | monitor · alert · retrain · escalate |
| rationale | String | عین متن موتور |
| pairsBaseline | Int | — |
| pairsRecent | Int | — |
| evidenceJson | String? | زنجیرهٔ شاهد عین موتور |
| checkedAt | DateTime | — |

**ایندکس:** `@@index([modelId, checkedAt])`

### ۵.۳ نکتهٔ مهاجرت (انحراف مستند شماره ۱)

الگوی P6.5/PN-016: `prisma migrate dev` روی پایگاه ۲۶۹MB با دادهٔ مقدس ریست می‌خواهد → از `db push` افزایشی استفاده می‌شود (هر دو جدول صرفاً افزوده می‌شوند؛ هیچ ستون موجودی حذف/تغییر نمی‌کند).

---

## ۶. چارچوب Champion/Challenger

### ۶.۱ ماشین حالت نسخه

```
                ensureChallenger()
   (بدون نسخه) ────────────────→ [challenger]
                                      │
                    shadowTick() → verdict
                    ├── promote (شورا) → [champion] (قبلی → retired)
                    ├── reject          → [rejected]
                    └── keep_primary    → [challenger] (ادامهٔ پایداری)
                    
   [champion] ── rollback(target) ──→ [retired] + target → [champion]
```

قواعد تغییر وضعیت (تک‌نقطهٔ اعمال = سرویس):
1. هر `modelId` حداکثر **یک** champion همز دارد — promote/rollback این نامتناقض بودن را اتمیک برقرار می‌کند.
2. transition فقط از حالت‌های مجاز: `challenger → champion|rejected|retired`؛ `champion → retired`؛ `retired → champion` (فقط از مسیر rollback)؛ `rejected` نهایی است.
3. هر transition رکورد AuditLog + رخداد blackboard می‌سازد.

### ۶.۲ ساخت چالشگر (ensureChallenger)

چالشگر = پیکربندی همان مدل با **وزن‌های آموختهٔ تازه**:
1. جفت‌های قهرمان (prediction↔outcome) بارگذاری می‌شوند؛
2. `LearningEngineImpl.learn()` روی آخرین دسته اجرا می‌شود؛
3. `version = max(version)+1`؛ `weightsJson` عین خروجی ذخیره می‌شود؛
4. وضعیت `challenger`؛ `councilApproved=false`.

### ۶.۳ ارزیابی سایه (shadowTick)

1. چالشگرِ فعال هر مدل بارگذاری می‌شود؛
2. همان جفت‌های واقعی قهرمان، با وزن‌های چالشگر امتیازدهی می‌شوند (بازمحاسبهٔ probability)؛
3. `EvaluationEngineImpl.computeBrierScore()` روی هر دو؛
4. `ShadowEvaluationFramework.evaluate(challenger, championReport, windowDays, councilApproved=false)` — **بدون تأیید** تا فقط verdict محاسبه شود؛
5. `brierScore`/`sampleSize`/`windowDays` روی ردیف چالشگر به‌روز می‌شود.

### ۶.۴ ارتقا (promote — با دروازهٔ شورا)

پیش‌شرط‌های سخت (همگی باید صادق باشند، وگرنه خطای ۴xx صریح):
1. ردیف در وضعیت `challenger` است؛
2. `sampleSize ≥ 50` (قید §۲.۴)؛
3. `brierScore ≤ champion.brierScore − 0.02` (بهبود معنادار)؛
4. `windowDays ≥ 7`؛
5. درخواست حاوی `councilApproval: true` **و** `approvalSource` غیرخالی است (شماره سند/جلسه).

اقدام اتمیک:
```
tx: champion → retired (retiredAt=now)
    challenger → champion (promotedAt=now, councilApproved=true, approvalSource)
    AuditLog: MODEL_PROMOTED
```

### ۶.۵ رد (reject) و بازگشت (rollback)

- **reject:** چالشگر بدتر از قهرمان (ΔBrier ≥ +۰٫۰۲) → `rejected` + AuditLog. نیازمند شورا نیست (فقط بستن مسیر است، نه تغییر قهرمان).
- **rollback:** OWNER + `councilApproval: true` + target از وضعیت `retired` — چون قهرمان فعال باطل می‌شود، هم‌رتبهٔ promote است. ثبت `MODEL_ROLLED_BACK` با دلیل.

---

## ۷. دروازهٔ تأیید شورا (Council Approval Gate)

### ۷.۱ چرا در کد و نه فقط سند؟

تجربهٔ PN-016 (قانون هویت دوگانهٔ مالک) نشان داد قواعد حاکمیتی که فقط در سند باشند، در نبود آزمون، در کد فرسوده می‌شوند. این دروازه سه لایه دارد:

1. **لایهٔ API:** promote/rollback بدون `councilApproval:true` → خطای ۴۲۲ با پیام فارسی صریح.
2. **لایهٔ سرویس:** حتی فراخوانی مستقیم تابع، بدون پارامتر مجاز ارتقا نمی‌دهد (تست منفی مستقیم).
3. **لایهٔ گارد:** `audit-champion-challenger.sh` هر ردیف champion را وارسی می‌کند: اگر `promotedAt != null` و `councilApproved == false` → قرمز CI.

### ۷.۲ ثبت منبع تأیید

`approvalSource` متن آزاد ساخت‌یافته است: «ملکا-شورا-ن۰XX-۱۴۰۵ — بند Y». این فیلد در پاسخ API‌ها و گزارش نهایی ظاهر می‌شود تا ردپای تصمیم بشری همیشه قابل بازرسی باشد.

---

## ۸. آشکارساز رانش — سه نوع

### ۸.۱ ورودی مشترک

جفت‌های قهرمان فعلی به دو پنجره شکسته می‌شوند:
- **خط پایه:** قدیمی‌ترین ۷۰٪ (یا کل تاریخ پیش از cutoff)؛
- **اخیر:** جدیدترین ۳۰٪ (یا ۷ روز اخیر — هر کدام نمونهٔ بیشتری بدهد).

### 8.2 سه آشکارساز (عین DriftDetector موجود — بدون تغییر)

| نوع | ورودی | سنجه | آستانه‌ها (پیش‌فرض Policy) |
|---|---|---|---|
| performance | Brier دو پنجره | \|ΔBrier\| | ≥۰٫۰۲ alert · ≥۰٫۰۵ retrain · ≥۰٫۱۰ escalate |
| data | میانگین ویژگی‌ها | جابه‌جایی >۰٫۱ | هر ویژگی متأثر → alert |
| concept | نرخ observed واقعی | \|Δrate\| | ≥۰٫۰۵ alert · ≥۰٫۲ retrain |

### ۸.۳ آستانه‌ها در Policy (قید G4)

مقادیر از env با پیش‌فرض‌های سند خوانده می‌شوند (پیوست ج):
`MELK_DRIFT_ALERT=0.02` · `MELK_DRIFT_RETRAIN=0.05` · `MELK_DRIFT_ESCALATE=0.10`
گارد `audit-drift-detection.sh` سازگاری کد↔Policy را می‌سنجد.

### ۸.۴ پایدارسازی و هشدار

- هر اجرا: حداکثر سه ردیف DriftCheck (یکی هر نوع) + به‌روزرسانی همان ردیف‌ها در اجرای بعدی؟ — **نه**؛ append-only (تاریخ روند حفظ می‌شود).
- کنش `alert` و بالاتر: رکورد AuditLog دستهٔ `intelligence` با operation=`DRIFT_DETECTED`.
- کنش `escalate`: `INFRA_ALERT`-مانند اما در دستهٔ intelligence — برای شورا.

---

## ۹. حلقهٔ کامل یادگیری

### ۹.1 تعریف «یک چرخهٔ کامل» (معیار A1)

```
۱. collectOutcomes()      → جفت‌های تازه از outcomes.jsonl (و ARM)
۲. evaluateChampion()      → Brier قهرمان روی پنجرهٔ کامل
۳. learn()                → وزن‌های آموخته (LearningEngine موجود)
۴. ensureChallenger()      → نسخهٔ v(n+1) با وزن‌های تازه
۵. shadowTick()            → Brier چالشگر + verdict
۶. [اگر promote مجاز و شورا تأیید کرد] promote()
۷. newPredictions()        → دیمن، پیش‌بینی‌های تازه را با modelVersionId مهر می‌زند
```

شاهد full-loop.json هر هفت گام را با اعداد واقعی ثبت می‌کند. حداقل یک چرخهٔ کامل در همین جلسه اجرا می‌شود (مرحلهٔ ۵ سند شورا).

### ۹.2 مهر نسخه بر پیش‌بینی (G5)

سرویس حلقه پس از هر ارتقا، فیلد `modelVersionId` را در رکوردهای تازهٔ `predictions.jsonl` می‌نویسد (افزودنی — رکوردهای قدیمی بدون فیلد می‌مانند و به قهرمانِ زمان خود تعلق دارند). گارد learning-loop این پیوند را وارسی می‌کند.

---

## ۱۰. لایهٔ سرویس

سه فایل تازه در `src/lib/services/` — هر کدام تک‌نقطهٔ منطق خود:

1. **model-versioning-service.ts** — CRUD نسخه + چرخهٔ عمر + دروازهٔ شورا + ارزیابی سایه. تنها نویسندهٔ جدول ModelVersion.
2. **drift-service.ts** — بارگذاری جفت‌ها، شکست پنجره، اجرای سه آشکارساز، درج DriftCheck + AuditLog. تنها نویسندهٔ DriftCheck.
3. **learning-loop-service.ts** — ارکستration هفت‌گام حلقه + شاهد. فقط خوانندهٔ jsonl و نویسندهٔ شاهد (نوشتنش از طریق دو سرویس دیگر است).

قید مرز: هیچ‌کدام از APIها `db.*` مستقیم ندارند (گارد repository-boundary --strict).

---

## ۱۱. طراحی API

| مسیر | متد | نقش | محافظت |
|---|---|---|---|
| /api/admin/model-versions | GET | فهرست + فیلتر modelId/status | OWNER |
| /api/admin/model-versions | POST | ensureChallenger (body: modelId) | OWNER |
| /api/admin/model-versions/[id]/promote | POST | ارتقا (body: councilApproval, approvalSource) | OWNER + شورا |
| /api/admin/model-versions/[id]/reject | POST | رد چالشگر | OWNER |
| /api/admin/model-versions/[id]/rollback | POST | بازگشت (body: targetId, councilApproval, reason) | OWNER + شورا |
| /api/admin/drift-checks | GET | تاریخ رانش + فیلتر | OWNER |

+ آینه‌های v1 (الگوی export *). مانیفست ۷۹ → ۸۵ (۶ مسیر تازه).

کدهای خطای فارسی: `MODEL_NOT_FOUND` · `NOT_A_CHALLENGER` · `COUNCIL_APPROVAL_REQUIRED` · `SHADOW_CRITERIA_NOT_MET` · `ALREADY_SETTLED`.

---

## ۱۲. یکپارچگی Worker

کار تازه در `src/core/runtime/jobs.ts`:

```
driftGuard: "drift-guard"  — هر ۶ ساعت:
  برای هر مدل قهرمان فعال:
    runDriftDetection(modelId)
    اگر action ≥ alert → AuditLog هشدار
```

- ثبت در `WORKER_JOB_IDS` (منبع یگانه — تست‌ها همان را می‌خوانند)؛
- الگوی اجرا عین preview-guard/reset-guard (شکست = لاگ، نه کرش)؛
- Worker از ۹ به ۱۰ کار می‌رسد.

---

## ۱۳. قواعد Tier-aware

- قهرمانِ هر مدل با Tier خودش ارزیابی می‌شود (tierFromRealData موجود)؛
- هدف Brier از `tierAwareBrierTarget()` (P6545) — نه عدد سراسری؛
- Tier 1 (دادهٔ کم): ارزیابی سایه فقط «گزارشی» — verdict حتی با Δ بهتر، تا رسیدن به حداقل‌های نمونه/پنجره promote نمی‌شود (قید §۲.۴ خودکار رعایت می‌شود).

## ۱۴. کالیبراسیون اطمینان

- `calibrated=true` فقط وقتی Brier از نقشهٔ کالیبراسیون مصوب عبور کرده باشد (loadCalibrationMap موجود)؛
- در پاسخ API، هر دو عدد raw و calibrated ارائه می‌شود (شفافیت).

## ۱۵. ملاحظات امنیتی

- همهٔ APIها OWNER-only (requireRole) + آینه v1 همان گارد؛
- `weightsJson` فقط اعداد وزن است — هیچ راز/توکنی وارد جدول نمی‌شود (گارد log-safety گسترش می‌یابد به این فیلد)؛
- AuditLog کامل هر transition (چه کسی · چه سندی · کدام نسخه).

---

## ۱۶. طرح تست (≥۴۰ تازه — ۱۰ فاز T2/T3 موجود + ≥۳۰ این فاز)

### ۱۶.۱ مدل دامنه و چرخهٔ عمر (۱۰ تست)
1. ساخت چالشگر → version=n+1 · status=challenger · councilApproved=false
2. یکتایی [modelId, version] — تکرار نمی‌سازد
3. حداکثر یک قهرمان همزمان per modelId (invariant بعد از promote)
4. shadowTick: brier/sampleSize/windowDays به‌روز می‌شوند
5. verdict=keep_primary وقتی بهبود < 0.02
6. verdict=promote-eligibility وقتی بهبود ≥ 0.02 و نمونه/پنجره کافی
7. promote بدون councilApproval → خطا (۴xx) — لایهٔ سرویس
8. promote با نمونهٔ ناکافی → خطا
9. reject چالشگر بدتر → status=rejected + AuditLog
10. rollback به retired → قهرمان تازه + قهرمان قبلی retired

### ۱۶.۲ رانش (۸ تست)
11. performance drift: ΔBrier ≥ 0.02 → alert · ≥ 0.05 → retrain · ≥ 0.10 → escalate
12. data drift: میانگین ویژگی جابه‌جا → affected
13. concept drift: نرخ واقعی متفاوت → rationale درست
14. درج DriftCheck append-only (دو اجرا → دو ردیف)
15. آستانه‌ها از env خوانده می‌شوند (override تست)
16. شکست پنجره: 70/30 روی دادهٔ مرتب‌شده
17. جفت‌های صفر → گزارش monitor بدون کرش
18. AuditLog در کنش alert+

### ۱۶.۳ حلقهٔ کامل (۶ تست)
19. runFullCycle روی fixture → هر ۷ گام در شاهد
20. چالشگر بدتر → حلقه در گام ۵ می‌ایستد (promote نمی‌شود)
21. مهر modelVersionId روی پیش‌بینی تازه
22. idempotency: دو اجرا بدون ارتقای دوبارهٔ همان نسخه
23. شاهد JSON معتبر با اعداد واقعی
24. حلقه با دادهٔ production (RO) — یک چرخهٔ زنده

### ۱۶.۴ مرز API و آینه (۶ تست)
25. CONSULTANT → 403 روی همهٔ شش مسیر
26. بدون توکن → 401
27. OWNER GET → 200 با شکل کامل
28. آینهٔ v1 = همان ماژول (تک‌منبع حقیقت)
29. روت‌ها لاغرند (صفر db.*)
30. مانیفست ۸۵ مسیر هم‌خوان

### ۱۶.۵ گاردها (۳ تست)
31. audit-champion-challenger.sh → PASS
32. audit-drift-detection.sh → PASS
33. audit-learning-loop.sh → PASS

### ۱۶.۶ کار Worker (۲ تست)
34. WORKER_JOB_IDS شامل driftGuard
35. ثبت کار در jobs.ts با فاصلهٔ ۶ ساعت

(+ تست‌های دریل منفی گاردها در خود اسکریپت‌ها)

## ۱۷. طراحی سه گارد

### audit-champion-challenger.sh
- هر مدل حداکثر یک champion؛
- هیچ champion با promotedAt≠null و councilApproved=false؛
- هر challenger دارای brierScore ثبت‌شده یا تازه‌ساخته (سن < 1h)؛
- version یکتا؛
- AuditLog برای هر transition یافت شود.

### audit-drift-detection.sh
- ردیف‌های DriftCheck: driftType مجاز (سه مقدار)؛ action مجاز (چهار مقدار)؛
- برای هر مدل قهرمان، حداقل یک بررسی در ۷ روز اخیر (زنده بودن کار Worker)؛
- آستانه‌های کد = آستانه‌های Policy؛
- هر action ≥ alert رکورد AuditLog دارد.

### audit-learning-loop.sh
- فایل شاهد چرخهٔ کامل موجود و معتبر؛
- پیش‌بینی‌های تازه مهر نسخه دارند؛
- هیچ رکورد prediction با modelVersionId اشاره به نسخهٔ ناموجود؛
- loop-latest.json تازه (< ۲۴ ساعت — دیمن زنده).

## ۱۸. طرح استقرار

1. db push (افزایشی) → تست سرویس‌ها → تست مرز API → گاردها → CI کامل ×۲ → ری‌استارت تمیز → ثبت کار Worker → بستهٔ بقا ۱۹ → قانون فایل v3.

## ۱۹. طرح شواهد (download/pn018/)

| فایل | محتوا |
|---|---|
| champion-challenger.json | چرخهٔ عمر: ساخت چالشگر → سایه → ارتقا با تأیید → AuditLog |
| drift.json | سه آشکارساز روی دادهٔ واقعی + ردیف‌های DriftCheck |
| full-loop.json | هفت‌گام حلقهٔ کامل با اعداد واقعی |
| design-doc.md | همین سند (نسخهٔ شاهد) |
| guards.json / tests.json | خروجی گاردها و دو-سبز |

## ۲۰. ریسک‌ها و کاهش‌ها

| ریسک | احتمال | اثر | کاهش |
|---|---|---|---|
| چالشگر شانسی بهتر شود (overfit پنجرهٔ کوچک) | متوسط | ارتقای بی‌ارزش | قید ≥۵۰ نمونه + ≥۷ روز + Δ≥0.02 (§۲.۴) |
| قفل شدن قهرمان بد (champion در حالت خراب) | کم | کیفیت پیش‌بینی | rollback یک‌فراخوانی + AuditLog |
| جدول‌های تازه سنگین شوند | کم | دیسک | DriftCheck append-only با هرس فصلی (فاز ۱۰) |
| هم‌زمانی promote با دیمن | کم | ناسازگاری گذرا | ارزیابی از رکورد DB می‌خواند (هر سایه از آخرین وضعیت) |
| شکست db push روی production | کم | توقف | بکاپ VACUUM پیش از مهاجرت (الگوی PN-016) |

## ۲۱. بدیل‌های بررسی‌شده و ردشده

1. **نسخه‌بندی فایل‌محور (ادامهٔ retrain-state.json):** رد — بدون تراکنش، بدون کوئری، بدون AuditLog.
2. **نگهداری چالشگر فقط در حافظهٔ دیمن:** رد — گم شدن در ری‌استارت (عین شکاف فعلی).
3. **ارتقای خودکار بدون شورا:** رد — قید مطلق سند ۰۲۷ §۲.۴.
4. **جدول تک‌وضعیت (فقط champion فعلی):** رد — rollback و تاریخچه ناممکن.
5. **ML Ops سنگین (MLflow و امثال آن):** رد — قید معماری «صفر وابستگی بیرونی» پروژه.

## ۲۲. پیوست الف — ماشین حالت (نمادین)

```
NO_VERSION ──ensureChallenger──▶ CHALLENGER ──shadowTick──▶ CHALLENGER(updated)
CHALLENGER ──promote[council✓,criteria✓]──▶ CHAMPION
CHALLENGER ──reject──▶ REJECTED (terminal)
CHALLENGER ──retire(manual)──▶ RETIRED
CHAMPION ──promote(other)──▶ RETIRED
RETIRED ──rollback[council✓]──▶ CHAMPION
```

## ۲۳. پیوست ب — نمودار توالی حلقهٔ کامل

```
دیمن/اسکریپت        سرویس نسخه        موتورها           DB
    │                  │                 │               │
    │─collectPairs────▶│                 │               │
    │                  │◀─load jsonl─────│               │
    │─evaluate────────▶│──computeBrier──▶│               │
    │◀─championBrier───│◀────────────────│               │
    │─learn───────────▶│──learn()───────▶│               │
    │◀─weights─────────│◀────────────────│               │
    │─ensureChallenger▶│──────────────────────────create─▶│ (v n+1)
    │─shadowTick──────▶│──recompute────▶│               │
    │                  │──evaluate()────▶│               │
    │◀─verdict─────────│◀────────────────│               │
    │─promote[council]▶│───────────────tx:swap───────────▶│ + AuditLog
    │─newPredictions──▶│ (مهر modelVersionId روی رکوردهای تازه)
```

## ۲۴. پیوست ج — پارامترها و پیش‌فرض‌ها

| پارامتر | پیش‌فرض | منبع |
|---|---|---|
| MELK_SHADOW_MIN_SAMPLES | 50 | سند ۰۲۷ §۲.۴ |
| MELK_SHADOW_MIN_WINDOW_DAYS | 7 | سند ۰۲۷ §۲.۴ |
| MELK_SHADOW_MIN_DELTA | 0.02 | سند ۰۲۷ §۲.۴ |
| MELK_DRIFT_ALERT | 0.02 | DriftDetector موجود |
| MELK_DRIFT_RETRAIN | 0.05 | DriftDetector موجود |
| MELK_DRIFT_ESCALATE | 0.10 | DriftDetector موجود |
| MELK_DRIFT_INTERVAL_H | 6 | دستور شورا ۰۲۲ |
| پنجرهٔ خط پایه/اخیر | 70%/30% | این سند §۸.۱ |

---
پایان سند طراحی — نسخهٔ ۱٫۰ · تأیید: اجرای PN-018 (ملکا-شورا-ن۰۲۲-۱۴۰۵)
