# PHASE 6.5 — سند طراحی جامع «Data Readiness Sprint»

| مشخصات | مقدار |
|---|---|
| سند | `docs/PHASE-6.5-DESIGN.md` |
| مرجع دستور | ملکا-شورا-۱۴۰۵-۰۰۳-یکپارچه — لازم‌الاجرا، جایگزین هر دستور قبلی این دوره |
| صادرکننده اجرا | GLM-5.3 (Senior Architect + AI/Agent Engineer + Data Engineer) |
| تاریخ | ۱۴۰۵/۰۶/۲۶ (بازبینی: ۱۴۰۵/۰۶/۲۷) |
| وضعیت | **v1.1 — APPROVED توسط شورا (ملکا-شورا-۰۱۱/۰۱۲؛ شش انحراف پذیرفته شد) + §۱۴ اجراشده (P6.5-02)** |
| Baseline اجرا | تگ `pre-phase6.5-baseline` (کامیت d9ab45b) · بکاپ `db/custom.backup-pre-bulk-import.db` (md5 `25013bd8ad8a2fee8187864e33e80b68`) · پایه تست ۶۵۱/۶۵۱ ×۲ سبز |
| اصل حاکم | Speed + Quality + Zero-Cost |
| شعار | «داده گنج است. اما گنجی که استخراج نشده، سنگ است.» |
| افق اتصال | هفته آینده — اتصال به ARM/PM دپارتمان املاک ملک تبریز (۱۵۰ کارشناس، ۳ شعبه، ۲۵ سال داده) |

---

## ۰. خلاصه اجرایی و نقشه وابستگی

### ۰.۱ هدف یک‌جمله‌ای

زیرساخت «ذخیره، پاکسازی، یکپارچه‌سازی و پرس‌وجوی سریع» داده تاریخی ARM/PM را در هفت روز آماده می‌کنیم — به‌گونه‌ای که هر رکورد استخراجی «مانند گنج» نگه داشته شود (صفر حذف)، هر پرس‌وجو زیر ۵۰۰ms (P95 @ ۲۰۰K رکورد) پاسخ دهد، تفکیک کارشناسی (ConsultantScope) و رد حسابرسی (AuditLog) در لایه Query تضمین شود و آمادگی چند-دپارتمانی از همین ابتدا (ستون `tenantId` آماده، بدون منطق فعال) در معماری بنشیند.

### ۰.۲ زنجیره وابستگی گام‌ها (۷ روز)

```
P6.5-00 آماده‌سازی (✓ انجام شد — بکاپ + تگ + ۶۵۱×۲)
   │
P6.5-01 این سند (طراحی) ── بازبینی شورا (ف۱+ف۲+ف۵)
   │
   ├── P6.5-02 ConsultantScope + AuditLog (ستون‌های افزودنی + findWithScope + auditAccess)
   │        │  (پیش‌نیاز امنیتی Bulk — «تأیید امنیت قبل از Bulk واقعی»)
   │        ▼
   ├── P6.5-03 Bulk Import Pipeline (bulk-import.ts + checkpoint + rate-limit)
   │        │
   │        ▼
   ├── P6.5-04 Deduplication + Normalization (normalize.ts — توابع خالص)
   │        │  (۰۳ و ۰۴ هم‌پوشان اجرا می‌شوند: normalize ورودی upsert در ۰۳ است؛
   │        │   اجرای مستقل ۰۴ = تست واحد + نمونه ۱۰K موک + بازبینی دستی ۱۰۰ رکورد)
   │        ▼
   ├── P6.5-05 Indexing (۸ ایندکس افزودنی + EXPLAIN QUERY PLAN)
   │        │
   │        ├──────────────────────────────┐
   │        ▼                              ▼
   ├── P6.5-06 Feature Extraction Batch   P6.5-07 Vector Index Bulk
   │   (۱۰K → ۴ FeatureSet، بدون Prediction)   (۱۰K → تعبیه هش‌محور، صفر LLM)
   │        │                              │
   │        └──────────────┬───────────────┘
   │                       ▼
   ├── P6.5-08 Query Performance Test (P50/P95/P99 پنج Query + همزمانی ۱۰)
   │                       │
   │                       ▼
   ├── P6.5-09 Security Audit (audit-data-isolation.sh + گارد ۶بخشی)
   │                       │
   │                       ▼
   └── P6.5-10 Documentation (DATA-READINESS-REPORT.md) ──► P6.5-D (D0-D5)

موازی (در طول هفته): B-01..B-03 (کسب‌وکار) + C-01..C-03 (حقوقی) — فقط متن Markdown
```

### ۰.۳ قواعد صفرِ غیرقابل مذاکره (بخش H دستور — پذیرفته‌شده)

۱. صفر LLM API Call در Production — همه موتورها heuristic + offline.
۲. صفر هزینه پولی — بدون Vector DB پولی، بدون Fine-tune، بدون API خارجی.
۳. صفر Migration مخرب Schema — فقط افزودنی + nullable.
۴. قرارداد v1 لایه هوشمندی دست‌نخورده.
۵. صفر تغییر UI/API قابل‌مشاهده (مستثنا: تغییر نام داشبورد **فقط** در صورت مصوبه صریح شورا — §۱۱.۳).
۶. گارد ۶بخشی `--strict` قبل از هر کامیت.
۷. دو-سبز پیاپی قبل از هر کامیت.
۸. هر گام: کامیت + تست + شاهد + سند.
۹. Rollback Plan برای هر Migration.
۱۰. Rate Limiting به سامانه مبدأ.
۱۱. AuditLog اجباری برای هر Access.
۱۲. Blocker → Alternative → Decision → Continue.
۱۳. قانون H تشدیدشده: صفر ادعای «تحلیل هوشمند» تا داده واقعی وارد نشده.
۱۴. صفر حذف داده تاریخی — فقط dedup/merge.

---

## ۱. استراتژی Bulk Import

### ۱.۱ اصول معماری

**الف) adapter-driven و per-tenant آینده‌نگر:** تمام خواندن از ARM/PM از لایه `src/lib/melk-api/` موجود می‌گذرد (client + endpoints + adapters). هیچ fetch مستقیمی در pipeline نیست. دپارتمان‌های آینده = ماژول adapter جدید با همین قرارداد؛ موتور Bulk مشترک می‌ماند.

**ب) upsert-only، هرگز delete:** الگوی نوشتار = `upsert` بر کلید طبیعی (همان الگوی مسیر افزایشی P2-04 در sync موجود). این هم قاعده ۱۴ (صفر حذف) را ارضا می‌کند و هم idempotency طبیعی می‌دهد — اجرای مجدد از ابتدا یا از checkpoint، نتیجه یکسان دارد.

**ج) صفر فشار به سامانه مبدأ:** حداقل ۲۰۰ms فاصله بین درخواست‌ها + timeout + retry محدود. سامانه مبدأ سامانه تولیدیِ زنده دپارتمان است، منبع تست ما نیست.

**د) resumable به‌صورت ذاتی:** هر صفحه پس از ذخیرهٔ موفق batch، checkpoint به‌روز می‌شود؛ قطع برق/شبکه/فرایند = ادامه از همان صفحه.

### ۱.۲ جدول نگاشت موجودیت ← Endpoint ← جدول مقصد ← کلید طبیعی

| entity (قرارداد دستور) | منبع ARM (endpoint کشف‌شده) | جدول مقصد Prisma | کلید طبیعی (dedup) | وضعیت جدول |
|---|---|---|---|---|
| `transaction` | `realtor-reports/traded-count-total` (صفحه‌بندی + بازه تاریخ) | `TransactionRecord` (موجود) | `contractHolo` | موجود — فقط ستون‌های افزودنی |
| `expert` | `realtors/list` + مکمل PM | `ExpertRecord` (موجود) | `personnelCode` | موجود |
| `listing` | `properties` (فهرست آگهی‌ها + `properties/info/by-code/{code}` برای غنی‌سازی مرحله دوم) | **`PropertyRecord` (جدید — §۲.۲)** | `propertyCode` | **جدید** |
| `request` | `requests` (فهرست + `requests/details/{id}`) | `RequestRecord` (موجود، `source='arm'`) | `requestCode` (ستون افزودنی) | موجود + یک ستون |
| `visit` | `visits/list` | `VisitRecord` (موجود) | `id` ردیف ARM | موجود |
| `contract` | `trade-overviews/list` + `trade-overviews/info/{id}` | `ContractRecord` (موجود) | `contractHolo + propertyCode` | موجود |
| `customer` (مشتق) | مشتق از buyer/seller قرارداد + applicant درخواست + owner آگهی | **`CustomerRecord` (جدید — §۲.۳)** | `mobile`، fallback `pc:{personnelCode}` | **جدید** |

