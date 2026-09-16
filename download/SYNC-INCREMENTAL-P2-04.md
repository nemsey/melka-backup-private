# SYNC-INCREMENTAL-P2-04 — همگام‌سازی افزایشی CRM

> سند اجرایی PHASE 2 / گام P2-04 — طبق بند E.6 دستور راهبری (مبنای طراحی PHASE 3)

## ۱) چی تغییر کرد و چی تغییر نکرد

| مورد | وضعیت |
|---|---|
| رفتار پیش‌فرض تولید | **بدون تغییر** — `MELK_SYNC_MODE` نامشخص ⇒ `legacy` (deleteMany+createMany اتمیک، عین PHASE 1) |
| مسیر جدید | `MELK_SYNC_MODE=incremental` ⇒ upsert بر کلید طبیعی + نقطه ازسرگیری + نامه مرده |
| اسکیما | **فقط افزودنی**: ستون‌های `SyncState.lastSyncCursor/lastWatermark/syncRunId` + جدول جدید `SyncDeadLetter` — بدون تغییر هیچ ستون موجود |
| تغییر پیش‌فرض | **PHASE 4** — پس از اعتبارسنجی میدانی؛ در PHASE 2 صفر رفتار تولیدی تغییر نکرد |
| قرارداد API | `SyncResult` دست‌نخورده — هیچ فیلدی اضافه/حذف نشد (پاسخ `/api/sync` بایت‌به‌بایت همان) |

## ۲) کلیدهای طبیعی هر خانواده

| خانواده | کلید طبیعی | یادداشت |
|---|---|---|
| transactions | `id` (کلید ترکیبی سامانه ARM از propertyCode/requestCode) | `TransactionRepository.upsertBatch` (P2-01) |
| experts | **`personnelCode`** | یکتای اسکیما؛ اگر id سامانه عوض شود، id محلی حفظ می‌شود (به‌روزرسانی درجا) |
| interactions | `id` | `upsertInteractionsBatch` |
| visits | `id` | `upsertBatch` |
| supplyDemand | `id` | `upsertSupplyDemandBatch` |
| contracts | `id` (مشتق از contractHolo در سامانه ARM) | `upsertBatch` |

## ۳) چرخه اجرای افزایشی (`applyIncrementalSync`)

```
runId = UUID → SyncState.syncRunId ثبت
برای هر خانواده (ترتیب ثابت: tx → experts → interactions → visits → supplyDemand → contracts):
  اگر واکشی خانواده ناموفق بوده ⇒ رد شدن (failed=-1 در cursor) — داده محلی دست‌نخورده
  ۱) تلاش دسته‌ای upsertBatch (مسیر سریع)
  ۲) در صورت شکست دسته‌ای ⇒ تک‌تک (upsertها idempotentند) — ردیف‌های خراب به SyncDeadLetter
  ۳) ردیف‌های موفقی که نامه مرده باز داشتند ⇒ resolvedAt = الان
  ۴) جاروی سنگ‌قبرها: کلیدهای موجود − واکشی‌شده − نامه‌های مرده باز ⇒ حذف
  ۵) نقطه ازسرگیری: SyncState.lastSyncCursor = {runId, done[], detail[]} به‌روزرسانی
پس از موفقیت کل اجرا (در doSyncFromArm): SyncState.lastWatermark = زمان موفقیت
```

## ۴) نامه مرده (SyncDeadLetter)

- هر شکست ردیف: `attempts += 1`، `lastError` (۳۰۰ نویسه)، `lastAttemptAt`، `resolvedAt = null`
- **attempts ≥ ۳ و resolvedAt = null ⇐ «مرده»** — ردیف باز است و اپراتور باید بررسی کند
- محافظت: ردیفِ دارای نامه مرده باز از جاروی سنگ‌قبرها **حذف نمی‌شود**
- بازیابی خودکار: موفقیت بعدی همان کلید ⇒ `resolvedAt` پر می‌شود و ردیف عادی می‌گردد
- خطای خودِ نوشتن نامه مرده هرگز مسیر همگام‌سازی را نمی‌شکند (`.catch(() => undefined)`)

