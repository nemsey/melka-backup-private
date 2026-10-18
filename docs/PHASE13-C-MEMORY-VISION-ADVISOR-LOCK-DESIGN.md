# سند طراحی فاز ۱۳-ج — مغز کامل: حافظه + بینایی + مشاور + کمربند
**شماره:** PN-025-DESIGN · **سند:** ملکا-شورا-ن۰۳۲-۱۴۰۵ · **تاریخ:** ۱۴۰۵/۰۷/۲۱
**دستور:** شاهکار چهارستونه — «حافظهٔ بلندمدت + بینایی کامل + مشاور تصمیم (موتور ۱۶) + کمربند ایمنی»
**اعمال:** سه کاشی حیاتی — M5 تطبیق هوشمند · فایل‌یابی ملکا · M7 شاخص بازار

---

## فصل ۱ — فلسفهٔ چهار ستون

### ۱.۱ — مسئلهٔ بنیادین

مغز ملکا امروز پانزده موتور زنده دارد: توجه (۱۲)، علّیت (۱۳)، پادواقع (۱۴)، شبیه‌سازی (۱۵) و یازده موتور زیرساختی از فازهای پیشین. این مغز در هر بازهٔ زمانی، از صفر شروع می‌کند. آماری که امروز دربارهٔ یک آگهی ساخته می‌شود، فردا از نو ساخته می‌شود؛ خاطره‌ای که دیروز دربارهٔ یک خریدار ثبت شده، امروز جایی در استدلال نقش ندارد. این یعنی مغز «هوشمند» است اما «یادگیرنده» نیست — تفاوتی که شاهکار این فاز قرار است پر کند.

مشکل دوم، نگاهِ تکه‌تکه است. سه گراف ملک/اشخاص/معاملات جدا از هم زندگی می‌کنند و گراف علّی و گراف زمانی هم هر کدام جزیرهٔ خودشان هستند. مغز نمی‌تواند به یک پرسش ساده پاسخ دهد: «این خریدار احمدی چرا برای این ملک ولیعصر مناسب است؟» — چون مسیرهای ارتباطی که این دو را به هم وصل می‌کنند (کارشناس مشترک، بازدید قبلی، معاملهٔ همسایگی) در هیچ گرافِ واحدی کنار هم نیستند.

مشکل سوم، شکاف «تحلیل تا اقدام» است. موتورهای ۱۲ تا ۱۵ خروجی فنی می‌دهند — احتمال، اثر علّی، سناریو — اما هیچ‌کدام به کارشناس نمی‌گوید «پس چه کار کنم؟». کارشناس باید خودش از میان پنج خروجی عددی، تصمیم را بتراشد؛ این یعنی بار شناختی هنوز بر دودمان انسانی است.

مشکل چهارم، بی‌محور بودن تصمیم‌هاست. سیستمی که توصیه می‌دهد اما محدودیت زمانی ندارد، به‌سرعت به منبع اسپم تبدیل می‌شود. تصمیمِ خوب هم اگر ده بار در روز تکرار شود، آزار است. مغز کامل باید مثل مشاور انسانیِ باادب باشد: یک بار می‌گوید، دلیلش را می‌آورد، و تا وقتی وضعیت معنادار تغییر نکرده ساکت می‌ماند.

### ۱.۲ — چهار ستون در یک جمله

> **حافظه** از تجربه یاد می‌گیرد · **بینایی** همه‌چیز را یکجا می‌بیند · **مشاور** می‌گوید چه کرد · **کمربند** با احترام می‌گوید و می‌خوابد.

### ۱.۳ — الهام عصب‌شناختی: خواب و تثبیت

مدل حافظهٔ انسان سه مخزن دارد: حافظهٔ حسی (ثانیه‌ها)، کوتاه‌مدت (دقیقه‌ها) و بلندمدت (سال‌ها). انتقال از کوتاه‌مدت به بلندمدت در خواب رخ می‌دهد — «تثبیت» (Consolidation): مغز خاطرات روز را مرور می‌کند، مهم‌ها را تثبیت می‌کند و بی‌اهمیت‌ها را محو.

ما همین را مهندسی می‌کنیم:
- **داغ (Hot)** = حافظهٔ کاری — هفتهٔ اخیر، سریع‌ترین دسترس، بیشترین جزئیات
- **گرم (Warm)** = حافظهٔ میان‌مدت — ماه اخیر، خلاصه‌شده اما پابرجا
- **سرد (Cold)** = آرشیو — سال اخیر، فقط برای audit و رجوع
- **تثبیت شبانه** = کار Worker که هر شب اجرا می‌شود: مهم‌ها را ارتقا، بی‌اهمیت‌ها را آرشیو

تفاوت مهم با مغزار سنتی: ما هیچ داده‌ای را «حذف» نمی‌کنیم (دکترین دادهٔ مقدس — قانون همیشگی ملکا). سرد یعنی «خارج از مسیر داغ استدلال» نه «پاک شده». هر رکوردی که وارد چرخهٔ حافظه شود، تا ابد قابل audit است.

### ۱.۴ — قیدهای مطلق (میراث فازهای قبل)

| # | قید | ریشه | گواه |
|---|-----|------|------|
| ۱ | صفر LLM در production | سفارش PN-025/ستون ۳ | گارد audit-decision-lock + تست |
| ۲ | صفر auto_execute | قانون ۱۱ ابدی + قفل نوع TypeScript | `autoExecute: false` literal type |
| ۳ | صفر migration تهاجمی | قانون ۸ | فقط ۳ CREATE TABLE افزودنی |
| ۴ | صفر PostgreSQL | سفارش | SQLite موجود |
| ۵ | خلوص لایهٔ هوش | گارد فاز ۳ Prisma | موتور = خالص، DB فقط در سرویس |
| ۶ | WCAG AA | نگین PN-024 | رنگ‌ها از رجیستری |

### ۱.۵ — چرا حالا؟

زنجیرهٔ PN-023-A (موتورهای توجه و علّیت) و PN-024 (پادواقع و شبیه‌سازی) مغز را به نقطهٔ رسیده: پانزده موتور که هر کدام خروجی معتبر و تست‌شده دارند. سؤال بعدی طبیعتاً «ادغام» است — نه افزودن موتور شانزدهم به کنار پانزده‌تای قبل، بلکه لایه‌ای که همهٔ آن‌ها را ۱) در طول زمان نگه دارد، ۲) در کنار هم ببیند، ۳) به یک توصیهٔ واحد برساند و ۴) مهذبانه ارائه کند. این دقیقاً تعریف فاز ۱۳-ج است.

---

## فصل ۲ — معماری بینایی کامل (Unified Graph)

### ۲.۱ — وضع موجود: چهار جزیره

امروز چهار ساختار گراف-گونه در سامانه وجود دارد که هیچ‌کدام همدیگر را نمی‌بینند:

1. **گراف ملک-اشخاص** (پایگاه دادهٔ رابطه‌ای): آگهی ↔ مالک ↔ کارشناس ↔ شعبه
2. **گراف تعاملات** (InteractionRecord): بازدید‌ها، تماس‌ها، ثبت‌ها
3. **گراف علّی** (CausalEdgeRecord — PN-023-A): ۷ گره، ۱۶ یال، ضریب‌های SCM
4. **گراف زمانی** (رویدادهای وضعیت آگهی/درخواست): چرخهٔ عمر هر پرونده