> **نکته نگاشت:** دستور، کلید `request` را `requestCode` خواسته و `RequestRecord` امروز چنین ستونی ندارد (`armRequestId` مخصوص ثبت‌های خودِ اپ است). یک ستون افزودنی `requestCode String?` + ایندکس یکتا اضافه می‌شود؛ رکوردهای Bulk با `source='arm'` (مقدار جدید در ستون رشته‌ای موجود — تغییر داده، نه Schema) متمایز می‌شوند تا مصرف‌کنندگان v1 بتوانند در صورت نیاز تفکیک کنند.

### ۱.۳ قرارداد رابط (عین بخش C دستور — بدون انحراف)

```typescript
// src/lib/melk-api/bulk-import.ts  (P6.5-03)
export interface BulkImportOptions {
  entity: 'transaction' | 'expert' | 'listing' | 'request' | 'visit' | 'contract';
  startDate?: Date;
  endDate?: Date;
  pageSize?: number;      // default: 100 — بازه مجاز 100..500
  batchSize?: number;     // default: 1000
  onProgress?: (progress: BulkImportProgress) => void;
}

export interface BulkImportProgress {
  entity: string;
  totalFetched: number;
  totalSaved: number;
  duplicatesSkipped: number;
  errors: number;
  currentPage: number;
  checkpoint: string;     // JSON serialized
}
```

محدودیت‌های اعتبارسنجی ورودی (fail-fast): `pageSize` clamp به [100, 500]؛ `batchSize` clamp به [100, 2000]؛ بازه تاریخ معکوس → خطای صریح فارسی.

### ۱.۴ جریان اجرای گام‌به‌گام

```
۱) خواندن checkpoint از SyncState.bulkImportCheckpoint (ستون افزودنی §۵.۴)
   ── پیوند فنی: syncState singleton با upsert (الگوی موجود sync.ts:193)
۲) LOOP صفحات:
   a) fetch page(currentPage, pageSize, dateRange)        ← armCall موجود
      · Rate-limit: sleep ≥ 200ms از پایان درخواست قبلی
      · Retry: تا ۵ تلاش، backoff نمایی 2s→4s→8s→16s→30s (cap 30s)
        روی خطای شبکه/5xx/429؛ خطای 4xx (غیر 429) = توقف فوری با خطای صریح
   b) normalize هر ردیف (§۳ — توابع خالص normalize.ts)
   c) dedupKey محاسبه (§۲.۱)
   d) batch save: هر 1000 رکورد → prisma.$transaction با upsert بر کلید طبیعی
      · رکورد موجود → update (merge non-null — §۲.۴)
      · رکورد جدید  → create
      · شمارش created/updated/duplicatesSkipped جداگانه
   e) به‌روزرسانی checkpoint (entity, page, dateRange, totals, updatedAt)
   f) onProgress(...) → گزارش زنده
   g) پایان: صفحه خالی یا page > totalPages (از extractPagedList موجود)
۳) قطع midway: checkpoint ذخیره‌شده + throw با جزئیات (entity/page/خطا/آخرین کلید)
۴) اجرای مجدد: خواندن checkpoint → ادامه از همان صفحه → بدون تکرار (idempotent)
۵) پایان موفق: جمع‌باخت در Progress نهایی + ثبت AuditLog عملیات WRITE
```

### ۱.۵ Checkpoint — قرارداد دقیق

```typescript
// محتوای JSON در SyncState.bulkImportCheckpoint (String? — افزودنی):
interface BulkCheckpoint {
  entity: string;
  currentPage: number;        // آخرین صفحهٔ «کامل-ذخیره‌شده» + 1 = نقطه ادامه
  dateRange?: { from: string; to: string };  // ISO
  totals: { fetched: number; saved: number; dup: number; errors: number };
  startedAt: string;
  updatedAt: string;
  runId: string;              // randomUUID — هم‌خانواده syncRunId موجود
}
```

**قاعده جداسازی:** Bulk **هرگز** فیلدهای sync منظم (`lastSyncCursor`، `lastWatermark`، `syncRunId`) را لمس نمی‌کند — فقط `bulkImportCheckpoint` مال خودش است. این تضمین می‌کند حالت sync منظم و نقطه ازسرگیری آن، دست‌نخورده می‌ماند.

### ۱.۶ Idempotency — سه لایه

1. **کلید طبیعی:** upsert پرایسما بر کلیدهای §۲.۱ — اجرای دوباره = update بی‌ضرر.
2. **Checkpoint صفحه‌ای:** ادامه از نقطه قطع، بدون refetch صفحات کامل‌شده.
3. **runId:** هر اجرا شناسه مستقل دارد؛ گزارش‌ها و AuditLog به runId گره می‌خورند (قابلیت تفکیک آماری).

### ۱.۷ Retry با Backoff نمایی

| تلاش | تأخیر | شرط |
|---|---|---|
| ۱ (retry اول) | 2s | شبکه قطع / 5xx / 429 |
| ۲ | 4s | همان شرط |
| ۳ | 8s | همان شرط |
| ۴ | 16s | همان شرط |
| ۵ (آخرین) | 30s | همان شرط — پس از آن: ذخیره checkpoint + throw |

خطاهای 400/401/403/404 (منطقی، نه گذرا) → بدون retry، توقف فوری با پیام فارسی شفاف. خطای 401 → راهنمای «توکن منقضی شده؛ نشست را تمدید کنید» (توکن از نشست کاربر صاحب کد پرسنلی، مطابق معماری موجود).

### ۱.۸ Rate Limiting

حداقل **۲۰۰ms** فاصله بین «پایان پاسخ قبلی» تا «شروع درخواست بعدی» (نه شروع-به-شروع). پیاده‌سازی: تایم‌استمپ آخرین پاسخ + sleep باقی‌مانده. تست: اندازه‌گیری واقعی فاصله در تست واحد با موک fetch (شرط پذیرش دستور). صفحات ۱۰۰تایی + ۲۰۰ms ⇒ سقف ~۵ درخواست/ثانیه ⇒ احترام کامل به سامانه مبدأ.

### ۱.۹ هم‌زیستی با sync منظم — کشف طراحی (مهم)

وضعیت موجود sync دو مسیر دارد:
- **مسیر کامل** (اولین اجرا / بدون cursor): `deleteMany` شش خانواده + `createMany` — **خطر: اگر پس از Bulk اجرا شود، داده تاریخی را پاک می‌کند.**
- **مسیر افزایشی P2-04** (حالت پایای پس از cursor): `upsertBatch` بر کلید طبیعی + «جاروی» `deleteByKeys` که **فقط کلیدهای دیده‌شده در همان اجرا** را جارو می‌کند — رکوردهای تاریخیِ خارج از بازه sync، هرگز در مجموعه کلید جارو نیستند ⇒ ** Bulk با مسیر افزایشی هم‌زیست کامل دارد.**

**قاعده طراحی:** (الف) Bulk فقط upsert می‌زند و هرگز deleteMany صادر نمی‌کند؛ (ب) پس از Bulk، حالت پایای sync = افزایشی است (که هست)؛ (ج) ریسک مسیر کامل، مستند و پذیرفته‌شده با بازیابی **ارزان و قطعی**: اجرای مجدد Bulk از صفر (idempotent — همان رکوردها، همان کلیدها، همان نتیجه)؛ (د) P6.5-03 یک تست رگرسیون صریح می‌نویسد: «پس از Bulk، اجرای sync افزایشی هیچ رکورد bulk را حذف نمی‌کند» (شاهد شمارشی قبل/بعد).

### ۱.۱۰ حالت Dry-Run و اجرای واقعی

- تمام توسعه و تست با **موک** (صفر فشار به API مبدأ — شرط پذیرش دستور).
- `dryRun: true` (گزینه افزودنی): عبور کامل از normalize + dedup + شمارش، بدون نوشتن در DB — خروجی = گزارش آماری.
- Bulk واقعی **فقط** در D0 پس از: تأیید امنیت (P6.5-02 + P6.5-09) + تأیید Performance (P6.5-08) + بکاپ تازه — مطابق بخش L-۹.
  (رضایت‌نامه محضری با مصوبه ملکا-شورا-۰۱۲ بخش D از شرایط حذف شد — صرفاً پیش‌فرض زمینه‌ای؛ در صورت نیاز برای Bulk واقعی، GLM مستقیماً از مالک درخواست می‌کند، بدون مصوبه شورا.)

