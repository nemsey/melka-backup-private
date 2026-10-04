
---

# فصل ۷ — فهرست کامل بینش‌ها (Insights Catalog)

> **ساختار فنی:** هر ایجنت `computeRawInsights(): InsightCard[]` را پیاده می‌کند. `InsightCard` شامل `key` (کلید پایدار)، `domain` (دسته)، `title`، `body` (متن فارسی گویا)، `severity` (info/positive/warning/critical)، و `metrics[]` (چیپ‌های عددی) است (`src/core/agent/base-agent.ts`). وزن نمایش هر بینش از سیاست نسخه‌بندی‌شدهٔ همان کاشی می‌آید (فصل ۱۲).

## ۷٫۱ — جدول کلان بینش‌ها به تفکیک کاشی

### M1 — آگهی ملک تبریز (`arm-listing-agent.ts`)

| نام بینش | دامنه | فرمول/منطق | آستانه/رنگ | نمونهٔ خروجی |
|---|---|---|---|---|
| حجم رجیستری آگهی‌ها | VOLUME | `countEnrichment()` → کل/تکمیل/در انتظار + درصد پوشش تماس مالک | info — خاکستری-سبز | «کاتالوگ … آگهی را در بر می‌گیرد؛ …٪ تکمیل تماس مالک» |
| کارشناسان پرآگهی (۱۰ برتر) | TOP_EXPERTS | نمونهٔ ۲۰۰۰ جدیدترین ردیف → `groupBy realtorName` → sort desc → top 10 | positive برای صدر | جدول + متن «فلانی با n آگهی در صدر» |
| توزیع منطقه‌ای | REGION | `groupBy areaName` روی همان نمونه → نقشهٔ مناطق داغ | warning اگر تمرکز >۴۰٪ یک منطقه | «بیشترین تمرکز در منطقهٔ X» |
| پوشش اطلاعات فهرست | COVERAGE | `buildCoverageInsight()` روی ۱۶ ستون → درصد پر هر ستون | critical برای ستون <۵۰٪ | جدول پوشش + توصیهٔ غنی‌سازی |
| تازگی ثبت | FRESHNESS | `createdAt` جدیدترین vs میانگین ماهانه | info/warning | «آخرین آگهی امروز ثبت شده» |
| آگهی‌های پربازدید | VISIT_ATTENTION | `mostVisitedProperties(visits, 3)` — مهاجرت از کاشی حذف‌شدهٔ بازدیدها (P6.5-11/ج) | positive اگر count≥2 | «آگهی کد … با n بازدید پربازدیدترین است» |

### M2 — درخواست ملک تبریز (`arm-request-agent.ts`)

| نام بینش | دامنه | فرمول/منطق | آستانه/رنگ |
|---|---|---|---|
| قیف وضعیت درخواست‌ها | FUNNEL | `groupBy status` روی شش وضعیت ARM → درصد هر مرحله | warning اگر افت بین مراحل >۵۰٪ |
| گلوگاه قیف | BOTTLENECK | بیشترین افت مابین دو مرحلهٔ متوالی | critical |
| درخواست‌های راکد | STALLED | رکوردهای بدون رویداد در N روز اخیر | warning |
| سهم کارشناسان/شعب | SHARE | groupBy کارشناس و شعبه + درصد | info |
| پوشش اسناد | DOCUMENT | درصد درخواست‌های دارای سند/پیوست | info |
| الگوی رد | REJECT | تحلیل وضعیت‌های ردشده + دلیل رایج | warning |

### M3 — معاملات ملک تبریز (`transactions-contracts-agent.ts`)

| نام بینش | دامنه | فرمول/منطق | آستانه/رنگ |
|---|---|---|---|
| حجم و رشد ماهانه | VOLUME | `monthlySeries()` + `growthRate()` (آخرین/قبل نسبت درصدی) | positive/negative بر اساس علامت |
| روند ماه‌های شمسی | TREND | `MonthlyPoint[]` مرتب بر کلید جلالی yyyy-mm | LineChart هم‌رنگ m3 |
| ترکیب تطابق چهارگانه | COMPOSITION | `MatchComposition`: hasRequestEvent / hasSuggestedProperty / hasBoth / neither | warning اگر neither >۳۰٪ |
| نرخ تبدیل درخواست→معامله | CONVERSION | معاملات دارای کد درخواست ÷ کل درخواست‌ها | positive >X٪ آستانهٔ سیاست |
| پوشش اسناد (هولوگرام/فایل) | DOCUMENT | درصد رکوردهای دارای هولوگرام و فایل قرارداد | info |