پرسش «چرا خریدار X برای ملک Y مناسب است؟» به مسیرهایی در هر چهار جزیره نیاز دارد — و امروز پاسخش ساختنی نیست.

### ۲.۲ — لایهٔ یکپارچه: نه پایگاه دادهٔ تازه، نه کپی داده

تصمیم مهندسی کلیدی: **Unified Graph یک لایهٔ پرس‌وجو است، نه یک ذخیره‌گاه جدید.** گراف یکپارچه داده را کپی نمی‌کند؛ در لحظهٔ پرسش، از منابع موجود (Prisma + گراف علّی + رویدادها) می‌خواند و یک نمای یکپارچه می‌سازد. دلایل:

- **صفر خطر دوگانه‌نویسی** — دادهٔ واحد باقی می‌ماند (قانون منبع یگانهٔ حقیقت)
- **صفر migration تهاجمی** — هیچ جدول گرافی تازه لازم نیست
- **تازگی تضمینی** — هر پرسش، دادهٔ زندهٔ لحظه می‌بیند

هزینه: هر پرسش باید از چند منبع بخواند. برای مقیاس فعلی (ده‌ها هزار رکورد) کاملاً قابل قبول است؛ اگر روزی ملی شد، لایهٔ کش میان‌دور می‌افزاییم (فصل ۱۰ — مسیر رشد).

### ۲.۳ — قرارداد پرس‌وجو (عین سفارش شورا)

```typescript
interface UnifiedGraphQuery {
  fromType: 'property' | 'person' | 'transaction' | 'causal' | 'temporal';
  fromId: string;
  pathTypes?: string[];   // محدودکردن انواع یال — پیش‌فرض همه
  maxDepth?: number;      // عمق پیمایش — پیش‌فرض ۳، سقف ۵
}

interface GraphVision {
  paths: GraphPath[];     // مسیرهای یافته‌شده (مرتب بر اساس وزن)
  insights: string[];    // روایت فارسی — قالب‌های فصل ۶
  confidence: number;    // 0..1 — از میانگین وزن مسیرها
}

interface GraphPath {
  nodes: GraphNode[];    // دنبالهٔ گره‌ها
  edges: GraphEdge[];    // دنبالهٔ یال‌ها با نوع
  weight: number;        // 0..1 — معناداری مسیر
}
```

### ۲.۴ — انواع گره و یال

**گره‌ها** (پنج نوع): `property` (کد ملک)، `person` (نام/موبایل نرمال‌شده)، `transaction` (شناسهٔ معامله)، `causal` (متغیر علّی)، `temporal` (رویداد زمانی).

**یال‌ها** (نُه نوع معنایی):

| نوع یال | از → به | منبع | وزن پایه |
|---------|---------|------|----------|
| `OWNED_BY` | property → person | PropertyRecord.rawOwnerName | 0.9 |
| `LISTED_BY` | property → person | realtorName | 0.8 |
| `REQUESTED_BY` | request → person | RequestRecord.customerName | 0.8 |
| `TRANSACTION_PARTY` | transaction → person/property | TransactionRecord | 0.9 |
| `INTERACTED` | person → property | InteractionRecord | 0.5 |
| `SIBLING_AREA` | property → property | areaName مشترک | 0.3 |
| `CAUSES` | causal → causal | CausalEdgeRecord | abs(coefficient) |
| `PRECEDES` | temporal → temporal | ترتیب رویداد | 0.4 |
| `SAME_BRANCH` | person → person | شعبهٔ مشترک PM | 0.4 |

### ۲.۵ — قانون DAG (قید سفارش)

هر گرافِ خروجی باید DAG باشد — چرخه یعنی خطای داده یا منطق. دو گیت (الگوی موتور ۱۳):
1. **گیت ساخت:** هر یال تازه پیش از افزودن، با Kahn چرخه‌سنجی می‌شود؛ یالِ چرخه‌ساز = خطای fail-loud
2. **گیت بارگذاری:** هر گرافِ خوانده‌شده، پس از ساخت با Kahn تأیید می‌شود — چرخه = رد کل نتیجه

نکتهٔ ظریف: گرافِ دنیای واقعی می‌تواند ناهم‌جهت باشد (A مالک B و B مالک A در دادهٔ کثیف) — گیت دوم دقیقاً همین را می‌گیرد و با «رد مسیرِ چرخه‌دار» پاسخ می‌دهد نه کرش.

### ۲.۶ — الگوریتم پیمایش (شبه‌کد)

```
function unifiedVision(query):
  root = resolveNode(query.fromType, query.fromId)   # نرمال‌سازی شناسه
  if not root: return empty("شناسه شناخته نشد")

  frontier = [ {node: root, path: [], weight: 1.0} ]
  found = []
  seen = set()

  while frontier not empty:
    current = frontier.pop_min_depth()
    if depth(current) > maxDepth: continue
    for edge in outgoingEdges(current.node):
      next = edge.to
      if next in current.path.nodes: continue          # ضدچرخه درونی
      newPath = current.path + edge
      if isTerminal(next, query): found.append(newPath)
      if next not in seen: frontier.push(next)
    seen.add(current.node)

  paths = topK(found, by=weight, k=10)
  insights = narrate(paths, templates)                 # فصل ۶
  confidence = mean(weight(paths)) مقید به [0,1]
  assertDag(buildGraph(paths))                         # گیت دوم
  return { paths, insights, confidence }
```

### ۲.۷ — پنج مسیر استدلال (شاهد معیار سفارش)

پرسش معیار: «چرا خریدار X برای ملک Y مناسب است؟» — پنج مسیر انتظاری:
1. `X --REQUESTED_BY--> درخواستِ هم‌منطقه ← SIBLING_AREA --> Y`
2. `X --TRANSACTION_PARTY--> معاملهٔ قدیمی --ON--> ملکِ همسایه → SIBLING_AREA → Y`
3. `X --INTERACTED--> Y` (بازدید/تماس قبلی روی همین ملک)
4. `X ←SAME_BRANCH→ کارشناسِ Y` (کارشناسِ آگهی، همکار شعبهٔ خریدار است)
5. `X ←LISTED_BY→ کارشناسِ X --SAME_BRANCH→ کارشناسِ Y`

هر مسیر یافت‌شده، یک جملهٔ فارسی می‌سازد؛ مجموع جملات = پاسخ پرسش. این دقیقاً همان تجربه‌ای است که کارشناس می‌خواهد: «پنج دلیل، هرکدام یک خط».

---

## فصل ۳ — قرارداد Memory Lifecycle

### ۳.۱ — سه جدول (افزودنی — قانون ۸)