---

## ۲. Deduplication Rules

### ۲.۱ جدول کلیدهای طبیعی (عین دستور)

| موجودیت | کلید طبیعی | نکات اجرایی |
|---|---|---|
| property (listing) | `propertyCode` (از ARM) | ستون `@unique` روی PropertyRecord جدید |
| request | `requestCode` | ستون افزودنی `requestCode String?` + ایندکس یکتای جزئی (فقط رکوردهای source='arm') |
| customer | `mobile`، fallback `personnelCode` | کلید منطقی: `mobile ?? "pc:" + personnelCode`؛ ستون mobile یکتا |
| expert | `personnelCode` | موجود (`@unique` روی ExpertRecord) |
| transaction | `contractHolo` | مقدار تهی/تکرار-خالی → fallback ترکیبی `propertyCode + "|" + requestCode + "|" + contractDate` (سند صادقانه: معاملات بدون هولوگرام در داده ۲۵ ساله محتمل است؛ کلید سقوط‌پذیر مستند) |
| contract | `contractHolo + propertyCode` | کلید ترکیبی؛ هولوگرام تهی → ردیف صرفاً update-merge می‌شود نه create تکراری (با کلید `id` ARM) |

### ۲.۲ مدل جدید `PropertyRecord` — رجیستری آگهی‌های ARM

**انحراف صادقانه شماره ۲ (مستند در §۱۲):** دستور موجودیت bulk را `listing` نامیده، اما `ListingRecord` موجود = «فرم ۵ گامی فایل آگهی داخلی» است (با actorCode غیرتهی، انتقال CRM، اینستاگرام). آگهی تاریخی ARM موجودیتی با شکل متفاوت است (کدآگهی، realtor مرتبط، جزئیات برچسب/مقدار). تزریق ۲۰۰K رکورد ARM در ListingRecord: نقض معنا، مجبور به مقدار ساختگی actorCode، و تغییر رفتار مصرف‌کنندگان v1 (کاشی فایل‌ها). **راه‌حل:** مدل افزودنی جدید — صفر برخورد با داده موجود، پل آینده از طریق `ListingRecord.armPropertyId` (موجود).

```prisma
/// P6.5 — کش آگهی‌های ARM (تاریخی + جاری)؛ کلید طبیعی: propertyCode
model PropertyRecord {
  id            String   @id                 // شناسه ARM (objectId)
  propertyCode  String   @unique            // کدآگهی ARM — کلید طبیعی
  title         String?
  status        String?
  // انتساب Scope (§۵)
  ownerCode     String?                     // relatedRealtor → personnelCode
  ownerName     String?
  branchId      String?
  // مکان (تطبیق‌یافته با رجیستری ۹۲۶ — §۳)
  cityId        String?
  areaId        String?
  areaName      String?
  lineId        String?
  lineName      String?
  address       String?
  // مشخصات
  propertyTypeId   String?
  propertyTypeName String?
  tradeTypeId      String?
  tradeTypeName    String?
  price            Float?                   // ریال — عدد پایه (§۳.۵)
  pricePerMeter    Float?                   // ریال
  meterage         Float?
  rooms            Int?
  floor            Int?
  buildYear        Int?
  // متن و خام
  description   String?
  detailsJson    String?                    // [{label, value}] عین ARM
  ownerMobile    String?                    // نرمال‌شده 09xxxxxxxxx
  tenantId       String   @default("melk-tabriz")   // §۱۱ — آماده، غیرفعال
  sourceRunId    String?                    // آخرین bulk-run که رکورد را نوشت
  syncedAt       DateTime @default(now())
  createdAt      DateTime?
  updatedAt      DateTime @updatedAt

  @@index([cityId, areaId, propertyTypeId, tradeTypeId])   // ایندکس ۱ از §۴
  @@index([price, meterage])                               // ایندکس ۲ از §۴
  @@index([createdAt])                                     // ایندکس ۴ از §۴
  @@index([ownerCode])                                     // پشتیبان ConsultantScope
  @@index([tenantId])
}
```

### ۲.۳ مدل جدید `CustomerRecord` — رجیستری مشتریان مشتق

مشتری از چهار مسیر مشتق می‌شود: خریداران/فروشندگان قرارداد (`buyerListJson`/`sellerListJson`)، درخواست‌دهندگان (applicant)، مالکان آگهی (owner). هر ردیف منبع → استخراج (fullName, mobile) → upsert در CustomerRecord با کلید موبایل.

```prisma
/// P6.5 — رجیستری مشتریان مشتق (خریدار/فروشنده/درخواست‌دهنده/مالک)؛ افزودنی
model CustomerRecord {
  id             String   @id @default(cuid())
  mobile         String?                    // کلید طبیعی اول — نرمال‌شده
  personnelCode  String?                    // fallback (کاربر پرسنلی)
  fullName       String                     // نرمال‌شده نام (§۳.۲)
  rolesJson      String?                    // ["buyer","seller","requester","owner"]
  sourceCountsJson String?                  // {contract: n, request: n, property: n, visit: n}
  ownerCode      String?                    // کارشناس مرتبط (انتساب Scope — §۵)
  branchId       String?
  firstSeenAt    DateTime?                  // قدیمی‌ترین تاریخ رکورد منبع
  lastSeenAt     DateTime?
  tenantId       String   @default("melk-tabriz")
  sourceRunId    String?
  updatedAt      DateTime @updatedAt

  @@index([fullName])
  @@index([ownerCode])
  @@index([mobile])
  @@index([tenantId])
}
```

**قاعده حذف تکراری مشتری:** یک موبایل = یک رکورد. برخورد: merge — نقش‌ها اجتماع گرفته می‌شوند، شمارش منابع جمع می‌شود، نام طولانی‌تر/کامل‌تر برنده می‌شود (تعداد توکن بیشتر)، firstSeenAt کمینه/lastSeenAt بیشینه. صفر حذف فیزیکی (قاعده ۱۴).

### ۲.۴ رفتار برخورد تکراری — merge non-null

در upsert هر موجودیت: فیلدهای تهیِ رکورد جدید، مقدار موجود را بازنویسی نمی‌کنند؛ فیلدهای غیرتهی جدید، مقدار قدیمی را به‌روز می‌کنند (استراتژی «جدیدترین داده غیرتهی برنده»). استثنا: فیلدهای حسابرسی (`syncedAt`, `sourceRunId`) همیشه به‌روز. پیاده‌سازی در لایه نگاشت (قبل از upsert، مقدار موجود خوانده نمی‌شود — به‌جای آن در update-data فقط کلیدهای غیرتهی قرار می‌گیرند).

### ۲.۵ گزارش نرخ تکراری

هر اجرا (dry-run و واقعی) گزارش می‌دهد: به تفکیک موجودیت — totalFetched / created / updated / duplicatesSkipped (رکوردهایی که محتوای تغییرنیافته داشتند و فقط syncedAt جابه‌جا شد) / mergeCount. پیش‌بینی دستور: ۵-۱۵٪ — در P6.5-10 با اعداد واقعی ثبت می‌شود.

## ۳. Normalization Rules

### ۳.۱ قرارداد توابع خالص (عین دستور — `src/lib/melk-api/normalize.ts` در P6.5-04)

```typescript
export function normalizePropertyCode(raw: string): string;
export function normalizeName(raw: string): string;
export function normalizeAreaName(raw: string): string;
export function normalizeJalaliDate(raw: string): string; // → ISO 8601
export function normalizeAmount(raw: string): number;     // → ریال (عدد پایه)
export function normalizeMobile(raw: string): string;
export function dedupKey(entity: string, record: unknown): string;
```

همه توابع: **خالص** (صفر DB/fetch/ساعت سیستم)، deterministic، با تست واحد ≥۱۰ مورد (شرط پذیرش دستور). ورودی نامعتبر → خروجی صادقانه (رشته خالی یا مقدار تهی مستند) — هرگز throw خام.

### ۳.۲ نرمال‌سازی نام‌ها — `normalizeName`

ترتیب اعمال: (۱) یکسان‌سازی ارقام فارسی→لاتین؛ (۲) تبدیل نویسه‌های عربی: `ي→ی`، `ك→ک`، `ة→ه`؛ (۳) نرمال‌سازی ZWNJ: فاصله‌های مجاز دور ZWNJ حفظ، ZWNJ‌های دوتایی/سه‌تایی → یکی؛ (۴) فاصله‌های تکراری → یکی؛ (۵) trim؛ (۶) حذف نویسه‌های کنترلی. مثال شاهد: `" سید علي  رضائي "` → `"سید علی رضایی"`.