### M4 — کارشناسان ملک تبریز (`expert-agent.ts`)

| نام بینش | دامنه | فرمول/منطق | آستانه/رنگ |
|---|---|---|---|
| ترکیب شبکه | COMPOSITION | نقش/شعبه/نوع همکاری از PM | info |
| فعالیت اخیر | ACTIVITY | معاملات N روز اخیر به تفکیک | warning برای افت |
| رشد فردی | GROWTH | مقایسهٔ دورهٔ جاری با دورهٔ قبل هر کارشناس | positive/negative |
| شبکهٔ تعاملات | NETWORK | ماتریس مشاور×مشاور از InteractionRecord + درجهٔ همکاری | info |
| ریسک رکود | RISK | کارشناس با سقوط >۵۰٪ نسبت به روند شخصی | critical |
| رهبری بازدید/معامله | VISIT_LEADERSHIP / DEAL_ACTIVITY | Top-N بازدیدها و معاملات | positive |
| پوشش ستون‌ها | COVERAGE | همان الگوی M1 روی ۱۲ ستون | critical برای ستون‌های خالی |

### سایر ایجنت‌ها (کاشی‌های ریشه و آرشیوی)

| ایجنت | دامنه‌ها | فرمول شاخص |
|---|---|---|
| `divar-agent` (فایل‌یابی) | SCAN, PERSONAL, PRICE, OTHER, LOCATION, LEARNING | امتیاز آگهی دیوار = وزن‌دهی چندعامله (`src/lib/divar/scoring.ts`)؛ یادگیری از ثبت/رد |
| `listing-agent` (آگهی ملکا) | REGISTRY, CRM, INSTAGRAM, COMPLETENESS, SOURCE | کیفیت رکورد + کانال ورود + کامل‌بودن فیلدها |
| `request-agent` (درخواست ملکا) | VOLUME, TREND, STATUS, LEADERSHIP, ATTENTION | روند ثبت + پیشتازان پاسخ‌دهی |
| `finance-agent` | TARIFF, REVENUE, SETTLEMENT, BRANCH, PIPELINE | تعرفهٔ کمیسیون (ACC) + درآمد + تسویه‌ها |
| `customer-club-agent` (آرشیو) | COMMUNITY, REPEAT, GROWTH, LOYALTY, CATALOG, CUST_CONTACT | وفاداری/تکرار خرید مشتریان |
| `contract-agent` | VOLUME, TREND, COMPOSITION, CONVERSION, DOCUMENT | پوشش اسناد قراردادی |
| `transaction-agent` (legacy) | VOLUME, TREND, COMPOSITION, CONVERSION, DOCUMENT, ... | نسخهٔ پیشین — با ادغام کاشی‌ها فعلی شد |
| `visits-agent` (آرشیو) | VISIT_* | مهاجرت‌یافته به M1 و M4 |
| دامنه‌های M5-M8 | MATCH · MARKET · COVERAGE · LEARNING+DIAGNOSIS | بند ۶٫۵ تا ۶٫۸ |

## ۷٫۲ — سازوکار وزن‌دهی (چطور بینش «یاد می‌گیرد»)

۱. **رندر:** `renderInsights()` وزن نهایی هر دسته را از سیاست فعال (`AgentPolicyVersion`) ضرب در شباهت RAG خاطراتِ هم‌domain می‌کند.
۲. **بازخورد:** هر «مفید بود / مفید نبود» → ردیف جدید `AgentFeedback` (append-only).
۳. **به‌روزرسانی سیاست:** پس از ≥۵ بازخورد اگر |score| ≥ ۲ → وزن دسته `+0.15×score` (مهار ۰٫۳–۱٫۸) → **نسخهٔ جدید** سیاست با rationale.
۴. **بازگشت (Rollback):** فقط OWNER از `POST /api/agent/[tileId]/policy` — نسخه‌های قبلی هرگز حذف نمی‌شوند.

