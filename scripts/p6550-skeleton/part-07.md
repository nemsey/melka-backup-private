
---

# فصل ۱۵ — خودتشخیصی و خودترمیمی (P10-P11)

> مرجع: `src/core/intelligence/p10-core.ts` (۱۹۴ خط — تشخیص) + `p11-core.ts` (۲۷۲ خط — ترمیم) + اسناد روح `docs/P10-SOUL.md` و `docs/P11-SOUL.md` + شواهد `download/p6537/p10-diagnosis.json` و `p11-repairs.json`.

## ۱۵٫۱ — ۲۵ بررسی خودتشخیصی (P10)

موتور تشخیص در هر تیک، `SystemSnapshot` (تصویر لحظه‌ای سیستم: شمارش‌ها، پوشش ستون‌ها، وضعیت sync، رانش، سلامت دیمن‌ها) می‌گیرد و **۲۵ بررسی** را اجرا می‌کند. هر بررسی `DiagnosticCheck { id, status: ok|warn|fail, details }` برمی‌گرداند. خروجی‌ها:

- `warnings[]` — وضعیت warn → هشدار در M8 و Blackboard.
- `criticalAlerts[]` — وضعیت fail → هشدار بحرانی + ورود به صف ترمیم P11.
- `reportCritical()` — ساخت رخداد بحرانی با checkId و پیام.

نمونهٔ خانواده‌های ۲۵ بررسی (به تفکیک دامنه):
| خانواده | نمونه بررسی‌ها | منبع داده |
|---|---|---|
| سلامت داده | ستون بدون داده، افت شمارش، رکورد یتیم، duplicate کلید طبیعی | حسابرسی سطح-DB |
| سلامت سنکرون | چک‌پوینت کهنه، خطای تکرارشونده، نامهٔ مرده انباشته، گپ صفحه‌ای | SyncState/SyncCheckpoint/SyncDeadLetter |
| سلامت هوشمندی | مدل بدون ارزیابی تازه، رانش ورودی/هدف، Brier خارج ناحیهٔ هدف، Tier ناهم‌خوان | PredictionRecord/OutcomeRecord |
| سلامت زیرساخت | دیمن مرده، لاگ خطای انباشته، فضای دیسک، فایل شاهد بیلد ناهم‌خوان | لاگ‌ها + build-witness |
| سلامت قواعد | نقض مرز لایه، رنگ خام جدید، تنظیمات بدون مقدار پیش‌فرض | گاردها + رجیستری تنظیمات |

## ۱۵٫۲ — زنجیرهٔ ترمیم (P11)

```
RepairProposal (پیشنهاد ترمیم — p11-core.ts)
      │  { id, target, rationale, riskLevel, plan }
      ▼
Approval Gate (دروازهٔ تأیید)
      │  ریسک LOW → اجرای خودکار مجاز (قاعدهٔ Safety)
      │  ریسک ≥ MEDIUM → صف تصمیم‌های شورا در M8 (requires_council)
      ▼
Repair Executor (اجراکننده)
      │  اجرا گام‌به‌گام + ثبت شاهد در Blackboard + AuditLog
      ▼
Re-check (بازاجرای همان بررسی P10 برای اثبات بهبود)
```

- هر ترمیم فقط با `RepairProposal` رسمی اجرا می‌شود — **هیچ ترمیمی خودسرانه نیست**.
- اجرای واقعی شاهد‌دار: `scripts/p6545-execute-approved-repairs.ts` + `download/p6545/cleanup-proof.json`.

## ۱۵٫۳ — آشکارسازی رانش (Drift Detection)

در P10 ادغام شده: مقایسهٔ توزیع ویژگی/هدف پنجرهٔ جاری با پنجرهٔ مرجع (آستانهٔ سیاست). عبور از آستانه → warning `drift-*` + پیشنهاد «بازآموزی/کالیبراسیون» به صف P11. گزارش کامل: `download/p6545/recalibrate-proof.json`.

---

## ۱۵٫۴ — متن کامل موتور خودتشخیصی و خودترمیمی

> عین `src/core/intelligence/p10-core.ts` (۱۹۴ خط):

```ts
{{FILE:src/core/intelligence/p10-core.ts}}
```

> عین `src/core/intelligence/p11-core.ts` (۲۷۲ خط):

```ts
{{FILE:src/core/intelligence/p11-core.ts}}
```

---

# فصل ۱۶ — سه گراف اصلی

> مرجع کد: `src/core/graphs/graph-service.ts` (۳۵۶ خط) + `graph-builders.ts` + `index.ts` · ذخیره‌سازی: جداول generic **`GraphNode` / `GraphEdge`** در Prisma (نه in-memory) · قید قانون تثبیت: **additive-only** — یال حذف نمی‌شود، فقط `deprecatedAt` می‌خورد.

## ۱۶٫۱ — نوع‌های گره و یال (عین قرارداد)

```ts
export type GraphName = "property" | "people" | "transaction";

export type NodeType =
  | "property"   // ملک (PropertyRecord — refId=propertyCode)
  | "area"       // منطقه (refId=areaId یا نام منطقه)
  | "person"     // شخص حقیقی (مالک/خریدار/فروشنده/مشتری — refId=موبایل نرمال یا نام)
  | "expert"     // کارشناس (ExpertRecord — refId=personnelCode)
  | "customer"   // مشتری رجیستری (CustomerRecord)
  | "transaction"// معامله (TransactionRecord — refId=id)
  | "request";   // درخواست (RequestRecord — refId=id)

export type EdgeType =
  | "located_in"        // ملک ↔ منطقه
  | "owned_by"          // ملک ↔ مالک
  | "listed_by"         // ملک ↔ کارشناس ثبت‌کننده
  | "owns"              // فرد ↔ ملک (روایت گراف افراد)
  | "requested"         // فرد ↔ درخواست
  | "bought"            // فرد ↔ معامله
  | "sold"              // فرد ↔ معامله
  | "brokered_by"       // معامله/ملک ↔ کارشناس
  | "involves_property" // معامله ↔ ملک
  | "involves_request"; // معامله ↔ درخواست
```