### ۳.۳ نرمال‌سازی محله‌ها — `normalizeAreaName` با رجیستری ۹۲۶

منبع: `src/lib/divar/tabriz-locations.data.json` (۱۳۰ منطقه × ۹۲۶ محله با شناسه‌های ARM — راستی‌آزمایی‌شده در P6.5-00).

الگوریتم تطبیق (سه‌مرحله‌ای، صفر وابستگی خارجی):
1. **تطبیق دقیق پس از نرمال‌سازی نام** (نرمال‌سازی §۳.۲ روی نام محله + حذف پسوندهای رایج «محله»، weighting مساوی) → بازگشت `{areaId, areaName, lineId, lineName}`.
2. **تطبیق contains دوسویه** (نام ورودی ⊆ نام رجیستری یا برعکس) → بازگشت بهترین تطبیق یکتا؛ چند تطبیق مبهم → عدم تطبیق.
3. **بدون تطبیق** → بازگشت نام نرمال‌شده خام + پرچم `unmatched` (در گزارش P6.5-10 فهرست می‌شود؛ هدف نرخ موفق ≥۹۵٪ شرط پذیرش).

خروجی نهایی همیشه نام **رسمی رجیستری** است (نه املای ورودی) — یکسان‌سازی ارجاع در کل پایگاه.

### ۳.۴ نرمال‌سازی تاریخ — `normalizeJalaliDate` → ISO 8601

پشتیبانی سه فرم ورودی: `1400/01/15`، `1400-1-5`، `۱۴۰۰/۰۱/۱۵` (ارقام فارسی). تبدیل با `jalaliToGregorian` موجود در `src/lib/jalali.ts` (راستی‌آزمایی‌شده). خروجی: `2021-03-05T00:00:00.000Z` (نیمه‌شب UTC — تاریخ‌های تجاری بدون ساعت). تاریخ نامعتبر (مثلاً 1400/13/01) → رشته خالی + شمارش در گزارش خطای نرمال‌سازی.

### ۳.۵ نرمال‌سازی مبالغ — `normalizeAmount` → ریال (عدد پایه)

پشتیبانی: ارقام لاتین/فارسی، جداکننده `,` و `،` و `'`، مقیاس‌واژه‌ها (`میلیون`، `میلیارد`، `تومان`، `تریلیون`)، كسر با `/` (مثل `2/5 میلیارد` در متن فارسی = ۲.۵ میلیارد). **خروجی همیشه ریال** (تومان ×۱۰). 

**قاعده مرز واحد (مهم — ضد فساد FeatureSet):** خط لوله جدید (PropertyRecord/normalize) = **ریال**؛ جداول موروثی (`DivarAd.price`، `MarketPriceStat`) = **تومان** دست‌نخورده. این دو هرگز در یک محاسبه FeatureSet مخلوط نمی‌شوند — Market-FeatureSet خط لوله Bulk از خود PropertyRecordها ساخته می‌شود (ریال-با-ریال)، و فایل‌یابی دیوار از آمار خودش (تومان-با-تومان). تبدیل فقط در مرز صریح و مستند.

### ۳.۶ نرمال‌سازی موبایل — `normalizeMobile`

| ورودی | خروجی |
|---|---|
| `09141234567` | `09141234567` |
| `+989141234567` | `09141234567` |
| `00989141234567` | `09141234567` |
| `۹۱۴۱۲۳۴۵۶۷` (بدون ۰) | `09141234567` |
| `9141234567` (بدون ۰) | `09141234567` |

قواعد: ارقام فارسی→لاتین؛ حذف نویسه‌های غیررقمی (فاصله، `-`، `(`، `)`)؛ حذف پیشوند `+98`/`0098`؛ افزودن `0` پیشوندی برای ۱۰رقمی؛ اعتبارسنجی نهایی `^09\d{9}$` — نامعتبر → رشته خالی (شمارش در گزارش).

### ۳.۷ `dedupKey` — پیاده‌سازی مرجع کلیدهای §۲.۱

تابع dispatch بر موجودیت + استخراج فیلد کلیدی از رکورد نرمال‌شده؛ خروجی رشته یکتا با پیشوند موجودیت (مثلاً `property:12345`، `customer:09141234567`، `customer:pc:1015`، `transaction:HOL-7788`). فقط برای گزارش/شمارش/تست استفاده می‌شود — خود upsert مستقیماً روی ستون‌های کلید Prisma عمل می‌کند (هیچ جدول کلید-مشتق اضافه نمی‌شود).

### ۳.۸ کیفیت و بازبینی

- تست واحد ≥۱۰ مورد برای هر تابع (شرط پذیرش) + کیس‌های مرزی (ورودی خالی، فقط-فاصله، ارقام مخلوط، تاریخ سال کبیسه).
- نمونه موک ۱۰٬۰۰۰ رکورد (مولد deterministic با seed ثابت — قابل بازتولید).
- **بازبینی دستی ۱۰۰ رکورد** توسط تیم (شرط پذیرش دستور) — فهرست و نتیجه در گزارش P6.5-10 ثبت می‌شود.

---

## ۴. Indexing Strategy — ۸ ایندکس افزودنی

### ۴.۱ جدول نگاشت شاخص‌های دستور ← ایندکس‌های واقعی

| # | شاخص دستور (نمای مفهومی) | ایندکس واقعی (Prisma) | جدول | وضعیت |
|---|---|---|---|---|
| ۱ | `[cityId, areaId, propertyType, tradeType]` | `@@index([cityId, areaId, propertyTypeId, tradeTypeId])` | PropertyRecord (جدید) | **جدید** |
| ۲ | `[price, meterage]` | `@@index([price, meterage])` | PropertyRecord (جدید) | **جدید** |
| ۳ | `[personnelCode, branchId]` | `@@index([personnelCode, branchId])` + ستون افزودنی `branchId String?` | ExpertRecord | **جدید** |
| ۴ | `[createdAt]` | `@@index([createdAt])` | PropertyRecord (جدید) | **جدید** |
| ۵ | `[contractHolo]` | `@@index([contractHolo])` | TransactionRecord | **جدید** |
| ۶ | `[propertyCode]` | `@@index([propertyCode])` | ContractRecord | **جدید** (ایندکس propertyCode موجود روی TransactionRecord/VisitRecord حفظ شد) |
| ۷ | `[customerMobile]` | `@@index([customerMobile])` | ListingRecord | **جدید** (روی RequestRecord از قبل موجود است) |
| ۸ | `[interactionType, timestamp]` | `@@index([eventTypeId, createdAt])` | RequestEventRecord | **جدید** — نگاشت صادقانه: «تعامل» در داده واقعی ما = رویداد درخواست |

> **نگاشت صادقانه (§۱۲-۳):** نام ستون‌های دستور نمای مفهومی بودند؛ نگاشت به ستون‌های واقعیِ موجود در Schema انجام شد. ایندکس‌های پشتیبان اضافی (فراتر از ۸): `[ownerCode]` روی چهار جدول Scope-دار، `[mobile]` و `[tenantId]` روی CustomerRecord/PropertyRecord — برای ConsultantScope و آینده چند-مستأجری.

### ۴.۲ اجرا و راستی‌آزمایی

1. افزودن به `prisma/schema.prisma` (همه افزودنی — صفر تغییر/حذف ستون).
2. `bun run db:push` (اسکریپت موجود `db:push` = `prisma db push --accept-data-loss`) — اول روی پایگاه تست (`db/test.db`)، بعد production.
3. **EXPLAIN QUERY PLAN** برای ۵ Query کلیدی (همان ۵ Query P6.5-08): هرکدام باید `USING INDEX` یا `SEARCH ... USING INDEX` نشان دهد، نه `SCAN` کامل.
4. اندازه‌گیری و مستندسازی زمان دقیق (قبل/بعد ایندکس) — شرط پذیرش دستور.

### ۴.۳ Rollback ایندکس‌ها

ایندکس = تغییر Schema افزودنی با rollback بی‌آسیب: حذف ایندکس از schema + db push (بدون دسترسی به داده). بدون نیاز به بازگشت بکاپ. SQLite ایندکس‌های اضافی فقط فضای دیسک می‌گیرند (محدود) و بر نوشتار اثر جزئی دارند — قابل پذیرش در مقیاس ۲۰۰K.