```prisma
/// PN-025 (فاز ۱۳-ج / ستون ۱) — رکورد چرخهٔ عمر حافظهٔ بلندمدت.
/// افزودنی صرف: صفر DROP · صفر DELETE · صفر تغییر ستون موجود.
model MemoryLifecycle {
  id               String   @id @default(cuid())
  /// hot | warm | cold — سطح حافظه (فصل ۱.۳)
  category         String
  /// شناسهٔ بستر — مثلاً کد ملک یا نرمال‌شدهٔ نام شخص
  itemId           String
  /// نوع بستر — property | person | request | transaction | advice | insight
  itemType         String
  lastAccessedAt   DateTime @default(now())
  accessCount      Int      @default(0)
  /// 0..1 — امتیاز اهمیت (فصل ۳.۳)
  importanceScore  Float    @default(0)
  /// برای hot→warm: شناسهٔ رکورد مقصد پس از ادغام (زنجیرهٔ تبار)
  consolidatedTo   String?
  createdAt        DateTime @default(now())

  @@unique([itemType, itemId])
  @@index([category, lastAccessedAt])
  @@index([importanceScore])
}

/// هر اجرای تثبیت شبانه — شاهد کامل و audit
model ConsolidationRun {
  id         String   @id @default(cuid())
  ranAt      DateTime @default(now())
  /// شمار ارتقای hot→warm
  hotToWarm  Int      @default(0)
  /// شمار تنزل warm→cold
  warmToCold Int      @default(0)
  /// شمار آرشیو نهایی (فقط رکوردهای mark-شده — داده حذف نمی‌شود)
  archived   Int      @default(0)
  /// مدت اجرا (ms)
  duration   Int      @default(0)
  /// { before: {hot,warm,cold}, after: {hot,warm,cold}, topPromoted: [...] }
  summary    Json?
  /// { thresholds, sampled: [...] } — بازتولیدپذیری
  evidence   Json?

  @@index([ranAt])
}

/// سیاست نگهداری هر سطح — قابل تنظیم بدون استقرار تازه
model RetentionPolicy {
  id            String    @id @default(cuid())
  /// hot | warm | cold
  category      String
  retentionDays Int
  /// none | gzip-json — فشرده‌سازی آینده (فعلاً none)
  compression   String?
  nextReviewAt  DateTime?
  appliedBy     String?

  @@unique([category])
}
```

### ۳.۲ — تصمیم‌های کلیدی اسکیمای

- **کلید یکتای `(itemType, itemId)`**: یک بستر فقط یک رکورد حافظه دارد — idempotent. ارتقای سطح یعنی `UPDATE category` نه رکورد تازه؛ `consolidatedTo` فقط برای زنجیرهٔ تبارِ audit.
- **`importanceScore` Float نه Int**: دقت پذیرش/تنزل (۰٫۷ و ۰٫۳) نیاز به اعشار دارد.
- **بدون حذف فیزیکی**: «آرشیو» یعنی `category='cold'` + `compression` در سیاست — رکورد می‌ماند (دکترین دادهٔ مقدس).
- **چرا سه جدول و نه یک جدول JSON**: تفکیک ConsolidationRun و RetentionPolicy از رکوردهای حافظه، یعنی سیاست و شاهد جدا از داده‌اند — تغییر سیاعت بدون دست‌زدن به داده.

### ۳.۳ — فرمول امتیاز اهمیت (importanceScore)

امتیاز هنگام هر دسترسی به‌روز می‌شود — ترکیب سه سیگنال:

```
importance = clamp01(
    0.40 × recency
  + 0.35 × frequency
  + 0.25 × outcomeLink
)

recency     = exp(-Δt / halfLife)     # halfLife = 48h (همان نیم‌عمر موتور ۱۲ — هم‌راستا)
frequency   = log(1 + accessCount) / log(1 + MAX_OBSERVED)   # نرمال درون‌داده
outcomeLink = 1 if بستر در معاملهٔ موفق نقش داشته else 0
```

سه وزن با ثابت‌های نام‌دار در کد تعریف می‌شوند و fail-loud اعتبارسنجی می‌شوند (جمع = ۱). نیم‌عمر ۴۸ ساعته با موتور توجه هم‌زبان است: چیزی که «تازه» است هم برای توجه و هم برای حافظه، وزن بیشتری دارد.

### ۳.۴ — API سطح حافظه

- `GET /api/admin/memory/stats` — شمار سه سطح + آخرین تثبیت + توزیع امتیاز (مالک‌محور، OWNER-only)
- دسترس داخلی سرویس: `touch(itemId, itemType)` — هر جا بستری در استدلال نقش خورد، صدا می‌شود
- خواندن در استدلال: فقط `hot` و `warm` به موتورها داده می‌شوند؛ `cold` فقط با فراخوانی صریح audit

---

## فصل ۴ — الگوریتم تثبیت (Consolidation)

### ۴.۱ — زمان‌بندی

کار Worker تازهٔ `memory-consolidation` — هر شب (پیش‌فرض ۲۴h، قابل تنظیم با `MELK_MEMORY_CONSOLIDATION_INTERVAL_H`). کلید خاموشی مستقل: `MELK_MEMORY_CONSOLIDATION=disabled`. با افزودن این کار، Worker به ۱۵ کار می‌رسد (قرارداد تستی به‌روز می‌شود).

### ۴.۲ — قواعد گذار (عین سفارش)

| گذار | شرط | کنش |
|------|-----|-----|
| hot → warm | عمر > ۷ روز **و** importanceScore ≥ ۰٫۷ | UPDATE category + ثبت در ConsolidationRun |
| hot → حذف از داغ | عمر > ۷ روز **و** امتیاز < ۰٫۷ | می‌ماند hot ولی candidate برای گزارش «فراموشی» — **رکورد حذف نمی‌شود**؛ اگر ۳۰ روز گذشت → cold |
| warm → cold | عمر > ۳۰ روز **و** importanceScore < ۰٫۳ | UPDATE category |
| هر سطح | دسترسی تازه (access) | به‌روزرسانی lastAccessedAt + افزایش accessCount → اگر cold بود و امتیاز جهید، بازگشت به warm (بیدار شدن) |

نکتهٔ مهم: «آرشیو نهایی» سفارش (فقط برای audit) همان سطح cold است — ما ستون `archived` در ConsolidationRun را برای شمارش ورودی‌های cold در آن اجرا می‌گذاریم، نه حذف فیزیکی.

### ۴.۳ — شبه‌کد تثبیت شبانه

```
function consolidate(db):
  t0 = now()
  before = countsByCategory()                     # شاهد قبل
  promoted = []
  for m in db.memoryLifecycle.findMany({ category: 'hot', lastAccessedAt < now()-7d }):
    if m.importanceScore >= 0.7:
      db.update(m, { category: 'warm' })
      promoted.push(m.id)
  demoted = []
  for m in db.memoryLifecycle.findMany({ category: 'warm', lastAccessedAt < now()-30d }):
    if m.importanceScore < 0.3:
      db.update(m, { category: 'cold' })
      demoted.push(m.id)
  awakened = []                                   # بیدار شدن از cold بر اثر دسترسی اخیر پرجهش
  for m in db.memoryLifecycle.findMany({ category: 'cold', lastAccessedAt > now()-2d }):
    if m.importanceScore >= 0.5: db.update(m, { category: 'warm' }); awakened.push(m.id)
  after = countsByCategory()                      # شاهد بعد
  db.consolidationRun.create({ hotToWarm, warmToCold, archived: awakened.length,
                               duration: now()-t0, summary: {before, after, topPromoted}, evidence: {thresholds} })
  audit('MEMORY_CONSOLIDATION', detail)           # AuditLog — بهترین‌تلاش
```