## ۱۶٫۲ — قرارداد هر گراف

هر سه گراف اینترفیس یکسان دارند (عین جلسهٔ ۰۳۳): `nodes`, `edges`, `traverse`, `findPath`, `query`.

## ۱۶٫۳ — گراف ۱: Property Graph

- **گره‌ها:** ملک + منطقه + شخص(مالک) + کارشناس.
- **یال‌های اصلی:** `located_in`, `owned_by`, `listed_by`, `involves_property`.
- **کاربرد:** «همهٔ ملک‌های این مالک»، «همسایه‌های هم‌منطقه»، زنجیرهٔ کارشناس↔ملک برای بینش تمرکز.

## ۱۶٫۴ — گراف ۲: People Graph

- **گره‌ها:** شخص/مشتری + کارشناس.
- **یال‌های اصلی:** `owns`, `requested`, `bought`, `sold`, `brokered_by`.
- **کاربرد:** شبکهٔ تعاملات مشاوران، مشتریان تکرارخرید، مسیر ارجاع.

## ۱۶٫۵ — گراف ۳: Transaction Graph

- **گره‌ها:** معامله + ملک + طرفین + درخواست.
- **یال‌های اصلی:** `bought`, `sold`, `involves_property`, `involves_request`, `brokered_by`.
- **کاربرد:** گزارش تطابق، سهم مشاوران، تشخیص معاملات زنجیره‌ای یک ملک.

## ۱۶٫۶ — ساخت و بازیابی

- **سازنده‌ها:** `graph-builders.ts` پس از هر sync موفق، گراف‌ها را از رکوردهای تازه incrementally می‌سازند (upsert گره/یال؛ یال تکراری وزن/برچسب تازه می‌گیرد).
- **API:** `GET /api/graphs?name=property|people|transaction` (فصل ۲۱) — خروجی nodes/edges آمادهٔ نمایش.
- **شاهد:** `download/p6545/graphs-proof.json` + تست `audit-graph-integrity.sh`.

---

## ۱۶٫۷ — متن کامل سرویس گراف (`graph-service.ts`)

> عین `src/core/graphs/graph-service.ts` (۳۵۶ خط):

```ts
{{FILE:src/core/graphs/graph-service.ts}}
```

---

# فصل ۱۷ — Feature Store و Blackboard

## ۱۷٫۱ — Feature Store مشترک (۵۰+ ویژگی)

- **قرارداد** (`src/core/intelligence/feature/feature-store.ts`):
```ts
export interface FeatureStore {
  save(key: string, features: unknown, version: string): Promise<void>;
  load<T>(key: string, version: string): Promise<T | null>;   // نسخهٔ ناهماهنگ ⇔ null
  invalidate(pattern: string): Promise<void>;                   // تطبیق زیررشته‌ای
  clear(): Promise<void>;
}
```
- **دو پیاده‌سازی:** `InMemoryFeatureStore` (پیش‌فرض — Map) و `FileSystemFeatureStore` (JSONL الحاقی، بارگذاری تنبل).
- **سازنده‌های ویژگی** (`builders/`): `property-features.ts` · `expert-features.ts` · `customer-features.ts` · `market-features.ts` — با هم ۵۰+ ویژگی استاندارد (نرمال‌شده، پنجره‌زمانی، روند).
- **مرز صلب:** صفر Prisma / صفر `@/lib/db` / صفر fetch / صفر React (سند سربرگ فایل).
- **نسخه‌بندی:** کلید «{نوع}:{شناسه}» + version — مقدار کهنه هرگز خاموش بازنمی‌گردد.
- لایهٔ موازی ساده‌تر: `src/core/features/store.ts` (مصرف عمومی کاشی‌ها).

## ۱۷٫۲ — Blackboard (تختهٔ سیاه مشترک موتورها)

- **الگو:** §۷.۲ سند ۰۲۷ — هر موتور می‌نویسد؛ **صفر حذف (فقط append)**؛ **TTL: ۳۰ روز**.
- **ذخیره:** فایل JSONL — `intelligence-data/blackboard.jsonl` (`src/lib/intelligence/blackboard.ts`).
- **ساختار رکورد:**
```ts
export type BlackboardNamespace = "p7" | "p8" | "p9" | "p10" | "p11" | "daemon";

export interface BlackboardEntry<T = unknown> {
  id: string;
  namespace: BlackboardNamespace;
  engineId: string;
  writtenAt: string;
  payload: T;
  hash: string;   // md5 برای اثبات تغییرنکردن (قانون شاهد §۸)
}
```
- **API:** `GET /api/intelligence/blackboard` (M8 نمایشگر دارد) · `GET /api/intelligence/status`.

## ۱۷٫۳ — Event Bus (رویدادهای درون‌پروسه‌ای)

- رویدادهای چرخهٔ داده (`row-upserted`, `sync-slice-done`, `enrichment-completed`, `outcome-recorded`, `policy-version-created`) از موتورها/دیمن‌ها منتشر و توسط مشترکان (ایجنت‌ها، گراف‌ساز، پوشش‌سنج) مصرف می‌شوند.
- الگو: انتشار سبک درون‌فرایندی (بدون بروکر خارجی) — مقیاس تک‌سروری فعلی؛ نقطهٔ ارتقاء به صف پایدار در نقشهٔ راه چندسروری.