---

## ۵. ConsultantScope Design

### ۵.۱ توسعه مدل Session (افزودنی)

```prisma
model Session {
  // ... فیلدهای موجود دست‌نخورده ...
  branchId     String?    // شعبه (از PM/businesses) — افزودنی
  accessScope  String     @default("OWNER")   // OWNER | BRANCH | CONSULTANT — افزودنی
}
```

- **default امن:** تمام نشست‌های موجود و ورود مدیر = `OWNER` (عین دستور) — رفتار فعلی صفر-تغییر.
- نشست‌های مشاورِ جدید (ورود OTP با کد پرسنلی) = `CONSULTANT` به‌صورت پیش‌فرض؛ `BRANCH` با انتخاب شعبه در تنظیمات آینده.
- **انحراف صادقانه شماره ۱ (§۱۲):** دستور ستون `consultantCode` خواسته؛ `Session.personnelCode` **همین نقش را دارد** (غیرتهی، یکتا-معنایی، موجود). ستون تکراری = ریسک واگرایی داده. تصمیم: `consultantCode ≡ personnelCode` (موجود) — ستون جدید اضافه نمی‌شود.

### ۵.۲ قرارداد ScopeFilter و متد findWithScope

```typescript
// قرارداد مشترک (interfaces/ — افزودنی)
export type AccessScope = 'OWNER' | 'BRANCH' | 'CONSULTANT';

export interface ScopeFilter {
  tenantId: string;          // همیشه 'melk-tabriz' در این فاز
  accessScope: AccessScope;
  personnelCode: string;     // کد کارشناس نشست (≡ consultantCode)
  branchId?: string | null;  // برای BRANCH
}

// روی ۴ مخزن دستوری (Transaction, Customer, Listing, Visit) — افزودنی:
export interface ScopedRepository<T> {
  /** متدهای v1 دست‌نخورده — رفتار فعلی حفظ می‌شود */
  findWithScope<Q>(query: Q, scope: ScopeFilter): Promise<T[]>;
}
```

- متدهای v1 (findAll/listRecent/...) **دست‌نخورده** — هیچ امضایی تغییر نمی‌کند.
- در Service Layer: هر Query تازه‌نوشته scope دریافت می‌کند؛ مسیرهای v1 موجود در همین فاز به‌تدریج و بدون تغییر رفتار مالک (OWNER = بدون فیلتر) scope می‌گیرند.

### ۵.۳ ستون‌های انتساب (افزودنی) و ماتریس دامنه

افزودنی بر جداول Scope-دار: `ownerCode String?` (کد کارشناس صاحب رکورد، از relatedRealtor/realtor/checker مشتق در زمان Import) + `branchId String?`.

**ماتریس دامنه — تصمیم معماری صریح (شفاف و مستند):**

| جدول | نوع داده | OWNER | BRANCH | CONSULTANT |
|---|---|---|---|---|
| ListingRecord | شخصی (actorCode موجود) | همه | `branchId` برابر | `actorCode` برابر |
| RequestRecord / RequestEventRecord | شخصی (actorCode) | همه | `branchId` برابر | `actorCode` برابر |
| CustomerRecord | شخصی (ownerCode) | همه | `branchId` برابر | `ownerCode` برابر |
| VisitRecord | شخصی (ownerCode افزودنی از checker) | همه | `branchId` برابر | `ownerCode` برابر |
| TransactionRecord | تجمیعی دپارتمان | همه | همه | همه |
| InteractionRecord / SupplyDemandRecord | تجمیعی دپارتمان | همه | همه | همه |
| ContractRecord | تجمیعی + داده شخصی خریدار/فروشنده | همه | همه | همه |

**فلسفه (کشف صادقانه و مستند):** گزارش‌های تطابق/تعامل/عرضه-تقاضا، «داده دپارتمانیِ مشترک» هستند (ماهیت گزارش مدیریتی)، نه مال یک کارشناس؛ پنهان‌کردنشان از مشاور = تغییر رفتار قابل‌مشاهده و ناقض B.2-۵. داده «شخصی» (فایل‌ها، درخواست‌ها، مشتریان، بازدیدها) دقیقاً همان چیزی است که دستور تستش را خواسته: «کارشناس A داده کارشناس B را نمی‌بیند» — این جداول **fail-closed** هستند: ردیف بدون انتساب (`ownerCode` تهی) فقط برای OWNER مرئی است.

### ۵.۴ توسعه SyncState (افزودنی)

```prisma
model SyncState {
  // ... فیلدهای موجود ...
  bulkImportCheckpoint  String?   // P6.5-03 — checkpoint یکپارچه (JSON §۱.۵)
  bulkFeatureCheckpoint String?   // P6.5-06 — ازسرگیری استخراج ویژگی
}
```

### ۵.۵ TenantResolver — placeholder (بخش F دستور)

```typescript
// src/core/repositories/tenant.ts (P6.5-02 — افزودنی)
/** Placeholder چند-مستأجری: در PHASE 6.5 فقط tenant پیش‌فرض برمی‌گرداند.
 *  منطق فعال (پرش از tenantId نشست به فیلتر کوئری) عمداً معلق است تا فاز بعدی. */
export function resolveTenantId(_session: { branchId?: string | null } | null): string {
  return 'melk-tabriz';
}
```

صفر منطق فعال؛ صفر مصرف اجباری؛ فقط نقطه اتصال معماری ثبت می‌شود تا PHASE 8+ مسیر مستقیمی برای فعال‌سازی داشته باشد.

### ۵.۶ تست‌های اثبات (شرط پذیرش P6.5-02)

1. مشاور A رکورد مشاور B را در هر ۴ مخزن شخصی **نمی‌بیند** (Repository-level، با داده seed دو کارشناس).
2. OWNER همه داده را می‌بیند.
3. AuditLog برای هر findWithScope ثبت می‌شود (§۶).
4. نشست قدیمی (بدون accessScope) با default `OWNER` کار می‌کند — صفر شکست.
5. رکورد بدون انتساب در جدول شخصی: برای CONSULTANT/BRANCH نامرئی، برای OWNER مرئی (fail-closed).

---

## ۶. AuditLog Extension

### ۶.۱ ستون‌های افزودنی

```prisma
model AuditLog {
  // ... فیلدهای موجود (action, actor, detail, createdAt) ...
  operation   String?   // READ | WRITE | DELETE
  entityType  String?   // transaction | customer | listing | request | visit | contract | property
  recordCount Int?      // تعداد رکوردهای درگیر این دسترسی
  accessScope String?   // OWNER | BRANCH | CONSULTANT
  tenantId    String    @default("melk-tabriz")
}
```

فیلد `action` موجود حفظ می‌شود (سازگاری v1)؛ `operation` تمایز خواندن/نوشتن را صریح می‌کند.

### ۶.۲ Helper — `auditAccess`

```typescript
// src/lib/audit.ts (P6.5-02 — فایل جدید)
export async function auditAccess(
  session: { personnelCode: string; accessScope?: string | null; branchId?: string | null },
  operation: 'READ' | 'WRITE' | 'DELETE',
  entityType: string,
  recordCount: number,
  detail?: string
): Promise<void>;
```

- فراخوانی از Service/Repository پس از هر `findWithScope` و هر نوشتار Bulk.
- شکست نوشتن AuditLog = خطای ثبت‌شده در logger ولی **سد** عملیات نیست (Availability) — به‌جز Bulk واقعی که در آن شکست audit = توقف (داده حساس بزرگ‌مقیاس).
- **قاعده صفر-دسترسی-بدون-حسابرسی:** اسکنر P6.5-09 (`audit-data-isolation.sh`) این را استاتیک اعمال می‌کند (§ بخش گام ۰۹).

### ۶.۳ حجم و نگهداری

AuditLog از امروز append-only است (هرگز update/delete) — سازگار با قاعده ۱۴. رشد مورد انتظار: هر findWithScope یک ردیف (~۱۰۰ بایت) — در استفاده عادی < ۱۰۰ ردیف/روز؛ پس از Bulk واقعی ~ده‌ها ردیف اجرایی. در مقیاس هفته‌ها بی‌خطر؛ سیاست آرشیو (جدا کردن ردیف‌های >۶ ماه به فایل) به PHASE 8 موکول و مستند شد.

## ۷. Feature Extraction Batch Pipeline

### ۷.۱ اسکریپت — `scripts/batch-feature-extraction.ts` (P6.5-06)