### ۴.۴ —保证 idempotency و بازتولیدپذیری

- اجرای دوباره در یک شب: گذارها idempotent‌اند (شرط‌های سنی دیگر برقرار نیستند) — دوباره اجرا صفر اثر دارد جز ConsolidationRun تازه.
- آستانه‌ها (۰٫۷ / ۰٫۳ / ۷ / ۳۰) در evidence هر اجرا ثبت می‌شوند — بازتولیدپذیری کامل.
- تثبیت هرگز به خطا نمی‌شکند: هر گذار در try/catchِ مستقل و خطا در evidence ثبت می‌شود (بهترین‌تلاش — الگوی backup-rotation).

---

## فصل ۵ — موتور ۱۶: مشاور تصمیم (DecisionAdvisor)

### ۵.۱ — قرارداد خروجی (عین سفارش)

```typescript
interface DecisionAdvice {
  decisionId: string;
  recommendation: string;   // «تماس بگیر» — فعل مشخص
  narrative: string;        // فارسی، ۳-۵ جمله
  confidence: number;      // 0..1
  basedOn: {
    attention?: string;      // شاهد از موتور ۱۲
    causal?: string;         // شاهد از موتور ۱۳ (do(...))
    counterfactual?: string; // شاهد از موتور ۱۴ («اگر ... می‌شد»)
    simulation?: string;      // شاهد از موتور ۱۵ (مقایسهٔ اقدام‌ها)
  };
  alternatives: DecisionAlternative[];  // ≥۳ — همیشه
  risk: 'low' | 'medium' | 'high';
  expiresAt: string;        // TTL — فصل ۷
  requiresApproval: true;   // قید لفظی TypeScript
  autoExecute: false;       // قید لفظی TypeScript — قانون ۱۱ ابدی
}
```

`requiresApproval: true` و `autoExecute: false` به‌صورت **literal type** تعریف می‌شوند (نه boolean ساده) — کامپایلر اجازهٔ مقدار دیگر نمی‌دهد. این همان الگوی اثبات‌شدهٔ موتور ۱۵ است.

### ۵.۲ — معماری: خواندن از ۱۵ موتور، صفر LLM

جریان تولید مشوره:

1. **ورودی**: `predictionId | context` (کد ملک / کد درخواست / شناسهٔ مشتری + کاشی مبدأ)
2. **جمع‌آوری**: سرویس مشاور (لایهٔ DB مجاز) از منابع می‌خواند:
   - موتور ۱۲: نمرهٔ توجه بستر + دلیل
   - موتور ۱۳: آخرین مداخلهٔ معتبر (do(hasImage)=+…)
   - موتور ۱۴: سناریوهای L3 مرتبط (کاهش قیمت ۵/۱۰٪)
   - موتور ۱۵: جدول مقایسهٔ اقدام‌های استاندارد
   - حافظه: سابقهٔ این بستر (چند بار دیده شده، آخرین دسترسی)
   - بینایی: مسیرهای ارتباطی (اگر پرسش طرف‌به‌طرف بود)
3. **سناریوسازی**: برای هر «اقدام مرتبط» (زنگ بزن، تصویر اضافه کن، قیمت کم کن، بازنشر کن) امتیاز ترکیبی می‌سازد:

```
actionScore = w1×attentionDelta + w2×causalDelta + w3×cfDelta + w4×simDelta - w5×recencyPenalty
```

4. **گزینش**: برترین اقدام = توصیه؛ سه اقدام بعدی = بدیل‌ها
5. **روایت**: قالب فارسی فصل ۶ با متغیرهای واقعی — صفر LLM، صفر فراخوانی خارجی
6. **کمربند**: پیش از بازگشت، DecisionLock چک می‌شود (فصل ۷) — اگر رد شد، `locked:true` + پیام علت برمی‌گردد

### ۵.۳ — سطح ریسک

`risk = 'high'` اگر هر کدام: امتیاز < ۰٫۴ · دادهٔ شاهد ناقص (یکی از موتورها خاموش) · موضوع قیمت (حساس مالی). در غیر این صورت `medium` اگر امتیاز < ۰٫۷ وگرنه `low`.

### ۵.۴ — قید خلوص

`src/core/intelligence/decision-advisor.ts` **خالص** است: صفر import از `@/lib/db`، صفر fetch — فقط نوع‌ها و توابع خالص (ورودی = دادهٔ گردآوری‌شده، خروجی = DecisionAdvice). گردآوری در `src/lib/services/decision-advisor-service.ts` (الگوی meta-mind-service / self-diagnosis-service). گارد audit-intelligence-boundary همین را می‌گیرد.

---

## فصل ۶ — کتابخانهٔ قالب‌های روایت فارسی (۲۴ قالب)

هر قالب = رشتهٔ ثابت با جاهای `{var}`. تابع `narrate(templateId, vars)` جای‌گذاری می‌کند و fail-loud برای متغیر گم‌شده. هیچ قالبی دادهٔ خام عددی بدون قالب‌بندی فارسی (faNumber/faDigits) نشان نمی‌دهد.

### ۶.۱ — قالب‌های توصیهٔ اصلی (۸)

```
T_CALL_BUYER        «به {buyerName} زنگ بزن — احتمال پاسخ‌گویی {probability}٪. دلیل: {reason}»
T_CALL_OWNER        «با مالکِ {propertyCode} تماس بگیر — {reason}»
T_ADD_IMAGE         «برای آگهی {propertyCode} نخستین عکس را بگذار — اثر بر احتمال معامله: {delta} واحد»
T_PRICE_CUT         «قیمت {propertyCode} را {percent}٪ کم کن — سناریوی پادواقع: {scenario}»
T_REPOST            «آگهی {propertyCode} را بازنشر کن — بازدید به میانهٔ بازار می‌رسد»
T_MATCH_INFORM      «این آگهی را به {buyerName} پیشنهاد بده — {pathCount} مسیر ارتباطی یافت شد»
T_FOLLOWUP          «پیگیریِ {buyerName} سر رسیده — آخرین تماس {daysAgo} روز پیش بود»
T_ARCHIVE_NOTE      «پروندهٔ {itemId} آرشیو شد — امتیاز اهمیت زیر آستانه افتاد»
```

### ۶.۲ — قالب‌های شاهد و دلیل (۸)

```
E_ATTENTION_TOP     «آگهی {propertyCode} امروز نمرهٔ توجه {score} دارد ({reason})»
E_CAUSAL_DO         «اثر {action} بر احتمال معامله: {delta} واحد (گراف علّی، {n} نمونه)»
E_COUNTERFACTUAL    «اگر {action} می‌شد، احتمال {change} بود — نه آنچه واقع شد»
E_SIMULATION_BEST   «در مقایسهٔ چهار اقدام، «{best}» بالاترین امتیاز را دارد»
E_MEMORY_SEEN        «این بستر تاکنون {count} بار در استدلال نقش داشته (آخرین: {lastAt})»
E_GRAPH_PATH        «{from} از مسیر {via} به {to} وصل است — وزن مسیر {weight}»
E_MARKET_TREND      «شاخص منطقهٔ {area} در {horizon} روز اخیر {trend}٪ تغییر کرده»
E_DATA_MISSING      «شاهد کافی نیست — توصیه با اطمینان پایین (risk=high)»
```