---

# فصل ۸ — جداول و نمودارهای هر کاشی

## ۸٫۱ — کتابخانه و قواعد عمومی

- **کتابخانه:** Recharts `^2.15.4` (`package.json:76`) — همهٔ نمودارها سمت کلاینت و RTL-سازگار.
- **پریمیتیو جدول:** `src/components/ui/table.tsx` — قانون‌ساز: sticky header، وسط‌چین، `text-xs`، ظرف `max-h-[32rem]`، ردیف‌های `cv-row`، و `TableBodyVirtual` (فصل ۶٫۹).
- **اجزای مشترک:** `kpi-card.tsx` (شاخص عددی) · `top-ranking-table.tsx` (جدول Top-N) · `coverage-table.tsx` (پوشش ستون‌ها) · `step-report-list.tsx` (گزارش گام‌های sync) · `data-source.tsx` (برچسب منبع داده + زمان).

## ۸٫۲ — فهرست کامل نمودارها

| کاشی | نمودار | نوع | داده | تنظیمات رنگ |
|---|---|---|---|---|
| M1 | توزیع منطقه‌ای | BarChart | groupBy areaName | پالت m1 (سبز) |
| M1 | توزیع وضعیت | Bar/فهرست باج | ۱۰ وضعیت | باج وضعیت |
| M2 | قیف وضعیت | Bar افقی (Funnel معادل) | شش وضعیت | پالت m2 (نارنجی) |
| M2 | روند ثبت ماهانه | LineChart | monthlySeries جلالی | خط m2-500 |
| M3 | روند ماهانهٔ معاملات | LineChart | MonthlyPoint | m3-500 + نقطه‌ها |
| M3 | ترکیب تطابق | PieChart | MatchComposition چهارگانه | چهارتایی متمایز |
| M3 | شاخص‌های چهارگانه | kpi-card ×4 | totalCount/hasEvent/hasSuggested/hasBoth | KPI رنگ‌بندی |
| M4 | توزیع شعبه | BarChart | groupBy branch | m4 (سبز-فیروزه) |
| M4 | تعاملات | جدول ماتریسی | InteractionRecord | درجهٔ همکاری رنگ‌پله‌ای |
| M5 | امتیاز تطبیق | Bar افقی + درصد | matching-engine score | m5 (بنفش) |
| M6 | روند قیمت ماهانه | LineChart (دو-سری) | PriceIndexHistory | m6 + خط میانگین |
| M6 | ۱۰ منطقهٔ پرتقاضا | BarChart | MarketPriceStat | m6 |
| M6 | سری سه‌گانهٔ حجم | ComposedChart (Bar+Line) | معامله/آگهی/درخواست | سه‌گانهٔ متمایز |
| M7 | درصد پوشش ستون‌ها | Bar افقی | GET /api/coverage | m7 + قرمز برای بحرانی |
| M8 | روند Brier | LineChart | EvaluationEngine | m8 + ناحیهٔ هدف |
| M8 | نوار پیشرفت Tier | Progress | Tier سیستم | پله‌ای m8 |
| فایل‌یابی | هیستوگرام امتیاز دیوار | BarChart | scoring | finder (فیروزه‌ای) |

## ۸٫۳ — قواعد دادهٔ سری‌های زمانی

- همهٔ سری‌های ماهانه بر کلید **ماه هجری شمسی** `yyyy-mm` ساخته می‌شوند (`jalaliMonthKey()` در `analyzers.ts:48-52`) — نه میلادی.
- نرخ رشد = `(آخرین - قبل) / قبل × ۱۰۰` گردشده به یک رقم اعشار؛ اگر داده کافی نیست `null` (نمایش نمی‌شود).
- محور X همهٔ نمودارهای زمانی برچسب فارسی ماه (فروردین… اسفند) از `jalali.ts`.