```
۱) خواندن checkpoint از SyncState.bulkFeatureCheckpoint
۲) خواندن رکوردهای اصلی در batch های ۱۰٬۰۰۰ ( PropertyRecord → PropertyInput
   + ساخت MarketSampleInput از تجمیع منطقه‌ای همان batch + Expert/Customer از جداول خودشان)
۳) استخراج ۴ FeatureSet از طریق FeatureEngine (متدهای افزودنی PHASE 6:
   extractProperty/Customer/Expert/MarketFeatures) — v1 compute دست‌نخورده
۴) ذخیره تدریجی در FeatureStore (FileSystemFeatureStore موجود — JSONL الحاقی)
۵) به‌روزرسانی checkpoint پس از هر batch + progress reporting
۶) صفر LLM · صفر Prediction (قانون H) · صفر نوشتار در جداول CRM
```

### ۷.۲ قرارداد Checkpoint

```typescript
interface FeatureCheckpoint {
  entity: 'property' | 'customer' | 'expert' | 'market';
  lastCursorId: string;        // آخرین id batch کامل‌شده — ترتیب پایدار (id صعودی)
  processed: number;
  savedFeatures: number;
  startedAt: string; updatedAt: string; runId: string;
}
```

### ۷.۳ اهداف و شواهد عملکردی

- ۱۰K رکورد < ۶۰ ثانیه (شرط پذیرش) — سنجش با `Date.now()` دور کل batch، خروجی در گزارش.
- تخمین ۲۰۰K = خطی از ۱۰K (ثبت صادقانه در گزارش؛ اگر >۲۰ دقیقه ⇒ فعال‌سازی گزینه موازی‌سازی Worker Threads از جدول ریسک §۱۳).
- تست ازسرگیری: قطع عمدی پس از batch دوم → ادامه از cursor → صفر رکورد تکراری در FeatureStore (last-wins JSONL تضمین می‌دهد).
- تست ذخیره/بازیابی: خواندن مجدد FileSystemFeatureStore در نمونه جدید = همان مجموعه.

### ۷.۴ قید ضد-فساد واحد

Market-FeatureSet خط لوله Bulk از PropertyRecord (ریال) ساخته می‌شود؛ هیچ آمار تومانی جداول دیوار/موروثی وارد این محاسبه نمی‌شود (§۳.۵). `featureVersion` هر چهار builder همان نسخه‌های ثابت PHASE 6 است — بازتولید مستقیم پایه ارزیابی.

---

## ۸. Vector Index Batch Pipeline

### ۸.۱ اسکریپت — `scripts/batch-vector-index.ts` (P6.5-07)

```
۱) خواندن checkpoint (همان قرارداد §۷.۲ با entity='vector')
۲) برای هر PropertyRecord: متن = trim(title + ' ' + description)
   · رکورد بدون متن → شمارش skip (صادقانه در گزارش) — تولید متن ساختگی ممنوع
۳) تعبیه hash-based با VectorIndex موجود (PHASE 4) — صفر LLM، deterministic
۴) ذخیره در FileSystemStore (JSONL الحاقی — همان مکانیزم حافظه PHASE 4)
۵) checkpoint + progress
```

### ۸.۲ اهداف و کیفیت

- ۱۰K رکورد < ۹۰ ثانیه (شرط پذیرش).
- تست جستجوی معنایی روی ایندکس ساخته‌شده: ۱۰ Query دستی (شرط پذیرش) — هر Query با ۳ عبارت مرتبط/غیرمرتبط، سنجش اینکه hit برتر متعلق به دامنه مرتبط است؛ نتیجه کیفی در گزارش P6.5-10 ثبت می‌شود (بدون ادعای دقت — قانون H).
- **Fallback حجم (عین جدول ریسک دستور):** اگر ۲۰۰K از زمان/فضا عبور کند ⇒ ایندکس فقط ۵۰K رکورد نخست به‌ترتیب **قدیمی‌ترین اول** (داده تاریخی گنج است) + incremental برای باقی.

---

## ۹. Performance Targets

### ۹.۱ جدول اهداف (معیار GATE-DATA-۸)

| سنجه | هدف | ابزار سنجش |
|---|---|---|
| Query P50 | < ۱۰۰ms | `scripts/query-performance-test.ts` |
| Query P95 | < ۵۰۰ms @ ۲۰۰K رکورد | همان — با seed ۲۰۰K رکورد مصنوعی deterministic |
| Query P99 | < ۱۰۰۰ms | همان |
| Feature Extraction | ۱۰K < ۶۰s | `scripts/batch-feature-extraction.ts` |
| Vector Index | ۱۰K < ۹۰s | `scripts/batch-vector-index.ts` |
| همزمانی | ۱۰ Query موازی بدون degradation (>۲× کند شدن P95) | همان — Promise.all×۱۰ |

### ۹.۲ پنج Query سنجش (عین دستور P6.5-08)

1. آخرین معاملات منطقه X (TransactionRecord با فیلتر منطقه از پیوند PropertyRecord/کد منطقه).
2. فایل‌های زیرقیمت منطقه Y (PropertyRecord: `pricePerMeter` زیر میانه منطقه — همین Query مسیر ایندکس §۴-۲ را می‌سنجد).
3. مشتریان فعال ۳۰ روز اخیر (CustomerRecord: `lastSeenAt >= now-30d`).
4. کارشناسان پرتعامل (InteractionRecord تجمعی + ExpertRecord join).
5. جستجوی معنایی روی description (Vector Index + بازگشت به رکورد).

### ۹.۳ روش سنجش منصفانه

هر Query: ۲۰ اجرای گرم (پس از ۳ اجرای سرد)، ثبت P50/P95/P99، میانه ۳ دور. Seed مصنوعی ۲۰۰K: مولد deterministic با توزیع واقع‌نمایانه (منطقه/قیمت/تاریخ از رجیستری ۹۲۶ و بازه ۲۵ ساله). گزارش کامل در P6.5-10.

---

## ۱۰. Rollback Plan

| سناریو | مسیر بازگشت | هزینه |
|---|---|---|
| شکست Bulk Import (وسط کار) | checkpoint ذخیره است؛ ادامه از نقطه قطع یا توقف کامل — داده نیمه‌جذب‌شده بی‌ضرر است (upsert idempotent) | صفر |
| خرابی داده پس از Bulk | بازیابی از `db/custom.backup-pre-bulk-import.db` (کپی معکوس + ریستارت سرویس) | دقیقه‌ای |
| باگ در Query Layer | Feature Flag بازگشت به Query قدیم: پرچم محیطی `SCOPE_QUERY_V1=1` در findWithScope که مسیر فیلتر را دور می‌زند (فقط برای مالک/دیباگ — پیش‌فرض خاموش) | صفر |
| باگ در ایندکس‌ها | حذف ایندکس از schema + db push (§۴.۳) | دقیقه‌ای |
| ستون‌های افزودنی | همه nullable/default — حذف بدون آسیب (§ همه Migrationها) | دقیقه‌ای |
| هم‌زیستی sync کامل/افزایشی | §۱.۹ — مسیر کامل پس از Bulk = اجرای مجدد Bulk (idempotent) | زمان import |

**قاعده:** هر Migration این فاز (ستون/جدول/ایندکس) باید در کامیت خودش دستور حذف-بی‌آسیب مستند داشته باشد (قاعده H-۹).

---

## ۱۱. بند آینده‌نگر: توسعه‌پذیری چند-دپارتمانی (بخش F دستور)

### ۱۱.۱ ستون tenantId — فهرست دقیق جداول

افزودنی `tenantId String @default("melk-tabriz")` روی جداول کلیدی: `PropertyRecord`، `CustomerRecord`، `TransactionRecord`، `ExpertRecord`، `InteractionRecord`، `VisitRecord`، `SupplyDemandRecord`، `ContractRecord`، `ListingRecord`، `RequestRecord`، `RequestEventRecord`، `AuditLog`، `Session`. (SQLite: ستون جدید با default غیرتهی، ردیف‌های موجود خودکار مقدار default می‌گیرند — بدون بازنویسی داده.)

### ۱۱.۲ TenantResolver — placeholder

§۵.۵ — صفر منطق فعال در این فاز؛ فقط ستون آماده + نقطه اتصال کد. فعال‌سازی منطق multi-tenant = تصمیم PHASE 8+ با دستور جدید شورا.

### ۱۱.۳ رأی فنی GLM درباره دو گزینه داشبورد (پاسخ به بخش اول پیام شورا)