### ۶.۳ — قالب‌های کمربند و احترام (۸)

```
L_TTL_EXPIRED       «این توصیه منقضی شده — برای توصیهٔ تازه، وضعیت را به‌روز کن»
L_COOLDOWN_ACTIVE   «توصیهٔ مشابه {category} برای این بستر {hours} ساعت دیگر قابل ارائه است»
L_RATE_LIMIT        «سقف توصیه‌های امروز پر شده — فردا صبح اولین توصیه همین‌جا است»
L_REQUIRES_APPROVAL «این توصیه نیازمند تأیید شماست — سامانه هرگز خودش اجرا نمی‌کند»
L_NO_SPAM           «توصیهٔ قبلی هنوز معتبر است — تا انقضا تکرار نمی‌شود»
L_UPDATED_SINCE     «وضعیت از توصیهٔ قبلی تغییر کرده — توصیهٔ تازه ساخته شد»
L_RISK_HIGH         «ریسک بالا: {reason} — با احتیاط و تأیید انسانی»
L_ASLEEP            «مغز برای این بستر فعلاً ساکت است — چون توصیهٔ معتبری سر جایش است»
```

### ۶.۴ — قواعد زبانی

- **۳ تا ۵ جمله** در narrative — نه بیشتر (احترام به شناخت کارشناس)
- **فعل معلوم** اول جمله («زنگ بزن» نه «تماس گرفته شود»)
- **عدد فارسی** همیشه (faNumber) و درصد با «٪» فارسی
- **صفر اصطلاح انگلیسی** در روایت کارشناس‌محور — نام‌های فنی فقط در بخش شاهد فنی
- هر قالب قبل از ادغام، تست خوانایی و کامل‌بودن متغیرها می‌گیرد

---

## فصل ۷ — کمربند ایمنی (Time Lock سه‌سطحی)

### ۷.۱ — قرارداد (عین سفارش)

```typescript
interface DecisionLock {
  decisionId: string;
  category: string;                    // CALL | PRICE | IMAGE | REPOST | MATCH | FOLLOWUP
  ttl: 7 * 24 * 3600;                  // ۷ روز — literal type
  cooldownHours: 48;                   // ۴۸ ساعت — literal type
  rateLimit: { perDay: 10; perCategory: 3 };  // سقف روزانه/دسته‌ای — literal type
}
```

### ۷.۲ — سه قفل و ترتیب ارزیابی

ارزیابی همیشه به‌ترتیب: **TTL → Cooldown → RateLimit** (ارزان‌ترین و قطعی‌ترین اول):

1. **TTL (انقضای هفت‌روزه):** توصیه‌ای که `expiresAt` اش گذشته، دیگر هرگز ارائه نمی‌شود — فقط برای audit نگه داشته می‌شود. پرسش تازه = توصیهٔ تازه (نه بازیافت توصیهٔ مرده).
2. **Cooldown (۴۸ ساعت هم‌دسته):** اگر برای همان بستر، توصیه‌ای از همان دسته در ۴۸ ساعت اخیر ارائه شده، توصیهٔ جدید «رد» می‌شود — نه چون بد است، چون تکرار است. استثنا: اگر دادهٔ شاهد تغییر معنادار کرده باشد (مثلاً قیمت ملک عوض شده)، Cooldown کنار می‌رود و `L_UPDATED_SINCE` روایت می‌شود.
3. **RateLimit (۱۰/روز + ۳/دسته):** سقف روزانه به ازای هر کارشناس. پر شدن سقف = `L_RATE_LIMIT` — بدون استثنا (قید سفارش: «صبر تا فردا»).

### ۷.۳ — قفل نوعی صفر-اجرا

```typescript
type NeverExecute = { autoExecute: false; requiresApproval: true };
interface DecisionAdvice extends NeverExecute { /* ... */ }
```

- تلاش برای `autoExecute: true` ⇒ خطای کامپایل — نه runtime، کامپایل
- هیچ مسیری در کد پایگاه (route/service) وجود ندارد که خروجی مشاور را به کنش واقعی (ایجاد رکورد/تماس/ویرایش) برساند — این با گارد audit-decision-lock (بخش ۱۰) مکانیکی تست می‌شود: اسکن الگوی `autoExecute` و یال‌های اجرا.

### ۷.۴ — ثبت و Audit

- هر **رد**: AuditLog با `action='DECISION_LOCKED'` + علت (ttl|cooldown|rate) + بستر
- هر **پذیرش**: توصیه در جدول حافظه (`itemType='advice'`) ثبت می‌شود تا چرخهٔ عمر بگیرد — توصیه‌ها هم خاطره‌اند
- خواندن گاردها: `audit-decision-lock.sh` — وجود سه قفل + رد تاریخ‌گذشته + سقف‌ها را می‌سنجد

---

## فصل ۸ — اتصال به سه کاشی حیاتی

### ۸.۱ — مؤلفهٔ مشترک: AdviceCard

مؤلفهٔ React سبک (Server-friendly) که در سه کاشی رندر می‌شود:

```
┌─────────────────────────────────────────┐
│ 💠 توصیهٔ مغز ملکا          [ریسک: کم]  │
│ به خریدار احمدی زنگ بزن — احتمال ۷۵٪     │
│ چون: بازدید اخیر + کارشناس مشترک         │
│ بدیل‌ها: تصویر اضافه کن · بازنشر · صبر   │
│ [تأیید می‌کنم]   [بدیل بعدی]             │
└─────────────────────────────────────────┘
```

- دکمهٔ «تأیید می‌کنم» **هیچ کاری جز ثبت AuditLog نمی‌کند** (`requiresApproval`) — خروجی صرفاً «دیدم/پذیرفتم» است
- حالت قفل: به‌جای توصیه، پیام کمربند (`L_*`) با تایمر باقی‌مانده
- WCAG AA: کنتراست نشان ریسک از پالت رجیستری (low=emerald · medium=amber · high=rose)

### ۸.۲ — M5 تطبیق هوشمند

- **API:** `GET /api/smart-matching/advice?propertyCode=…&requestCode=…`
- **محتوا:** برای هر جفتِ برترِ فهرست تطبیق، مشاور یک `DecisionAdvice` می‌سازد: «این آگهی را به این ۳ خریدار پیشنهاد بده — با دلیل» (دلیل = مسیرهای بینایی + شواهد موتورها)
- **UI:** AdviceCard در بالای هر کارت تطبیق برتر (سه جفت اول) — بقیه فهرست دست‌نخورده

### ۸.۳ — فایل‌یابی ملکا

- **API:** `GET /api/file-finder/advice?propertyCode=…`
- **محتوا:** «این فایل را با این ۵ مالک مطابقت بده — با امتیاز علّی» — مشاور فهرست کاندیدای هم‌شکل (هم‌منطقه/هم-متراژ/هم-دسته) را با شواهد علّی رتبه می‌کند
- **UI:** AdviceCard کنار جزئیات فایل — روایت چرا این ۵