## ۵) تفاوت‌های عمدی مسیر افزایشی با legacy (مستند و خواسته‌شده)

1. **پنجره بدون داده**: legacy همه را پاک و دوباره می‌سازد (بین delete و create، خواندن‌ها تهی می‌بینند)؛ افزایشی درجا upsert می‌کند — پنجره وجود ندارد.
2. **واکشی ناموفق خانواده غیربحرانی**: legacy داده قبلی آن خانواده را **پاک می‌کند** (چون catch ⇒ آرایه خالی ⇒ deleteMany+create صفر)؛ افزایشی آن خانواده را **دست‌نخورده** می‌گذارد (فقط `failed=-1` در cursor). این رفع یک نقص شناخته‌شده است.
3. **ردیف خراب منفرد**: legacy کل اجرا را می‌شکند (rollback تراکنش)؛ افزایشی فقط همان ردیف را نامه مرده می‌کند.
4. **شناسه کارشناس تغییرکرده**: با personnelCode یکسان ولی id جدید سامانه، افزایشی id محلی قدیمی را نگه می‌دارد (کلید طبیعی پرسنلی مبناست).

## ۶) نقطه ازسرگیری و idempotency

- `lastSyncCursor` پس از **هر خانواده** به‌روزرسانی می‌شود: `{runId, done: [...], detail: [{entity, count, failed}]}`
- شکست میان‌راه ⇒ cursor نشان می‌دهد کدام خانواده‌ها کامل شده‌اند؛ اجرای بعدی از همان جا گزارش می‌دهد
- **idempotency**: تکرار همان runId/داده نتیجه یکسان می‌دهد (upsert بر کلید طبیعی + جاروی idempotent) — اثبات‌شده در تست
- `lastWatermark`: زمان آخرین موفقیت کامل — علامت آب تازگی داده (مبنای فیلترهای آتی PHASE 4؛ ARM فعلاً واکشی دلتا ندارد)

## ۷) آزمون‌ها (tests/phase2-sync.test.ts — ۹ تست، همه سبز)

۱. پرچم: پیش‌فرض legacy / فقط "incremental" دقیق / garbage ⇒ legacy
۲. درج شش خانواده + syncRunId + cursor شش‌مرحله‌ای
۳. idempotency (اجرای دوباره ⇒ شمارنده ثابت)
۴. به‌روزرسانی درجا (نه حذف/بازسازی)
۵. جاروی سنگ‌قبرها + محافظت نامه مرده باز
۶. نامه مرده: ۳ شکست ⇒ attempts=3 باز؛ اجرای سالم ⇒ resolved
۷. خانواده skip‌شده (interactionsFetched=false) دست‌نخورده + failed=-1
۸. سطح سورس: شاخه legacy عین الگوی deleteMany+createMany حفظ شده
۹. (پوشش ترکیبی بالا) — مجموع بسته: 505/505 سبز

## ۸) اجرای عملیاتی

```bash
# فعال‌سازی (پس از تأیید PHASE 4):
MELK_SYNC_MODE=incremental   # در متغیرهای محیطی سرور
# بازگشت:
MELK_SYNC_MODE=legacy        # یا حذف متغیر
```
- بازگشت فوری و بدون مهاجرت است — هر دو مسیر روی یک اسکیما کار می‌کنند
- «ریست اتصال» (`resetCrmCache`) در هر دو حالت، پاک‌سازی کامل + همگام‌سازی تازه انجام می‌دهد (رفتار واحد)
- پایش: `SELECT * FROM SyncDeadLetter WHERE resolvedAt IS NULL` — ردیف‌های نیازمند بررسی اپراتور

## ۹) شواهد اجرا

- اسکیما: `prisma db push` روی هر سه پایگاه (تولید با بکاپ `db/custom.backup-pre-p204.db`، test.db، test-repository.db) — صفر تغییر ستون موجود
- تست: `bun run test` ⇒ **505/505 سبز** (۹ تست جدید P2-04)
- tsc: صفر خطا
- audit مرز Repository: بدون تغییر (agents 0 / routes 0 / interfaces خالص)