**گزینه ۱:** داشبورد مستقل هر دپارتمان (تغییر نام به «داشبورد مدیریتی ملک تبریز» + ساخت داشبورد جدا به‌ازای هر دپارتمان).
**گزینه ۲:** داشبورد واحد + تنظیمات ایجنت برای اتصال به دپارتمان‌های دیگر.

**توصیه GLM — ترکیب هدفمند: «گزینه ۱ در لایه هویت و دامنه، گزینه ۲ در لایه کد و زیرساخت»:**

1. **تغییر نام: موافق.** داشبورد و کاشی‌هایش واقعاً مختص سامانه‌های ملک تبریز است (ARM/PM)؛ نام صادقانه «داشبورد مدیریتی ملک تبریز» است. اجرای آن یک رشته است.
2. **داشبورد جدا به‌ازای دپارتمان: موافق در سطح «نمایش و دامنه داده»، مخالف در سطح «فورک کد».** فورک N نسخه اپ = تکثیر باگ، N برابر نگهداری، هدررفت پنج موتور بدنه‌دار، نقض قید صفر هزینه. راه درست: **یک کدبیس، یک استقرار، تفکیک در tenantId** — هر دپارتمان = یک مستأجر با داشبورد خودش (کاشی‌ها/داده/تنظیمات اتصال خودش). بخش F دستور دقیقاً همین ستون را تجویز کرده — معماری پیشنهادی امتداد طبیعی مصوبه شوراست.
3. **مکانیسم گزینه ۲ (تنظیمات ایجنت): به‌عنوان «پیکربندی اتصال per-tenant» حفظ می‌شود**، نه سوئیچ سراسری اختلاط. دلیل فنی قاطع: اختلاط داده دو دپارتمان در یک کاشی، FeatureSetهای Market را فاسد می‌کند (تعداد عرضه یک منطقه از دو منبع دوبار شمرده می‌شود؛ میانه قیمت دوگانه) و مرز رضایت‌نامه‌های محضری per- department را مخدوش می‌کند.
4. **افق گروهی:** اگر مالک در آینده «نمای فرامستأجری» خواست (جمع بازار تبریز از چند دپارتمان)، داشبورد فدرال جدا با نقش OWNER-گروهی در PHASE 8+ ساخته می‌شود — خواندن cross-tenant فقط با نقش، هرگز اختلاط نوشتار.
5. **زمان‌بندی تغییر نام — مصوب شد (ملکا-شورا-۰۱۱ بخش C):** مسیر (الف) — اجرا در **P6.5-D** همراه PWA v11 به‌عنوان «تغییر عمدی مصوب و مستند» با ملاک D3 اصلاح‌شده (§۱۴.۴: صفر تغییر ناخواسته + فهرست تغییرات عمدی = تنها یک مورد). هیچ تغییر UI دیگری در این فاز مجاز نیست.

---

## ۱۲. انحرافات صادقانه از متن دستور (فهرست کامل)

| # | موضوع | متن دستور | تصمیم مستند | توجیه |
|---|---|---|---|---|
| ۱ | Session | ستون `consultantCode?` | اضافه نمی‌شود — `consultantCode ≡ personnelCode` موجود (غیرتهی) | ستون تکراری = ریسک واگرایی؛ معنای یکسان |
| ۲ | موجودیت listing | مقصد نامشخص | مدل جدید `PropertyRecord` (کلید propertyCode)؛ `ListingRecord` = فرم ۵ گامی داخلی، دست‌نخورده | شکل داده ARM با فرم داخلی متفاوت است؛ حفظ معنا + پل `armPropertyId` موجود |
| ۳ | ۸ ایندکس | نام ستون‌های مفهومی | نگاشت به ستون‌های واقعی (§۴.۱) — مهم‌ترین: `interactionType,timestamp → eventTypeId,createdAt` | ستون‌های دستور در Schema واقعی وجود ندارند؛ نگاشت معنایی معتبر |
| ۴ | transaction | کلید `contractHolo` | fallback ترکیبی برای هولوگرام تهی (§۲.۱) | داده ۲۵ ساله قطعاً ردیف بدون هولوگرام دارد |
| ۵ | مشتری در Scope | «CustomerRepository» | دامنه مشتری = RequestRecord/RequestEventRecord فعلی + CustomerRecord جدید | مخزن موجود همین دامنه را پوشش می‌دهد؛ رجیستری جدید برای Bulk |
| ۶ | تغییر نام داشبورد | (بخش اول پیام) | طراحی §۱۱.۳ — اجرا منوط به مصوبه شورا درباره زمان‌بندی | تنش با B.2-۵/D3 — تصمیم بالادستی |

---

## ۱۳. ریسک‌ها و مسیرهای جایگزین

| ریسک | احتمال | مسیر جایگزین |
|---|---|---|
| API ملک تبریز کند/ناپایدار | متوسط | Batch کوچک‌تر (۱۰۰) + retry بیشتر + timeout بالاتر (§۱.۷) |
| SQLite به سقف ظرفیت برسد | پایین | Migration برنامه‌ریزی‌شده به PostgreSQL در PHASE 8 (مصوبه موجود) |
| Feature Extraction روی ۲۰۰K کند | متوسط | موازی‌سازی Worker Threads + ذخیره تدریجی (§۷.۳) |
| Vector Index حجم بالا | متوسط | Fallback: ایندکس ۵۰K رکورد اول + incremental (§۸.۲) |
| داده‌های مشابه با فرمت متفاوت | بالا | Normalization جامع (§۳) + بازبینی دستی ۱۰۰ رکورد |
| Bulk Import نیمه‌کاره بماند | متوسط | Checkpoint هر صفحه — ازسرگیری خودکار (§۱.۵) |
| نشت داده بین کارشناسان | پایین | ConsultantScope + گارد ۶بخشی + آزمون نشت عمدی (P6.5-09) |
| حرکت به چند-دپارتمانی زودهنگام | متوسط | ستون tenantId آماده — بدون منطق فعال (§۱۱) |
| **تازه:** مسیر sync کامل پس از Bulk، تاریخ را پاک کند | پایین | §۱.۹ — حالت پایا = افزایشی؛ بازیابی = اجرای مجدد Bulk idempotent + تست رگرسیون صریح |
| **تازه:** واحد پول ریال/تومان مخلوط شود | متوسط | قاعده مرز واحد (§۳.۵) + تست واحد صریح روی مرز |
| **تازه:** نرخ unmatched محله‌ها > ۵٪ | متوسط | فهرست unmatched در گزارش + توسعه قاموس مترادف (بازبینی دستی) در P6.5-10 |

---

## ۱۴. آماده‌سازی چند-دپارتمانی (مصوبه شورا — بند اجراشده)

> **مرجع:** مصوبات ملکا-شورا-۰۱۱ و ۰۱۲ (جلسه فوق‌العاده ۰۰۳ — ۱۴۰۵/۰۶/۲۷) + اصلاح دستور یکپارچه.
> این بند به‌موجب شرط B.2-۴ دستور تداوم پس از بازبینی به سند افزوده شد و تصمیم شورا +
> اقدامات اجراشده در P6.5-02 را مستند می‌کند.

### ۱۴.۱ تصمیم معماری تصویب‌شده (بخش B.1 مصوبه)

| لایه | تصمیم |
|---|---|
| **هویت** | گزینه ۱ — تغییر نام به «داشبورد مدیریتی ملک تبریز» (اجرا فقط در P6.5-D — §۱۴.۴) |
| **کد** | گزینه ۲ — یک کدبیس + `tenantId` + `TenantResolver` (تک-استقرار، تفکیک در داده) |
| **نمای فدرال** | PHASE 8+ — فقط برای نقش OWNER-گروهی؛ خواندن cross-tenant، هرگز اختلاط نوشتار |

### ۱۴.۲ اقدامات اجراشده در P6.5-02

۱) **ستون `tenantId` روی هفت جدول مصوب** — همگی افزودنی با نوع `String? @default("melk-tabriz")`:
`ListingRecord` · `TransactionRecord` · `CustomerRecord` (جدید) · `PropertyRecord` (جدید) ·
`ExpertRecord` · `RequestRecord` · `VisitRecord`. جدول `AuditLog` نیز طبق §۶.۱ (پسوندهای حسابرسی،
جزو «AuditLog Extension طبق طراحی») `tenantId` غیر-nullable با همان default گرفت.
ستون‌های انتساب Scope (§۵.۳) هم‌زمان اعمال شد: `ownerCode`/`branchId` روی Transaction/Visit،
`branchId` روی Expert/Listing/Request.