### ۸.۴ — M7 شاخص بازار

- **API:** `GET /api/market-index/advice?area=…`
- **محتوا:** هشدار تصمیم بازار: «فردا قیمت منطقهٔ ولیعصر ۳٪ افزایش دارد — چون ...» (روند شاخص + فشار عرضه/تقاضا از موتور ۱۵)
- **UI:** AdviceCard در سربرگ شاخص منطقهٔ منتخب

### ۸.۵ — API عمومی مشاور (برای هر سه)

`GET /api/admin/decision-advisor?context=…` — OWNER-only، خروجی `DecisionAdvice | { locked: true, reason }`. سه روت کاشی، سرویس مشترک `decision-advisor-service` را صدا می‌زنند با context متفاوت — بدون تکرار منطق.

---

## فصل ۹ — تست، گارد و WCAG

### ۹.۱ — ماتریس تست (۸۰ تازه — هدف ≥۸۰)

| بخش | شمار | پوشش |
|-----|------|------|
| حافظه | ۲۰ | امتیاز اهمیت · گذارها (۷روز/۰٫۷ — ۳۰روز/۰٫۳) · بیداری cold · idempotency تثبیت · شاهد ConsolidationRun · RetentionPolicy · API stats (نقش‌ها) |
| بینایی | ۲۰ | پنج مسیر معیار · DAG دو-گیت · سقف عمق · وزن مسیر · insights فارسی · شناسه ناشناخته · خروجی خالی صادقانه |
| موتور ۱۶ | ۲۰ | قرارداد (literal types) · ۲۴ قالب (متغیر کامل/گم‌شده) · سناریوسازی و گزینش · سطح ریسک · صفر LLM (اسکن fetch) · بدیل ≥۳ |
| کمربند | ۲۰ | TTL منقضی · Cooldown فعال/گذشته · استثنا تغییر داده · RateLimit سقف · AuditLog هر رد · قفل نوعی کامپایل |
| ادغام UI | (فراتر از ۸۰ — شامل موارد بالا در یکپارچگی) | AdviceCard سه کاشی · حالت قفل · WCAG نشان ریسک |

### ۹.۲ — سه گارد تازه (مجموع ۳۰)

1. **audit-memory-lifecycle.sh** — سه سطح + retention + شمار رکورد > 0 + آخرین ConsolidationRun سالم
2. **audit-unified-graph.sh** — DAG (Kahn مستقل) + صفر cycle + سقف عمق رعایت + قالب‌های insight موجود
3. **audit-decision-lock.sh** — TTL/Cooldown/RateLimit در کد + `autoExecute: false` لفظی + صفر مسیر اجرا + هر رد AuditLog دارد

### ۹.۳ — دریل منفی (قانون مرحلهٔ ۱۰)

- cycle مصنوعی در گراف ⇒ گارد بینایی قرمز
- توصیه با TTL منقضی در fixture ⇒ گارد کمربند قرمز
- spam (۱۱ توصیه در روز برای یک کارشناس) ⇒ گارد کمربند قرمز

### ۹.۴ — WCAG AA

رنگ‌های AdviceCard از رجیستری معنایی موجود می‌آیند (فقط-کلاس، بدون رنگ خام) — همان الگوی قانون ۱۲ که نگین PN-024 هم رعایت کرد. متن روی زمینه در هر دو تم با نسبت ≥ ۴٫۵ (سبک آزمون p6530).

---

## فصل ۱۰ — ریسک، بدیل و مسیر رشد

### ۱۰.۱ — ریسک‌ها و بدیل‌ها

| # | ریسک | احتمال | اثر | بدیل |
|---|------|--------|-----|------|
| ۱ | ENOSPC ششم حین بیلد | متوسط | 🟠 | پارک اتمی J1 (آزموده در آتش واقعی PN-024) + هرس درس ۹ |
| ۲ | اشباع L3 در سناریوهای تازه | متوسط | 🟡 | قرارداد z-score موتور ۱۴ + مانیتور گارد K1 |
| ۳ | نامتوازنی حافظه (hot متورم) | متوسط | 🟠 | RetentionPolicy + تثبیت شبانه + گارد سطح‌ها |
| ۴ | spam تصمیم | بالا | 🟠 | کمربند سه‌سطحی + گارد + دریل منفی |
| ۵ | چرخه در گراف یکپارچه | کم | 🔴 | Kahn دو-گیت + گارد + دریل منفی |
| ۶ | هزینهٔ پرس‌وجوی بینایی روی دادهٔ ملی | کم (اکنون) | 🟡 | لایهٔ کش میان‌دور در فاز بعد — رابط تغییر نمی‌کند |
| ۷ | قالب‌های فارسی گنگ | کم | 🟡 | تست خوانایی + بازخورد مالک در جلسهٔ review |

### ۱۰.۲ — خروج اضطراری (بدون خطر)

هر چهار ستون **افزودنی**‌اند: اگر فردا مشاور خاموش شود، حافظه/بینایی/کمربند بدون هیچ مصرف‌کننده‌ای کار خود را ادامه می‌دهند و سه کاشی دقیقاً به وضعیت قبل برمی‌گردند (AdviceCard شرطی رندر می‌شود). اگر کل فاز برگردد، سه جدول تازه صفر مصرف‌کنندهٔ حیاتی دارند — حذف منطقی بدون حذف فیزیکی (دادهٔ مقدس).

### ۱۰.۳ — مسیر رشد (پس از PN-025)

- **حافظهٔ معنایی**: تثبیت بعدی = خلاصه‌سازی رویداد به «یک خاطره» (فشرده‌سازی JSON در RetentionPolicy — ستون compression از امروز مهیاست)
- **بینایی ملی**: کش میان‌دور + شاردینگ منطقه‌ای
- **مشاور یادگیرنده**: وزن‌های actionScore از حافظهٔ بازخورد کارشناسان تنظیم می‌شود (پس از گردآوری ۱۰۰ تأیید واقعی — نه زودتر)
- **کمربند تطبیقی**: TTL/Cooldown از رفتار پذیرش واقعی یاد می‌گیرد — اما هرگز زیر حداقل احترام (۴۸ ساعت) نمی‌رود

---

## پیوست الف — نقشهٔ فایل‌های تازه

