# سند طراحی فاز ۹ — حاکمیت خودتنظیم و ارزیابی سیاست

## ملکا · شماره سند: PN-019-DES9-1405 · نسخه ۱٫۰ · تاریخ: ۱۴۰۵/۰۷/۲۰

> «حاکمیت بدون ارزیابی، استبداد است. ارزیابی بدون حاکمیت، هرج‌ومرج است.»
> سیستم قوانین خودش را ارزیابی می‌کند و قوانین ضعیف را بازنشسته می‌کند.

---

## فهرست

1. [خلاصهٔ اجرایی](#۱-خلاصهٔ-اجرایی)
2. [تحلیل وضع موجود](#۲-تحلیل-وضع-موجود)
3. [اهداف و غیراهداف](#۳-اهداف-و-غیراهداف)
4. [معماری کلی — حاکمیت سه‌پایه](#۴-معماری-کلی--حاکمیت-سهپایه)
5. [مدل داده — دو جدول تازه](#۵-مدل-داده--دو-جدول-تازه)
6. [پانزده قاعدهٔ حاکمیت](#۶-پانزده-قاعدهٔ-حاکمیت)
7. [زمینهٔ حاکمیت زنده (Live Governance Context)](#۷-زمینهٔ-حاکمیت-زنده-live-governance-context)
8. [سازوکار enforce سه‌حالته](#۸-سازوکار-enforce-سهحالته)
9. [ارزیابی سیاست — چهار متریک](#۹-ارزیابی-سیاست--چهار-متریک)
10. [سه حکم: keep/adjust/retire](#۱۰-سه-حکم-keepadjustretire)
11. [پنج سیاست فعال برای نخستین ارزیابی](#۱۱-پنج-سیاست-فعال-برای-نخستین-ارزیابی)
12. [اجرای خودکار هر ۹۰ روز](#۱۲-اجرای-خودکار-هر-۹۰-روز)
13. [لایهٔ سرویس](#۱۳-لایهٔ-سرویس)
14. [طراحی API](#۱۴-طراحی-api)
15. [یکپارچگی Worker](#۱۵-یکپارچگی-worker)
16. [قواعد Tier-aware حاکمیت](#۱۶-قواعد-tier-aware-حاکمیت)
17. [ملاحظات امنیتی](#۱۷-ملاحظات-امنیتی)
18. [طرح تست](#۱۸-طرح-تست)
19. [طرح گاردها](#۱۹-طرح-گاردها)
20. [طرح شواهد](#۲۰-طرح-شواهد)
21. [ریسک‌ها و کاهش‌ها](#۲۱-ریسک‌ها-و-کاهشها)
22. [بدیل‌های بررسی‌شده و ردشده](#۲۲-بدیلهای-بررسیشده-و-ردشده)
23. [پیوست الف — نقشهٔ قاعده↔شاهد](#پیوست-الف--نقشهٔ-قاعدهشاهد)
24. [پیوست ب — پارامترها](#پیوست-ب--پارامترها)

---

## ۱. خلاصهٔ اجرایی

فاز ۹ دو چیز به ملکا می‌دهد که تا امروز به‌صورت پراکنده وجود داشت:

1. **حاکمیت پندرگانه (۱۵ قاعده):** قواعد از قبل در `p9-core.ts` تعریف
   شده‌اند (GOV-DATA-001…GOV-REPAIR-001) اما **زمینهٔ آن‌ها دستی و
   ساختگی** بود (`emptyGovernanceContext()` همه‌چیز صفر). فاز ۹ «زمینهٔ
   حاکمیت زنده» می‌سازد: هر قاعده از وضعیت واقعی DB پر می‌شود —
   نشست‌های ۳۰روزه، ورودهای ثبت‌نشده، نقض autoExecute، تغییر مدل بدون
   شورا — و نتیجهٔ هر بررسی در جدول `GovernanceCheckRecord` ثبت و
   تاریخچه می‌شود.
2. **ارزیابی سیاست:** پنج سیاست فعال سیستم (دو سیاست یادگیری از فاز ۷ +
   سه سیاست ایمنی/حاکمیت از فاز ۸) هر ۹۰ روز به‌صورت خودکار با چهار
   متریک (اثربخشی · پایداری · پایبندی · هزینه) ارزیابی و حکم
   keep/adjust/retire می‌گیرند — با شواهد عددی قابل بازتولید.

### چرا حالا؟

چون فاز ۸ (که هم‌زمان در همین PN-019 اجرا می‌شود) خط پایای تصمیم را
ساخت. حاکمیت بدون خط پایا بازبینی انتزاعی است: نمی‌توان «هر تصمیم ۹۰ روز
حفظ شود» را روی دادهٔ تصمیمِ ناموجود اعمال کرد. ترتیب درون PN-019:
اول فاز ۸ (پایاوری تصمیم)، سپس فاز ۹ (حاکمیت روی همان پایه).

---

## ۲. تحلیل وضع موجود

### ۲.۱ دارایی‌ها

| دارایی | محل | وضعیت |
|---|---|---|
| GovernanceEngineImpl (۱۵ قاعده) | `p9-core.ts` | کامل اما زمینهٔ دستی |
| PolicyEvaluationEngineImpl (۴ متریک + حکم) | همان | کامل اما سیگنال دستی |
| AuditLog | DB | فعال — منبع اصلی شواهد |
| UserSession/UserActivity | DB | فاز ۶ — منبع قواعد دسترسی |
| ModelVersion + DriftCheck | DB | فاز ۷ — منبع قواعد مدل |
| DecisionRecord/ActionPlan/SafetyCheck | DB | فاز ۸ (همین PN-019) — منبع قواعد تصمیم |

### ۲.۲ شکاف‌ها

1. **G-GOV-01:** `emptyGovernanceContext()` صفر برمی‌گرداند — بررسی
   واقعی ممکن نیست؛ همیشه سبز کاذب.
2. **G-GOV-02:** نتیجهٔ `checkAll` جایی ثبت نمی‌شود — ادعای «حاکمیت
   برقرار است» بدون شاهد است.
3. **G-GOV-03:** `enforce` مسدودسازی واقعی انجام نمی‌دهد — خروجی
   سرداده می‌شود اما هیچ مسیر تولیدی آن را نمی‌خواند.
4. **G-PE-01:** هیچ PolicyEvaluation واقعی ثبت نشده — `PolicySignal`
   ساختگی تست‌ها.
5. **G-PE-02:** اجرای دوره‌ای وجود ندارد — کار Worker چنین ساعتی ندارد.
6. **G-PE-03:** حکم retire/adjust بدون ردیابی اجرا — تصمیم حکم رها می‌شود.

---

## ۳. اهداف و غیراهداف

### ۳.۱ اهداف

1. OG-9-1: `buildLiveGovernanceContext()` — پر کردن ۱۷ فیلد زمینه از
   DB واقعی (بدون هیچ فرض صفر).
2. OG-9-2: ثبت هر بررسی حاکمیت (۱۵ قاعده × نتیجه) در
   `GovernanceCheckRecord` + AuditLog.
3. OG-9-3: enforce سه‌حالته (strict/audit-only/…) در نقطهٔ قلاب واقعی:
   مسیرهای ساخت تصمیم/تغییر مدل، پیش از نوشتن، حاکمیت را صدا می‌زنند؛
   نقض critical → بلاک.
4. OG-9-4: پنج سیاست فعال با سیگنال واقعی ارزیابی و ثبت شوند
   (`PolicyEvaluationRecord`).
5. OG-9-5: کار Worker `policy-eval` هر ۹۰ روز + قابلیت اجرای دستی OWNER.
6. OG-9-6: دو روت OWNER-only + آینهٔ v1 (مانیفست ۸۹→۹۱).
7. OG-9-7: دو گارد تازه: `audit-governance.sh` ·
   `audit-policy-evaluation.sh`.
8. OG-9-8: ≥۲۰ تست تازه شامل سلبی.

### ۳.۲ غیراهداف

1. تغییر خودکار سیاست بر اساس حکم — حکم فقط «توصیه» است؛ اعمال آن
   نیازمند تأیید شوراست (قید مطلق).
2. حذف/تغییر ۱۵ قاعده — متن قواعد عین سند ۰۲۷ حفظ می‌شود.
3. UI تازه — API + شاهد کافی است.

---

## ۴. معماری کلی — حاکمیت سه‌پایه

```
┌────────────────────────────────────────────────────────────┐
│ پایهٔ ۱ — قواعد (موجود، ثابت)                                │
│   GOVERNANCE_RULES: ۵ داده + ۳ مدل + ۴ دسترسی + ۲ تصمیم + ۱  │
│                     ترمیم — متن عین سند ۰۲۷ §۴.۳.۲          │
├────────────────────────────────────────────────────────────┤
│ پایهٔ ۲ — زمینهٔ زنده (تازه)                                  │
│   buildLiveGovernanceContext(): ۱۷ فیلد از DB واقعی          │
│   نشست‌ها · ورودها · توکن‌ها · مدل‌ها · تصمیم‌ها · ترمیم‌ها    │
├────────────────────────────────────────────────────────────┤
│ پایهٔ ۳ — ثبت و اعمال (تازه)                                 │
│   GovernanceCheckRecord (تاریخچه) · PolicyEvaluationRecord   │
│   enforce در نقطهٔ قلاب مسیرهای حساس                        │
└────────────────────────────────────────────────────────────┘
```

---

## ۵. مدل داده — دو جدول تازه

### ۵.۱ GovernanceCheckRecord

هر اجرای کامل ۱۵قاعده‌ای یک ردیف: `checkId` + `passed/failed/critical`
شمارشی + `resultsJson` (آرایهٔ ۱۵تایی ruleId/passed/details/severity) +
`enforcement` حالت + `triggerSource` (worker|manual|api).

### ۵.۲ PolicyEvaluationRecord

هر سیاست در هر چرخه: `policyId` + `policyType` + `windowFrom/To` +
`metricsJson` (۴ متریک) + `verdict` (keep/adjust/retire) + `rationale` +
`evidenceJson` (شمارش رویدادها) + `tierAtEvaluation`.

### ۵.۳ قواعد

- append-only برای هر دو؛ به‌روزرسانی ممنوع (سابقهٔ حاکمیت تغییرناپذیر است).
- Index: `PolicyEvaluationRecord(policyId, evaluatedAt)`.

---

## ۶. پانزده قاعدهٔ حاکمیت

متن و شناسه‌ها عین GOVERNANCE_RULES موجود (سند ۰۲۷):

**داده (۵):**
- GOV-DATA-001: صفر دسترسی به دادهٔ شخصی بدون AuditLog (critical)
- GOV-DATA-002: صفر حذف بدون شاهد بکاپ (critical)
- GOV-DATA-003: صفر تغییر در لایهٔ Raw (critical)
- GOV-DATA-004: هر بازیابی از بکاپ، ثبت (high)
- GOV-DATA-005: ConsultantScope fail-closed (critical)

**مدل (۳):**
- GOV-MODEL-001: صفر تغییر مدل بدون تأیید شورا (critical)
- GOV-MODEL-002: هر تغییر مدل، قابل rollback (high)
- GOV-MODEL-003: هر مدل، حداقل ۲ نسخه حفظ (medium)

**دسترسی (۴):**
- GOV-ACCESS-001: هر نشست ۳۰ روز اعتبار (high)
- GOV-ACCESS-002: هر ورود، ثبت در AuditLog (high)
- GOV-ACCESS-003: صفر bypass روی OWNER-gate (critical)
- GOV-ACCESS-004: صفر اشتراک توکن (critical)

**تصمیم (۲):**
- GOV-DECISION-001: صفر auto_execute (critical)
- GOV-DECISION-002: هر تصمیم ۹۰ روز حفظ (medium)

**ترمیم (۱):**
- GOV-REPAIR-001: صفر ترمیم بدون تأیید شورا (critical)

---

## ۷. زمینهٔ حاکمیت زنده (Live Governance Context)

نگاشت ۱۷ فیلد زمینه به کوئری‌های واقعی:

| فیلد | منبع |
|---|---|
| personalDataAccessWithoutAudit | دسترسی‌های UserActivity بدون ردیف AuditLog متناظر (تقریب محافظه‌کارانه: تطبیق زمانی-کاربری) |
| deletionsWithoutBackupWitness | شمارش Actionهای حذف در AuditLog بدون رکورد backup تازه (backup-rotation هر ۶ ساعت) |
| rawLayerMutations | diff شمارش ردیف جداول خام بین دو چرخهٔ همگام‌سازی (از SyncState) |
| backupRestoresLogged/Total | ردیف‌های بازیابی recovery-log vs ثبت AuditLog |
| consultantScopeFailOpen | تست زندهٔ resolveAllowedTiles برای کاربر CONSULTANT بدون PersonnelAccess (نباید کاشی بدهد) |
| modelChangesWithoutCouncil | ModelVersion با promotedAt پر و councilApproved=0 |
| modelChangesWithoutRollback | ارتقاهای بدون نسخهٔ retired سالم (زنجیرهٔ بازگشت) |
| modelVersionsKept | MIN نسخه‌های نگه‌داشته per modelId |
| sessionsOlderThan30d | UserSession با createdAt < now-30d و expiresAt آینده |
| loginsNotAudited | ورودهای UserActivity LOGIN بدون AuditLog |
| ownerGateBypasses | فراخوانی‌های روت OWNER با نقش غیر OWNER که ۲۰۰ گرفته‌اند (از AuditLog deny/allow) |
| tokenSharingIncidents | یک tokenHash در بیش از یک UserSession فعال همزمان |
| autoExecuteViolations | DecisionRecord/ActionPlan با autoExecute=1 |
| decisionsKept90d / decisionsTotal | DecisionRecord عمر ≥۹۰ روز / کل |
| repairsWithoutCouncilApproval | AuditLog با action DATA_REPAIR و بدون approvalSource |

هر فیلد با یک کوئری شمارشی پر می‌شود — هیچ مقداری از پیش‌فرض نمی‌آید؛
نبود داده = صفرِ مستند (تفاوت ظریف اما حیاتی با صفرِ فرضی).

### ۷.۱ سه الگوی ساده‌سازی صادقانه (Honest Approximations)

سه فیلد نیازمند تقریب‌اند؛ تقریب‌ها اینجا کامل مستند می‌شوند تا ممیزی
آینده بداند مرز چیست:

1. **personalDataAccessWithoutAudit:** تطبیق دقیق رویدادبه‌رویداد بین
   UserActivity و AuditLog به‌دلیل عدم وجود کلید مشترک ناممکن است؛
   تقریب: هر ردیف UserActivity از نوع خواندن دادهٔ شخصی که در ±۵ ثانیه
   هیچ AuditLog با همان actor ندارد → نقض بالقوه. این تقریب
   «فرا-شماری» است (ممکن است موارد موجه را هم بشمارد) — جهت خطا به
   سمت محافظه‌کاری است، چون در حاکمیت داده، هشدار کاذب ارزان‌تر از
   غفلت است.
2. **rawLayerMutations:** شمارش ردیف جداول خام بین دو چرخه-sync از
   SyncState خوانده می‌شود؛ چون upsert بر مبنای کلید طبیعی است، رشد
   طبیعی است و فقط «کاهش» ردیف نشانهٔ جهش لایهٔ خام است — فیلد فقط
   کاهش را می‌شمارد (دکترین: لایهٔ خام فقط رشد می‌کند).
3. **backupRestoresTotal:** بازیابی‌های خودکار recovery در recovery-log
   ثبت شده‌اند؛ فیلد از تعداد ورودی‌های «RECOVERY_COMPLETED» ۹۰ روز
   اخیر می‌آید و تطبیق با AuditLog RECOVER انجام می‌شود.

### ۷.۲ بودجهٔ عملیاتی زمینهٔ زنده

۱۷ کوئری شمارشی، همگی ایندکس‌دار، به‌صورت موازی (Promise.all) اجرا
می‌شوند؛ بودجه: ≤۵ ثانیه در DB فعلی (۲۸۵MB). اگر آینده DB ملی‌مقیقه
شد، همین لایه بدون تغییر قرارداد به worker پیش‌محاسبه مهاجرت می‌کند
(کوئری‌ها در سرویس واحدند — نقطهٔ مهاجرت واحد).

---

## ۸. سازوکار enforce سه‌حالته

```
checkAll(ctx) → report
   ├─ enforcement="strict" (پیش‌فرض): criticalViolation → blocked=true
   ├─ "audit-only": فقط ثبت
   └─ "disabled": فقط ثبت + هشدار قرمز
```

نقطهٔ قلاب واقعی (غیر انتزاعی): تابع `governanceGate(action)` در
سرویس، پیش از هر نوشتن حساس (ساخت/ارتقای مدل · ترمیم داده) صدا زده
می‌شود و در حالت strict با نقض critical، MelkApiError 503
`GOVERNANCE_BLOCKED` می‌دهد. مسیرهای صرفاً خواندنی (لیست/آمار) گیت
نمی‌خواهند — حاکمیت نباید خواندن شفاف را ببندد.

---

## ۹. ارزیابی سیاست — چهار متریک

عین PolicyEvaluationEngineImpl موجود:

1. **اثربخشی (effectiveness):** سهم رویداد مثبت منهای منفی بر کل —
   منبع رویداد: AuditLog (کنش موفق vs کنش ناموفق/بلاک‌شده).
2. **پایداری (stability):** ۱ − انحراف معیار نرمال‌شدهٔ اثربخشی در
   پنجره — از نقاط زمانی هفتگی در ۹۰ روز.
3. **پایبندی (compliance):** سهم بازرسی‌های سازگار — منبع: ردیف‌های
   GovernanceCheckRecord در پنجره.
4. **هزینه (costImpact):** ساعت صرف‌شده — تقریب شمارشی از رویدادهای
   نگهداری (sync/guard) در پنجره.

---

## ۱۰. سه حکم: keep/adjust/retire

قواعد حکم عین سند ۰۲۷ §۴.۳.۱:

- effectiveness ≥ ۰٫۷ ∧ compliance ≥ ۰٫۹ → **keep**
- effectiveness < ۰٫۳ → **retire**
- وگرنه → **adjust** (با recommendedChanges)

قید مطلق: حکم فقط توصیه است؛ اعمال هر تغییر سیاست نیازمند تأیید شورا
(approvalSource) — هیچ مسیر خودکاری حکم را اجرا نمی‌کند.

### ۱۰.۱ نمونهٔ محاسباتی ورک‌شاپ (صحت‌سنجی پیش از پیاده‌سازی)

برای اطمینان از این‌که ریاضیات ارزیابی با دادهٔ واقعی پروژه سازگار است،
سه سناریوی ورک‌شاپ روی اعداد واقعی فازهای ۶-۸ پیش‌محاسبه شد:

**سناریو A — سیاست champion-gate-v1 (انتظار: keep):**
در ۹۰ روز اخیر، دروازهٔ قهرمان یک ارتقای تأییدشده (PN-018: رد ارتقا با
پیش‌شرط پنجره < ۷ روز — رفتار صحیح دروازه)، یک ساخت چالشگر، صفر ارتقای
بی‌شورا. رویدادها: ۳ رویداد، همگی «مثبت» (دروازه درست کار کرد):
effectiveness = (۳−۰)/۳ = ۱٫۰۰ · compliance = ۱ (همهٔ بازرسی‌های گارد
champion سبز) → حکم **keep** با پنجرهٔ دادهٔ ناکافی → rationale ذکر
می‌کند «نمونهٔ کم — حکم تا چرخهٔ بعد تمدید مشروط».

**سناریو B — سیاست session-30d-v1 (انتظار: keep با پایش):**
نشست‌های فعال همه جوان‌تر از ۳۰ روز؛ صفر نقض. effectiveness = ۱ ·
compliance = ۱ → keep.

**سناریو C — سیاست فرضی با سه رویداد منفی:**
اگر ۷ رویداد مثبت و ۳ منفی: effectiveness = (۷−۳)/۱۰ = ۰٫۴ →
adjust؛ اگر compliance < ۰٫۷ هم بود، recommendedChanges شامل
«افزایش نظارت» می‌شود.

این ورک‌شاپ نشان می‌دهد قواعد آستانه با واقعیت پروژه هم‌خوان‌اند و
هیچ سیاست فعلی نباید در نخستین چرخه retire شود (مگر نقض واقعی رخ دهد).

### ۱۰.۲ رفتار دادهٔ کم (insufficient data)

پنجرهٔ با < MELK_POLICY_MIN_EVENTS رویداد: حکم keep صادر می‌شود اما
rationale صریحاً «دادهٔ ناکافی — تمدید مشروط تا چرخهٔ بعد» را ذکر
می‌کند و `insufficientData: true` در evidenceJson ثبت می‌شود. این
محافظه‌کاری است: بازنشستن سیاست بر پایهٔ سکوت داده، خطای نوع دوم
حاکمیت است (قتل بی‌گناه سیاست).

---

## ۱۱. پنج سیاست فعال برای نخستین ارزیابی

| # | policyId | نوع | شرح | منبع سیگنال |
|---|---|---|---|---|
| ۱ | champion-gate-v1 | learning | دروازهٔ ارتقای قهرمان (۵ پیش‌شرط) | ارتقاها/ردّها/نقض‌های ModelVersion |
| ۲ | drift-alert-v1 | learning | آستانه‌های رانش سه‌گانه | DriftCheckها در ۹۰ روز |
| ۳ | decision-safety-v1 | safety | هفت قاعدهٔ SAF روی تصمیم‌ها | SafetyCheckRecordها |
| ۴ | governance-strict-v1 | governance | اعمال strict حاکمیت | GovernanceCheckRecordها |
| ۵ | session-30d-v1 | access | چرخهٔ عمر نشست ۳۰روزه | UserSession/UserActivity |

هر پنج سیاست در نخستین اجرای فاز ۹ با پنجرهٔ ۹۰روزهٔ اخیر ارزیابی و
ثبت می‌شوند — شاهد: `download/pn019/policy-eval.json`.

---

## ۱۲. اجرای خودکار هر ۹۰ روز

کار Worker دوازدهم `policy-eval`:

- فاصله: `MELK_POLICY_EVAL_INTERVAL_DAYS` پیش‌فرض ۹۰ روز.
- اولین اجرا: تأخیر ۵ دقیقه پس از بوت (برای نخستین ثبت فوری).
- جریان: برای هر پنج سیاست، سیگنال از AuditLog/جداول → ارزیابی →
  ثبت → اگر حکم ≠ keep → AuditLog هشدار `POLICY_VERDICT_ALERT`.
- شکست = لاگ، نه کرش (الگوی سایر گاردها).
- اجرای دستی OWNER: POST /api/admin/policy-evaluations/run.

---

## ۱۳. لایهٔ سرویس

`src/lib/services/governance-service.ts`:

- `buildLiveGovernanceContext()` — §۷.
- `runGovernanceCheck(triggerSource)` — checkAll + ثبت + AuditLog.
- `governanceGate(action)` — قلاب enforce §۸.
- `runPolicyEvaluation(policyId?, windowDays)` — ساخت سیگنال واقعی +
  ارزیابی + ثبت.
- `listGovernanceChecks/listPolicyEvaluations`.

---

## ۱۴. طراحی API

| روت | متد | نقش | شرح |
|---|---|---|---|
| /api/admin/governance | GET | OWNER | آخرین بررسی ۱۵قاعده‌ای + تاریخچه |
| /api/admin/governance/run | POST | OWNER | اجرای دستی بررسی |
| /api/admin/policy-evaluations | GET | OWNER | فهرست ارزیابی‌ها |
| /api/admin/policy-evaluations/run | POST | OWNER | اجرای دستی چرخهٔ ارزیابی |

آینهٔ v1 هر چهار — مانیفست ۸۹→۹۳ (با چهار روت فاز ۸ → مجموع نهایی ۹۳).

خطاها: `GOVERNANCE_BLOCKED` (۵۰۳) هنگام نقض critical در مسیر حساس.

---

## ۱۵. یکپارچگی Worker

کار دوازدهم: `policy-eval` — هر ۹۰ روز (کار یازدهم فاز ۸: decision-shadow
هر ۶ ساعت). Worker پس از PN-019: **۱۲ کار**.

### ۱۵.۱ نقشهٔ قلاب‌های enforce (نقاط واقعی فراخوانی گیت)

گیت حاکمیت (`governanceGate`) درست عمل می‌کند فقط اگر در نقاط درست
قلاب شود. نقشهٔ کامل نقاط قلاب در این PN-019:

| نقطهٔ قلاب | فایل | کنش پیش از نوشتن | در صورت critical |
|---|---|---|---|
| ارتقای مدل | model-versioning-service.promoteModelVersion | governanceGate("MODEL_PROMOTE") | ۵۰۳ قبل از تراکنش |
| بازگشت مدل | model-versioning-service.rollbackChampion | governanceGate("MODEL_ROLLBACK") | ۵۰۳ |
| ترمیم دادهٔ معیوب | scripts ترمیم (الگوی int-overflow) | governanceGate("DATA_REPAIR") — ثبت دستی مکمل | ترمیم توقف |
| ساخت تصمیم سایه | decision-service.createDecisionFromPrediction | governanceGate("DECISION_CREATE") | ۵۰۳ |
| انقضای تصمیم | decision-service.expireSweep | بدون گیت (وضعیت‌گذاری صرف) | — |

اصل طراحی: گیت فقط روی **نوشتن حساس**؛ خواندن همیشه آزاد؛ وضعیت‌گذاری
درونی (انقضا) بدون گیت تا چرخهٔ کار نکشد. عمداً هیچ middleware سراسری
نیست (رد بدیل ۲ §۲۲).

### ۱۵.۲ رفتار خطای گیت

خطای گیت (خود AuditLog هم شکست بخورد): fail-closed — کنش نوشتن رد
می‌شود و خطا با کد `GOVERNANCE_EVIDENCE_FAILURE` ثبت log می‌شود. هیچ
سناریویی وجود ندارد که در آن نقض critical بی‌شاهد عبور کند: اگر شاهد
نشدنی باشد، خودِ نشدنِ شاهد، مانع است.

---

## ۱۶. قواعد Tier-aware حاکمیت

- Tier 0-1: حاکمیت audit-only (سیستم جوان — ثبت بدون بلاک).
- Tier 2: strict برای داده/دسترسی؛ audit-only برای مدل.
- Tier 3+: strict کامل — پیش‌فرض تولید.
- مهر `tierAtEvaluation` روی هر ارزیابی.

---

## ۱۷. ملاحظات امنیتی

1. روت‌ها OWNER-only (الگوی مستقر).
2. `governanceGate` هرگز نقض critical را در strict نمی‌گذرد — تست سلبی.
3. AuditLog برای هر بررسی/ارزیابی/حکم.
4. هیچ سیگنالی دادهٔ شخصی خام در JSON ثبت نمی‌کند — فقط شمارش.

---

## ۱۸. طرح تست

≥۲۰ تست در `tests/pn019-phase9.test.ts`:

**ایجابی (۱۳):** زمینهٔ زنده ۱۷ فیلد عدد واقعی · بررسی کامل ۱۵ قاعده ثبت
· checkRecord شمارش درست · ارزیابی ۵ سیاست با ۴ متریک · حکم‌ها بر اساس
آستانه · رکورد policy ثبت · worker کار دوازدهم در رجیستری · API ۲۰۰ ·
آینهٔ v1 · history دو اجرا · AuditLog ساخته · tier مهر شده · پنجرهٔ ۹۰روزه.

**سلبی (۷):** نشست ۳۱روزه → GOV-ACCESS-001 fail · autoExecute=1 →
GOV-DECISION-001 fail · مدل بدون شورا → GOV-MODEL-001 fail · strict با
critical → governanceGate ۵۰۳ · بدون OWNER → ۴۰۳ · effectiveness ۰٫۲ →
retire · حکم اجرا خودکار ندارد (هیچ تغییر سیاست پس از ارزیابی).

---

## ۱۹. طرح گاردها

### audit-governance.sh

1. آخرین GovernanceCheckRecord دارای ۱۵ نتیجه.
2. هیچ critical نقض‌شده در آخرین بررسی بدون AuditLog هشدار.
3. GOV-DECISION-001: صفر autoExecute در DB (پیوند با گارد فاز ۸).
4. جستجوی کد: `emptyGovernanceContext` در کد تولیدی استفاده نشده.
5. هر بررسی اخیر با triggerSource معتبر.

### audit-policy-evaluation.sh

1. هر ۵ سیاست فعال در ۹۰ روز اخیر ارزیابی ثبت دارد.
2. متریک‌ها در بازهٔ مجاز (۰..۱) و ۴ کلید.
3. حکم فقط از مجموعهٔ مجاز.
4. هیچ سیاستی دو ارزیابی هم‌پنجرهٔ تکراری.
5. Worker کار policy-eval در رجیستری هست (۹۰ روز).

---

## ۲۰. طرح شواهد

`download/pn019/governance.json`: آخرین بررسی کامل (۱۵ قاعده × نتیجه +
زمینهٔ ۱۷فیلدی) · `download/pn019/policy-eval.json`: پنج ارزیابی کامل.

---

## ۲۱. ریسک‌ها و کاهش‌ها

| ریسک | احتمال | کاهش |
|---|---|---|
| کوئری سنگین زمینهٔ زنده | کم | کوئری‌های شمارشی ایندکس‌دار؛ سقف ۵ ثانیه با Promise.all |
| بلاک اشتباه مسیر تولید (false positive) | متوسط | گیت فقط روی نوشتن حساس؛ audit-only در Tier<3 |
| حکم‌های نوسانی چون دادهٔ کم | بالا | حداقل رویداد برای حکم (w<10 → insufficient_data در rationale، حکم keep) |

---

## ۲۲. بدیل‌های بررسی‌شده و ردشده

1. **زمینهٔ دستی (وضع موجود)** — رد: سبز کاذب؛ حاکمیت نمایشی.
2. **حاکمیت به‌عنوان middleware همهٔ روت‌ها** — رد: هزینهٔ هر درخواست؛
   قلاب نقطه‌ای روی نوشتن حساس کافی و دقیق‌تر است.
3. **اعمال خودکار حکم retire** — رد مطلق: شورا مالک تغییر سیاست است.
4. **جدول جدا per قاعده** — رد: ۱۵ جدول برای ۱۵ عدد — over-engineering؛
   resultsJson با شمارش ثابت کفایت می‌کند.

---

## پیوست الف — نقشهٔ قاعده↔شاهد

| قاعده | شاهد زنده | نقض نمونه |
|---|---|---|
| GOV-DATA-001 | UserActivity vs AuditLog | خواندن بدون ثبت |
| GOV-DATA-002 | AuditLog DELETE vs بکاپ | حذف بی‌شاهد |
| GOV-DATA-003 | SyncState شمارش خام | تغییر شمارش منفی |
| GOV-DATA-004 | recovery-log vs AuditLog | بازیابی خاموش |
| GOV-DATA-005 | تست زندهٔ CONSULTANT | کاشی بدون رکورد |
| GOV-MODEL-001/2/3 | ModelVersion | ارتقای بی‌شورا |
| GOV-ACCESS-001..4 | Session/Activity/Audit | نشست کهنه |
| GOV-DECISION-001/2 | DecisionRecord | اجرای خودکار |
| GOV-REPAIR-001 | AuditLog DATA_REPAIR | ترمیم بی‌تأیید |

## پیوست ب — پارامترها

| پارامتر | پیش‌فرض | env |
|---|---|---|
| چرخهٔ ارزیابی سیاست | ۹۰ روز | MELK_POLICY_EVAL_INTERVAL_DAYS |
| پنجرهٔ ارزیابی | ۹۰ روز | MELK_POLICY_EVAL_WINDOW_DAYS |
| حداقل رویداد برای حکم | ۱۰ | MELK_POLICY_MIN_EVENTS |
| TTL نشست | ۳۰ روز | موجود فاز ۶ |

---

*پایان سند طراحی فاز ۹ — PN-019-DES9-1405 · نسخه ۱٫۰*