۲) **`TenantResolver`** در `src/core/repositories/tenant.ts` (طبق B.2-۲): قرارداد
`interface TenantResolver { resolve(session): string }` + پیاده‌سازی پیش‌فرض `DefaultTenantResolver`
(همیشه `'melk-tabriz'`) + تابع کمکی `resolveTenantId` + نمونه سراسری تزریق‌پذیر. خالص (صفر Prisma).

۳) **صفر منطق فعال multi-tenant** (تأکید سه‌باره مصوبه): `ScopeFilter.tenantId` حمل می‌شود اما
در هیچ WHERE اعمال نمی‌شود؛ فعال‌سازی = PHASE 8+ با دستور جدید شورا. شاهد تستی: ردیف با
`tenantId='future-tenant'` برای OWNER مرئی می‌ماند — غیرفعالیِ عمدی فیلتر اثبات شد.

۴) **جداول باقی‌مانده از فهرست آینده‌نگر §۱۱.۱** (`Session`، `ContractRecord`، `RequestEventRecord`،
`InteractionRecord`، `SupplyDemandRecord`): طبق فهرست هفت‌گانه مصوب، در این گام `tenantId` نگرفتند —
به گام‌های بعدی/PHASE 8 موکول. (Session در همین گام `branchId`/`accessScope`ِ §۵.۱ را گرفت.)

۵) **دو مدل جدید** `PropertyRecord` (§۲.۲) و `CustomerRecord` (§۲.۳) با شکل کامل طراحی + ایندکس‌های
درون‌مدل ساخته شدند — جداول خالی (زیرساخت P6.5-03)؛ منطق dedup/پرشدگی در گام‌های بعدی.

۶) **ConsultantScope طبق §۵** (قرارداد `scope.repository.ts` + `findWithScope` چهار مخزن + ماتریس
دومنه + fail-closed + `personalScopeClause` خالص) و **AuditLog Extension طبق §۶** (`src/lib/audit.ts` +
پنج ستون افزودنی + ثبت هر دسترسی). شواهد: ۲۱ تست جدید (۶۵۱ ← ۶۷۲).

### ۱۴.۳ کشف‌های صادقانه اجرا (P6.5-02)

| # | کشف | تصمیم مستند |
|---|---|---|
| ۱ | Prisma برای افزودن ستون **غیر-nullable با default** روی SQLite (`Session.accessScope`، `AuditLog.tenantId`) از «بازسازی جدول» (کپی-drop-rename درون یک تراکنش) استفاده می‌کند، نه `ALTER ADD COLUMN` خالص | پذیرفته شد — خروجی نهایی افزودنی است (صفر ستون حذف/تغییر نام)؛ داده کامل حفظ شد: ۵۹/۵۹ نشست و ۱۲۸/۱۲۸ رد حسابرسی قبل/بعد برابر، `integrity_check ok`؛ بکاپ گرم `VACUUM INTO` پیش از اجرا (`db/custom.backup-pre-p6502.db`) |
| ۲ | رشد آینه‌های DTO (الگوی مستند خود لایه) ⇒ ردیف‌های JSON مسیرهای v1 ستون‌های جدید تهی/default را **در دنباله شیء** می‌گیرند | پذیرفته شد — رندر صفحات صفر-تغییر (ملاک D3 = md5 اسکرین‌شات)؛ هیچ مصرف‌کننده v1 کلید جدید نمی‌خواند؛ تست دودی زنده: همه روت‌ها ۴۰۱ صحیح، health ok |
| ۳ | `AuditLog.tenantId` خارج از فهرست هفت‌گانه مصوب است | از §۶.۱ طراحی مصوب می‌آید («AuditLog Extension طبق طراحی P6.5-01») — افزوده خودسرانه نیست |

### ۱۴.۴ تغییر نام داشبورد و ملاک D3 (بخش C مصوبه)

- تغییر نام «داشبورد مدیریتی» ← «داشبورد مدیریتی ملک تبریز»: **فقط در P6.5-D** همراه PWA v11.
- ملاک D3 اصلاح‌شده: صفحات بدون تغییر عمدی = md5 یکسان (زنجیره P3←P6.5)؛ فهرست تغییرات عمدی
  P6.5 = **تنها یک مورد: تغییر نام داشبورد**. هر تغییر عمدی دیگر بدون مصوبه شورا = نقض D3.

### ۱۴.۵ اصلاح دستور یکپارچه (بخش D مصوبه)

رضایت‌نامه حقوقی از KPIها/معیارها/گیت‌ها حذف شد (اصلاح بندهای A.2 · B.3/GATE-DATA#۱۰ · D0 · K ·
I-روز۷ · G-۱۳). قاعده جایگزین: پیش‌فرض زمینه‌ای؛ در صورت نیاز برای Bulk واقعی، GLM مستقیماً از
مالک درخواست می‌کند — بدون مصوبه شورا. (§۱.۱۰ همین سند اصلاح شد.)

### ۱۴.۶ نقشه گارد ۶بخشی (بخش E-۷ مصوبه)

`regression-guard.sh --strict` از این گام شش‌بخشی است: تست‌ها · مرز Repository · امنیت لاگ ·
مرز هوشمندی · دیدپذیری Feature/Prediction · **جداسازی داده و حسابرسی دسترسی** (بخش ششم تا
P6.5-09 با پیام SKIP صریح — همان الگوی نردبانی P2-05/P3-06/P6-08).

---

## پیوست A — تغییرات Schema در یک نگاه (همه افزودنی)

| مدل | ستون/ایندکس جدید |
|---|---|
| Session | `branchId?`، `accessScope @default("OWNER")`، `tenantId @default("melk-tabriz")` |
| AuditLog | `operation?`، `entityType?`، `recordCount?`، `accessScope?`، `tenantId` |
| SyncState | `bulkImportCheckpoint?`، `bulkFeatureCheckpoint?` |
| ExpertRecord | `branchId?`، `tenantId` + ایندکس `[personnelCode, branchId]` |
| TransactionRecord | `ownerCode?`، `branchId?`، `tenantId` + ایندکس `[contractHolo]` |
| VisitRecord | `ownerCode?`، `branchId?`، `tenantId` |
| ContractRecord | ایندکس `[propertyCode]`، `tenantId` |
| ListingRecord | `branchId?`، `tenantId` + ایندکس `[customerMobile]` |
| RequestRecord | `requestCode?`، `branchId?`، `tenantId` |
| RequestEventRecord | ایندکس `[eventTypeId, createdAt]`، `tenantId` |
| InteractionRecord / SupplyDemandRecord | `tenantId` |
| **PropertyRecord (جدید)** | کل مدل (§۲.۲) |
| **CustomerRecord (جدید)** | کل مدل (§۲.۳) |

> **وضعیت اجرا (P6.5-02):** اعمال‌شده — ستون‌های Session/AuditLog (§۵.۱/§۶.۱)، tenantId هفت جدول +
> ستون‌های انتساب Scope (§۱۴.۲) و هر دو مدل جدید کامل. باقی‌مانده برای گام‌های بعدی: ایندکس‌های جداول
> موجود (P6.5-05)، `requestCode` روی RequestRecord و ستون‌های SyncState (P6.5-03/۰۶).

## پیوست B — فایل‌های جدید این فاز

| فایل | گام | نوع |
|---|---|---|
| `src/lib/melk-api/bulk-import.ts` | P6.5-03 | Pipeline |
| `src/lib/melk-api/normalize.ts` | P6.5-04 | توابع خالص |
| `src/lib/audit.ts` | P6.5-02 | Helper حسابرسی |
| `src/core/repositories/tenant.ts` | P6.5-02 | Placeholder |
| `src/core/repositories/interfaces/scope.repository.ts` | P6.5-02 | قرارداد ConsultantScope |
| `scripts/batch-feature-extraction.ts` | P6.5-06 | Batch |
| `scripts/batch-vector-index.ts` | P6.5-07 | Batch |
| `scripts/query-performance-test.ts` | P6.5-08 | سنجش |
| `scripts/audit-data-isolation.sh` | P6.5-09 | اسکنر امنیتی |
| `docs/DATA-READINESS-REPORT.md` | P6.5-10 | گزارش |
| `docs/BUSINESS-MODEL.md` · `docs/MARKET-MAP.md` · `docs/UNIT-ECONOMICS.md` | B-01..03 | کسب‌وکار |
| `docs/legal/CONSULTANT-AGREEMENT.md` · `TERMS-OF-SERVICE.md` · `PRIVACY-POLICY.md` | C-01..03 | حقوقی |