```
prisma/schema.prisma                                    +۳ مدل (MemoryLifecycle, ConsolidationRun, RetentionPolicy)
src/core/intelligence/memory-lifecycle.ts               خالص — امتیاز اهمیت + قواعد گذار
src/core/intelligence/unified-graph.ts                  خالص — پیمایش + DAG + وزن
src/core/intelligence/decision-advisor.ts               خالص — موتور ۱۶ + سناریوسازی
src/core/intelligence/decision-templates.ts             خالص — ۲۴ قالب روایت فارسی
src/core/intelligence/decision-lock.ts                  خالص — کمربند سه‌سطحی + قفل نوعی
src/lib/services/memory-lifecycle-service.ts             DB — touch/stats/تثبیت
src/lib/services/decision-advisor-service.ts            DB — گردآوری از ۱۵ موتور + بینایی + حافظه
src/lib/services/unified-graph-service.ts                DB — رزولو شناسه + ساخت یال از رکوردها
src/core/runtime/jobs.ts                                +کار memory-consolidation (Worker ۱۵کار)
src/app/api/admin/memory/stats/route.ts                 OWNER-only
src/app/api/admin/decision-advisor/route.ts             OWNER-only
src/app/api/smart-matching/advice/route.ts              کاشی M5
src/app/api/file-finder/advice/route.ts                 کاشی فایل‌یابی
src/app/api/market-index/advice/route.ts                کاشی M7
src/core/tiles/tiles/smart-matching/AdviceCard.tsx       UI (در صورت نیاز محلی) — یا shared
src/components/app/shared/AdviceCard.tsx                 UI مشترک سه کاشی
scripts/audit-memory-lifecycle.sh                       گارد ۲۸
scripts/audit-unified-graph.sh                         گارد ۲۹
scripts/audit-decision-lock.sh                         گارد ۳۰
tests/pn025-meta-mind.test.ts                           ۸۰ تست
docs/PHASE13-C-MEMORY-VISION-ADVISOR-LOCK-DESIGN.md     همین سند
```

## پیوست ب — چک‌لیست دروازهٔ پایانی (سفارش ۱۱.۲)

```
□ Fingerprint = HEAD
□ tsc ×۲ (app + scripts) صفر
□ lint صفر
□ تست ×۲ یکسان ≥ ۲۵۰۰
□ ۳۰ گارد PASS
□ Build + chunk-integrity
□ BUILD_ID = HEAD + ری‌استارت
□ M1-M5 + فایل‌یابی + M7 همه ۲۰۰ (نشست واقعی مالک)
□ صفر LLM call · صفر auto_execute
□ chainIndex = ۲۵
```

---

## پیوست ج — ماتریس کامل تست‌های PN-025 (۸۰ مورد — جزء‌به‌جزء)

### ج.۱ — حافظه (۲۰ تست)

| # | نام تست | ورودی | خروجی مورد انتظار |
|---|---------|-------|------------------|
| M۱ | امتیاز اهمیت — تازه و پرتکرار | Δt=1h, count=20, outcome=1 | score > 0.8 |
| M۲ | امتیاز — کهنه و کم‌دسترس | Δt=200h, count=1, outcome=0 | score < 0.2 |
| M۳ | کلمپ صفر و یک | ورودی‌های حدی | score ∈ [0,1] |
| M۴ | گذار hot→warm برقرار | عمر ۸ روز، امتیاز ۰٫۸ | category=«warm» |
| M۵ | گذار hot→warm رد (امتیاز) | عمر ۸ روز، امتیاز ۰٫۵ | می‌ماند hot |
| M۶ | گذار hot→warm رد (عمر) | عمر ۳ روز، امتیاز ۰٫۹ | می‌ماند hot |
| M۷ | گذار warm→cold برقرار | عمر ۳۵ روز، امتیاز ۰٫۲ | category=«cold» |
| M۸ | گذار warm→cold رد (امتیاز) | عمر ۳۵ روز، امتیاز ۰٫۵ | می‌ماند warm |
| M۹ | بیداری cold→warm | دسترسی اخیر + جهش امتیاز ≥۰٫۵ | category=«warm» |
| M۱۰ | idempotency تثبیت | اجرای دوباره روی خروجی اجرای اول | صفر گذار تازه |
| M۱۱ | شاهد ConsolidationRun | پس از تثبیت | رکورد با before/after/topPromoted |
| M۱۲ | مدت اجرا ثبت | هر اجرا | duration > 0 |
| M۱۳ | آستانه‌ها در evidence | هر اجرا | {0.7, 0.3, 7d, 30d} ثبت |
| M۱۴ | RetentionPolicy پیش‌فرض | seed | سه ردیف hot/warm/cold |
| M۱۵ | سیاست — تغییر retentionDays | آپدیت 14→30 | نسل بعد اجرا با ۳۰ |
| M۱۶ | API stats — نقش OWNER | GET /api/admin/memory/stats | 200 + سه سطح + آخرین اجرا |
| M۱۷ | API stats — CONSULTANT | همان GET | 403 |
| M۱۸ | API stats — بدون توکن | همان GET | 401 |
| M۱۹ | کلید یکتا | دو touch با یک itemType+itemId | یک رکورد، accessCount=2 |
| M۲۰ | خلوص لایهٔ هوش | اسکن import فایل memory-lifecycle.ts | صفر @/lib/db و صفر fetch |

### ج.۲ — بینایی (۲۰ تست)

| # | نام تست | ورودی | خروجی مورد انتظار |
|---|---------|-------|------------------|
| V۱ | پنج مسیر معیار — درخواست هم‌منطقه | خریدار X + ملک Y هم‌منطقه | مسیر ۱ یافت + insight فارسی |
| V۲ | مسیر معاملهٔ قدیمی | معاملهٔ X روی ملک همسایه | مسیر ۲ یافت |
| V۳ | مسیر بازدید قبلی | InteractionRecord موجود | مسیر ۳ یافت |
| V۴ | مسیر کارشناس مشترک | شعبهٔ یکسان PM | مسیر ۴ یافت |
| V۵ | مسیر کارشناس آگهی‌گذار | realtor هم‌شعبه | مسیر ۵ یافت |
| V۶ | DAG گیت ساخت | یال چرخه‌ساز | خطای fail-loud |
| V۷ | DAG گیت بارگذاری | گراف چرخه‌دار تزریقی | رد کامل نتیجه |
| V۸ | سقف عمق | maxDepth=2 | هیچ مسیر عمیق‌تر از ۲ |
| V۹ | پیش‌فرض عمق ۳ | بدون maxDepth | عمق ≤ ۳ |
| V۱۰ | سقف سخت ۵ | maxDepth=99 | عمق ≤ ۵ (clamp) |
| V۱۱ | وزن مسیر | یال‌های وزن ۰٫۹+۰٫۸ | وزن مسیر = ضرب/میانگین تعریف‌شده |
| V۱۲ | اطمینان در [0,1] | هر خروجی | confidence کلمپ |
| V۱۳ | شناسه ناشناخته | fromId غیرواقعی | خروجی خالی صادقانه + insight «شناخته نشد» |
| V۱۴ | pathTypes فیلتر | فقط OWNED_BY | فقط مسیرهای مالکیت |
| V۱۵ | topK برترین مسیر | ۱۵ مسیر | حداکثر ۱۰ مسیر مرتب |
| V۱۶ | insights فارسی — قالب | هر مسیر | جمله از قالب‌های فصل ۶ |
| V۱۷ | عدد فارسی در insight | وزن ۰٫۸۷ | «۰٫۸۷» با ارقام فارسی |
| V۱۸ | صفر رکورد = صفر مسیر | DB خالی تزریقی | paths=[] بدون خطا |
| V۱۹ | رزولو نرمال‌شدهٔ نام | «احمدی » با فاصله | همان گره «احمدی» |
| V۲۰ | خلوص لایهٔ هوش | اسکن import unified-graph.ts | صفر DB/fetch |

### ج.۳ — موتور ۱۶ (۲۰ تست)

| # | نام تست | ورودی | خروجی مورد انتظار |
|---|---------|-------|------------------|
| A۱ | قید لفظی autoExecute | type-check | false تنها مقدار مجاز |
| A۲ | قید لفظی requiresApproval | type-check | true تنها مقدار مجاز |
| A۳ | ۲۴ قالب — متغیر کامل | هر قالب با vars کامل | روایت بدون {var} باقی‌مانده |
| A۴ | قالب — متغیر گم‌شده | قالب بدون یک var | خطای fail-loud |
| A۵ | گزینش برترین اقدام | چهار اقدام با امتیاز متفاوت | بیشینه = توصیه |
| A۶ | بدیل‌ها ≥۳ | هر خروجی | alternatives.length ≥ 3 |
| A۷ | امتیاز ترکیبی — وزن‌ها | شواهد کنترل‌شده | ترتیب درست اقدام‌ها |
| A۸ | ریسک high — امتیاز کم | امتیاز ۰٫۳ | risk=«high» |
| A۹ | ریسک high — شاهد ناقص | موتور علّیت خاموش | risk=«high» + E_DATA_MISSING |
| A۱۰ | ریسک high — موضوع قیمت | اقدام PRICE_* | risk=«high» |
| A۱۱ | ریسک low — همه سالم | امتیاز ۰٫۸ + شواهد کامل | risk=«low» |
| A۱۲ | روایت ۳-۵ جمله | هر narrative | شمار جمله در بازه |
| A۱۳ | صفر LLM | اسکن fetch/axios/openai در ماژول | صفر فراخوانی خارجی |
| A۱۴ | شمارهٔ تصمیم یکتا | دو فراخوانی | decisionId متفاوت |
| A۱۵ | expiresAt = امروز+۷ | هر خروجی | فاصله ۷±۰٫۰۱ روز |
| A۱۶ | basedOn فقط شواهد معتبر | شواهد ناقص | کلیدهای موجود فقط |
| A۱۷ | دقت اعشار اعداد فارسی | faNumber در روایت | «۷۵٪» نه «75%» |
| A۱۸ | خلوص لایهٔ هوش | اسکن import decision-advisor.ts | صفر DB/fetch |
| A۱۹ | سناریوسازی — چهار اقدام استاندارد | context کامل | هر چهار امتیاز دارند |
| A۲۰ | توصیهٔ خالی صادقانه | بدون هیچ شاهدی | خروجی «شاهد کافی نیست» نه سکوت |

### ج.۴ — کمربند (۲۰ تست)

| # | نام تست | ورودی | خروجی مورد انتظار |
|---|---------|-------|------------------|
| L۱ | TTL منقضی رد | توصیه ۸ روز قبل | رد + L_TTL_EXPIRED |
| L۲ | TTL معتبر عبور | توصیه ۲ روز قبل | ارائه |
| L۳ | Cooldown فعال رد | هم‌دسته ۱۰ ساعت قبل | رد + L_COOLDOWN_ACTIVE |
| L۴ | Cooldown گذشته عبور | هم‌دسته ۴۹ ساعت قبل | ارائه |
| L۵ | استثنا تغییر داده | قیمت عوض شده در ۴۸h | Cooldown کنار + L_UPDATED_SINCE |
| L۶ | استثنا برنمی‌خورد | قیمت ثابت | Cooldown پابرجا |
| L۷ | RateLimit روزانه | توصیهٔ ۱۱م روز | رد + L_RATE_LIMIT |
| L۸ | RateLimit دسته‌ای | توصیهٔ ۴م هم‌دسته | رد |
| L۹ | شمارش روزانه refresh | روز تازه | شمارش صفر |
| L۱۰ | ترتیب ارزیابی TTL اول | TTL+Cooldown هر دو فعال | علت گزارش‌شده = ttl |
| L۱۱ | AuditLog هر رد | هر رد | رکورد DECISION_LOCKED |
| L۱۲ | AuditLog علت دارد | هر رد | detail شامل ttl|cooldown|rate |
| L۱۳ | توصیه پذیرفته‌شده در حافظه | پس از پذیرش | رکورد itemType=advice |
| L۱۴ | توصیه منقضی فقط audit | پرسش مجدد | ارائه نمی‌شود، رکورد هست |
| L۱۵ | قفل نوعی — کد | اسکن autoExecute در خروجی | همیشه false لفظی |
| L۱۶ | صفر مسیر اجرا | اسکن روت‌ها برای کنش واقعی از خروجی مشاور | هیچ |
| L۱۷ | هر دسته کد دارد | CALL/PRICE/IMAGE/REPOST/MATCH/FOLLOWUP | همه شناخته‌شده |
| L۱۸ | کمربند در API کاشی M5 | پرسش پشت‌سرهم | دومی locked |
| L۱۹ | کمربند در API فایل‌یابی | همان | همان |
| L۲۰ | کمربند در API M7 | همان | همان |

### ج.۵ — ادغام UI (فراتر از ۸۰ — در همان فایل)

| # | نام تست | خروجی مورد انتظار |
|---|---------|------------------|
| U۱ | AdviceCard در هر سه کاشی | import موجود در هر سه صفحه |
| U۲ | حالت قفل | پیام L_* رندر می‌شود |
| U۳ | WCAG نشان ریسک | کلاس از رجیستری (emerald/amber/rose) |
| U۴ | دکمهٔ تأیید | فقط AuditLog — صفر کنش دیگر |
| U۵ | API نقش OWNER-only | CONSULTANT → 403 |

---

## پیوست د — کار Worker تثبیت (مشخصات اجرایی)

```yaml
id: memory-consolidation
title: تثبیت شبانهٔ حافظهٔ بلندمدت (PN-025/ستون ۱)
intervalMs: 24h (پیش‌فرض — MELK_MEMORY_CONSOLIDATION_INTERVAL_H)
firstRunDelayMs: 5 دقیقه پس از بوت (نخستین تثبیت سریع — اما محدود به ۵۰۰ رکورد)
killSwitch: MELK_MEMORY_CONSOLIDATION=disabled
contract:
  - Worker ۱۵کار می‌شود (از ۱۴) — قرارداد تستی pn010 به‌روز می‌شود
  - اجرا بهترین‌تلاش: خطای یک گذار، بقیه را نمی‌شکند
  - شاهد: ConsolidationRun در هر اجرا + AuditLog MEMORY_CONSOLIDATION
  - سقف رکورد در هر اجرا: ۵۰۰۰ (حفاظت از شب‌های اولیهٔ سنگین)
```

## پیوست هـ — ردیابی قوانین ساختاری سفارش درون این سند

| اصل سفارش | محل درون این سند |
|-----------|------------------|
| قفل نسخه / توقف | فصل ۱.۴ + پیوست ب |
| افزودنی Schema | فصل ۳.۱ |
| خالص بودن موتور | فصل ۳.۴ · ۵.۴ |
| DAG اجباری | فصل ۲.۵ |
| صفر LLM | فصل ۵.۱ · ۶ |
| قفل نوعی | فصل ۵.۱ · ۷.۳ |
| ترتیب ارزیابی کمربند | فصل ۷.۲ |
| دو-سبز پیاپی | پیوست ب |
| دریل منفی | فصل ۹.۳ |
| M1-M5 + سه حیاتی | پیوست ب |
