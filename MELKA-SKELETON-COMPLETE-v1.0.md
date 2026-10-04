# سند اسکلت کامل ملکا — MELKA SKELETON COMPLETE

**نسخهٔ سند:** v1.0
**تاریخ تنظیم:** ۱۴۰۵/۰۷/۱۳ (۴ اکتبر ۲۰۲۶)
**پروندهٔ سازنده:** P6550-skeleton-v2 (دستور ملکا-شورا-۱۴۰۵-۰۳۷)
**مرجع دستور:** صورت‌جلسهٔ فوق‌العادهٔ ۰۳۷ — «بستهٔ انتقال کامل ملکا»
**مالک و طراح و برنامه‌نویس:** سید نعمت‌اله سیدی
**کد مبنا (BUILD شاهد):** ۰fc5b0d-20261004-0822 (HEAD مبنا: `0fc5b0d` + کامیت‌های تثبیتی تا `5e65602`)

> **هدف این سند:** تنها مرجع جامع برای بازسازی کامل اپلیکیشن «ملکا» — ظاهر، باطن و ساختار لایه‌ای — بدون هیچ داده‌ای.
> **قید مطلق:** صفر داده، صفر توکن واقعی، صفر رمز واقعی. هر عددی که در این سند می‌بینید یا شمارهٔ خط است یا شمار ساختار (تعداد ستون/فایل/تست) — نه شمار رکورد دادهٔ واقعی.
> **زبان:** توضیح‌ها فارسی؛ کد و شناسه‌ها انگلیسی (عین کد مبنا).
> **قاعدهٔ ارجاع:** هر ادعای ساختاری با `مسیر/فایل:خط` به کد مبنا ارجاع دارد. شمارهٔ خط‌ها از بیلد شاهد بالا هستند؛ در نسخه‌های بعدی ممکن است اندکی جابه‌جا شوند اما ترتیب و محتوا معتبر می‌مانند.

---

## فهرست مطالب

**بخش اول — نقشهٔ کلان**
- [فصل ۱ — خلاصهٔ اجرایی](#فصل-۱--خلاصهٔ-اجرایی)
- [فصل ۲ — چشم‌انداز و مأموریت](#فصل-۲--چشمانداز-و-مأموریت)
- [فصل ۳ — معماری ۹ لایه](#فصل-۳--معماری-۹-لایه)

**بخش دوم — ظاهر**
- [فصل ۴ — پشتهٔ فناوری و ساختار دایرکتوری](#فصل-۴--پشتهٔ-فناوری-و-ساختار-دایرکتوری)
- [فصل ۵ — کاشی‌های صفحهٔ اصلی (Home)](#فصل-۵--کاشیهای-صفحهٔ-اصلی-home)
- [فصل ۶ — کاشی‌های داشبورد مدیریتی (M1-M8)](#فصل-۶--کاشیهای-داشبورد-مدیریتی-m1-m8)
- [فصل ۷ — فهرست کامل بینش‌ها (Insights Catalog)](#فصل-۷--فهرست-کامل-بینشها-insights-catalog)
- [فصل ۸ — جداول و نمودارهای هر کاشی](#فصل-۸--جداول-و-نمودارهای-هر-کاشی)
- [فصل ۹ — سیستم طراحی (Design System)](#فصل-۹--سیستم-طراحی-design-system)

**بخش سوم — باطن**
- [فصل ۱۰ — هستهٔ هوشمندی (۱۱ موتور)](#فصل-۱۰--هستهٔ-هوشمندی-۱۱-موتور)
- [فصل ۱۱ — ایجنت‌های هوشمند](#فصل-۱۱--ایجنتهای-هوشمند)
- [فصل ۱۲ — حلقهٔ یادگیری](#فصل-۱۲--حلقهٔ-یادگیری)
- [فصل ۱۳ — حاکمیت و ایمنی](#فصل-۱۳--حاکمیت-و-ایمنی)
- [فصل ۱۴ — موتور تصمیم و برنامه‌ریز اقدام](#فصل-۱۴--موتور-تصمیم-و-برنامهریز-اقدام)
- [فصل ۱۵ — خودتشخیصی و خودترمیمی](#فصل-۱۵--خودتشخیصی-و-خودترمیمی)
- [فصل ۱۶ — سه گراف اصلی](#فصل-۱۶--سه-گراف-اصلی)
- [فصل ۱۷ — Feature Store و Blackboard](#فصل-۱۷--feature-store-و-blackboard)

**بخش چهارم — داده و اتصال**
- [فصل ۱۸ — اسکیمای Prisma](#فصل-۱۸--اسکیمای-prisma)
- [فصل ۱۹ — سیستم همگام‌سازی (Sync System)](#فصل-۱۹--سیستم-همگامسازی-sync-system)
- [فصل ۲۰ — احراز هویت و امنیت](#فصل-۲۰--احراز-هویت-و-امنیت)
- [فصل ۲۱ — API Endpoints](#فصل-۲۱--api-endpoints)

**بخش پنجم — زیرساخت و پایداری**
- [فصل ۲۲ — تست‌ها و گاردها](#فصل-۲۲--تستها-و-گاردها)
- [فصل ۲۳ — پیکربندی (Configuration)](#فصل-۲۳--پیکربندی-configuration)
- [فصل ۲۴ — پایداری و بازیابی](#فصل-۲۴--پایداری-و-بازیابی)
- [فصل ۲۵ — قوانین ابدی و راهبری](#فصل-۲۵--قوانین-ابدی-و-راهبری)

---
---

# بخش اول — نقشهٔ کلان

---

# فصل ۱ — خلاصهٔ اجرایی

## ۱٫۱ — ملکا چیست؟ (یک پاراگراف)

ملکا — با نام رسمی «اکوسیستم هوشمند ملک ایران» — یک **لایهٔ هوش تحلیلی و مدیریتی چندعامله (Multi-Agent Decision-Support)** روی خانوادهٔ سامانه‌های ملک تبریز است؛ نه یک CRM جایگزین. این اپلیکیشن داده را از سامانه‌های واقعی (ARM سامانهٔ مدیریت آگهی و درخواست، PM سامانهٔ مدیریت پرسنلی، ACC سامانهٔ مالی، GAP سامانهٔ گفت‌وگو، و سامانهٔ عمومی melketabriz.com) استخراج می‌کند، در پایگاه دادهٔ محلی خود (SQLite/Prisma) نگه می‌دارد، و آن را در قالب یک **داشبورد تک‌صفحه‌ای کاشی‌ای (Tile-based SPA)** با ایجنت هوشمند یادگیرندهٔ اختصاصی برای هر کاشی، به مدیر و کارشناسان ارائه می‌دهد. هر کاشی یک ایجنت مستقل دارد که با بازخورد مدیر وزن بینش‌های خود را در طول زمان بهبود می‌دهد؛ و بالاتر از کاشی‌ها، یک «هستهٔ هوشمندی» ۱۱-موتوری (از موتور زمینه تا موتور ایمنی) حلقهٔ بستهٔ «پیش‌بینی ← پیامد ← ارزیابی ← یادگیری» را می‌چرخاند. اپلیکیشن تک‌زبانهٔ فارسی (RTL، ارقام فارسی، تقویم هجری شمسی)، به‌صورت PWA روی وب/اندروید/تبلت اجرا می‌شود و تمام ارتباطش با سامانه‌های بالادستی از طریق الگوی BFF انجام می‌گیرد تا توکن‌ها هرگز به کلاینت نشت نکنند.

## ۱٫۲ — نسخه و شناسهٔ بیلد

| مورد | مقدار |
|---|---|
| نام پکیج | `nextjs_tailwind_shadcn_ts` (نام پلتفرمی؛ نام محصول: ملکا) |
| نسخهٔ پکیج | `1.7.0` (`package.json:3`) |
| شناسهٔ بیلد | قالب `<gitSha8>-<yyyymmdd>-<hhmm>` — خودکار در بیلد ساخته می‌شود |
| قرارداد شاهد نسخه | `GET /api/version` → `{buildId, builtAt, gitSha, env, source}` (`src/app/api/version/route.ts`) |
| سه مسیر شاهد نسخه | ۱) endpoint `/api/version` بدون لاگین · ۲) متاتگ `app-build-id` در HTML · ۳) فوتر UI «نسخهٔ زندهٔ سامانه» (`AGENTS.md` §۴) |
| ثبت شاهد بیلد در DB | جدول singleton نام‌گذاری‌شده `AppMeta` در بوت (`src/instrumentation.ts:56-71`) |

## ۱٫۳ — تصویر معماری کلان (در یک نگاه)

```
┌────────────────────────────────────────────────────────────────────┐
│  کلاینت PWA (وب / اندروید / تبلت — فارسی RTL، ارقام فارسی، شمسی)   │
│  SPA تک‌صفحه‌ای: ورود → خانهٔ کاشی‌ای → صفحهٔ کاشی (بدون مسیریابی)   │
│  توکن نشست رمزنگاری‌شده AES-GCM + کلید دستگاه در IndexedDB         │
│  Service Worker (sw-v5) · manifest کامل · نصب PWA · آفلاین‌نما       │
└──────────────────────────┬─────────────────────────────────────────┘
                           │ فقط مسیرهای نسبی /api/* (الگوی BFF)
┌──────────────────────────▼─────────────────────────────────────────┐
│  لایهٔ BFF — ۶۱ Next.js API Route (src/app/api/**)                  │
│  auth │ crm │ agent │ intelligence │ sync │ divar │ graphs │ ...    │
│  نگهبان نشست · محدودسازی نرخ · حسابرسی AuditLog · پاسخ فشرده gzip  │
├───────────────┬────────────────────────┬───────────────────────────┤
│ کاشی‌ها/ایجنت‌ها│  هستهٔ هوشمندی ۱۱موتوری│  لایهٔ melk-api (اتصال)    │
│ ۱۳ کاشی ثبت‌شده│ Context·Memory·Retrieval│ ARM · PM · ACC · GAP     │
│ ظرف + ۵ ریشه  │ Feature·Prediction      │ · melkPublic             │
│ ایجنت یادگیرنده│ Outcome·Evaluation       │ (تنها نقطهٔ تغییر API)   │
│ هر کاشی مستقل  │ Learning·Decision        │ + دیمن کاتالوگ checkpoint│
│               │ Action·Safety            │ + غنی‌سازی زنجیره‌ای      │
├───────────────┴────────────────────────┴───────────────────────────┤
│  لایهٔ Repository (۱۷ قرارداد + پیاده‌سازی Prisma) — مرز ایجنت↔داده │
├────────────────────────────────────────────────────────────────────┤
│  داده: Prisma + SQLite — ۳۹ مدل · ۵ اتصال سامانه · ۳ گراف         │
│  قانون دادهٔ مقدس: بکاپ پیش از تغییر · صفر حذف · آرشیو به‌جای پاک‌سازی│
└────────────────────────────────────────────────────────────────────┘
```

## ۱٫۴ — کاشی‌های صفحهٔ اصلی (۵ کاشی ریشه)

| # | نام | شناسه | مسیرِ دسترسی | آیکون (lucide) | رنگ (accent) |
|---|---|---|---|---|---|
| ۱ | فایل‌یابی ملکا | `file-finder` | `/?tile=file-finder` | `Radar` | `finder` |
| ۲ | آگهی ملکا | `listings` | `/?tile=listings` | `Megaphone` | `melka-listing` |
| ۳ | درخواست ملکا | `requests` | `/?tile=requests` | `ClipboardList` | `melka-request` |
| ۴ | تنظیمات عمومی | `settings` | `/?tile=settings` | `Settings` | `settings` |
| ۵ | داشبورد مدیریتی ملک تبریز | `management-dashboard` | `/?tile=management-dashboard` | `LayoutDashboard` | `mgmt` |

*(جزئیات کامل هر کاشی در فصل ۵؛ فرزندان داشبورد مدیریتی در فصل ۶.)*

## ۱٫۵ — کاشی‌های داشبورد مدیریتی (۸ کاشی M1-M8)

| # | نام | شناسه | آیکون | رنگ | موضوع |
|---|---|---|---|---|---|
| M1 | آگهی ملک تبریز | `arm-listings` | `Building2` | `m1` | رجیستری کامل آگهی‌های ARM |
| M2 | درخواست ملک تبریز | `arm-requests` | `ClipboardList` | `m2` | رجیستری کامل درخواست‌های ARM |
| M3 | معاملات ملک تبریز | `transactions-contracts` | `FileCheck2` | `m3` | معاملات + قراردادها + حق‌السهم |
| M4 | کارشناسان ملک تبریز | `experts` | `Users` | `m4` | پرسنل PM + عملکرد |
| M5 | تطبیق هوشمند ملک تبریز | `smart-matching` | `Sparkles` | `m5` | موتور تطبیق آگهی↔درخواست |
| M6 | شاخص بازار ملک تبریز | `market-index` | `TrendingUp` | `m6` | شاخص قیمت روز مناطق |
| M7 | پوشش اطلاعات ملک تبریز | `data-coverage` | `Database` | `m7` | پوشش ستون‌های همهٔ فهرست‌ها |
| M8 | مغز ملکا — یادگیری و Tier | `learning-tier` | `Brain` | `m8` | حلقهٔ یادگیری + سیستم Tier |

## ۱٫۶ — اعداد کلیدی ساختار (بدون داده)

| شاخص ساختاری | مقدار |
|---|---|
| فایل‌های TypeScript/TSX در `src/` | ۳۹۶ فایل (app:63 · components:59 · lib:85 · core:189) |
| API Routes | ۶۱ روت (فصل ۲۱) |
| مدل‌های Prisma | ۳۹ مدل + enum ها (فصل ۱۸) |
| کاشی‌های ثبت‌شده در رجیستری | ۱۳ (۵ ریشه + ۱ ظرف + ۸ فرزند M1-M8 — فصل ۵/۶) |
| ایجنت‌های تخصصی | ۱۳ فایل ایجنت (فصل ۱۱) |
| موتورهای هستهٔ هوشمندی | ۱۱ موتور (فصل ۱۰) |
| قراردادهای Repository | ۱۷ (فصل ۱۶/۱۸) |
| تست‌های خودکار | ۷۸ فایل تست، ~۱۸۹۴ تست سبز ×۲ پیاپی (فصل ۲۲) |
| میانبرهای PWA | ۳ (آگهی/درخواست/معامله — `public/manifest.json:40-73`) |
| کتابخانه‌های نمودار | Recharts (سرویس‌محور، ~۱۰ نوع نمودار — فصل ۸) |

---

# فصل ۲ — چشم‌انداز و مأموریت

## ۲٫۱ — هدف نهایی: سیستم‌عامل هوشمند املاک ایران

چشم‌انداز مالک (سید نعمت‌اله سیدی) برای ملکا، ساختن **«سیستم‌عامل هوشمند املاک ایران»** است: نه یک ابزار گزارش‌گیری، بلکه بستری که هر تصمیم ملکی (قیمت‌گذاری، تطبیق مشتری، ارزیابی کارشناس، پیش‌بینی بازار) را با دادهٔ واقعی، حلقهٔ یادگیری بسته و دروازهٔ تأیید انسانی انجام می‌دهد. ملک تبریز (با برند «آرم» ARM و خانوادهٔ سامانه‌هایش) نخستین و کامل‌ترین اتصال این سیستم‌عامل است؛ معماری باید به‌گونه‌ای باشد که اتصال هر اپراتور املاک دیگر، فقط با افزودن یک «Provider» در لایهٔ melk-api ممکن باشد (قاعدهٔ «تنها نقطهٔ تغییر» — `README.md:66`).

## ۲٫۲ — ۱۷ لایهٔ سیستم‌عامل (OS Layer Map)

ملکا خود را به‌صورت یک سیستم‌عامل با ۱۷ لایهٔ مفهومی می‌بیند. این لایه‌ها نقشهٔ راه راهبردی‌اند؛ لایه‌های ۱ تا ۱۲ امروز پیاده‌سازی شده‌اند و ۱۳ تا ۱۷ در نقشهٔ راه آینده‌اند (وضعیت هرکدام صادقانه ذکر شده):

| # | لایهٔ OS | وضعیت | پیاده‌سازی / محل |
|---|---|---|---|
| ۱ | تجربهٔ کاربری فارسی موبایل‌اول (PWA) | ✅ کامل | `src/app/page.tsx` + `src/components/app/*` + `public/manifest.json` |
| ۲ | پوستهٔ کاشی‌ای پلاگین‌محور | ✅ کامل | `src/core/tiles/tile-contract.ts` + `tile-registry.ts` + `bootstrap.ts` |
| ۳ | ایجنت‌های یادگیرندهٔ کاشی‌محور | ✅ کامل | `src/core/agent/base-agent.ts` + ۱۳ ایجنت تخصصی |
| ۴ | هستهٔ هوشمندی ۱۱-موتوری | ✅ کامل (قرارداد + بدنه) | `src/core/intelligence/**` (فصل ۱۰) |
| ۵ | حافظهٔ چندلایه و RAG کاشی‌محور | ✅ کامل | `src/core/intelligence/memory/*` + `AgentMemory` |
| ۶ | حلقهٔ پیش‌بینی←پیامد←ارزیابی←یادگیری | ✅ کامل | `src/core/intelligence/outcome-loop.ts` + `src/lib/intelligence/daemon.ts` |
| ۷ | گراف‌های دانش (ملک/افراد/معامله) | ✅ کامل | `src/core/graphs/graph-service.ts` + `GraphNode/GraphEdge` |
| ۸ | Feature Store مشترک | ✅ کامل | `src/core/intelligence/feature/feature-store.ts` + ۴ سازنده |
| ۹ | موتور تطبیق هوشمند (Matching) | ✅ کامل | `src/core/matching/matching-engine.ts` (M5) |
| ۱۰ | لایهٔ اتصال چندسامانه‌ای (Multi-Provider) | ✅ کامل | `src/lib/melk-api/*` — ARM/PM/ACC/GAP/melkPublic |
| ۱۱ | حاکمیت، ایمنی و حسابرسی | ✅ کامل | `src/core/intelligence/safety/*` + `AuditLog` + گاردها |
| ۱۲ | خودتشخیصی و خودترمیمی | ✅ کامل | `src/core/intelligence/p10-core.ts` + `p11-core.ts` (فصل ۱۵) |
| ۱۳ | کانال‌های ورودی چندگانه (گفت‌وگو، تلفن، پیام‌رسان) | 🔄 نقشهٔ راه | GAP متصل است؛ تحلیل مکالمه در آینده |
| ۱۴ | مدل‌های پیش‌بینی آمیخته (ML سنتی + LLM) | 🔄 نقشهٔ راه | امروز: پایه‌های آماری + رجیستری مدل (`models/registry.ts`) |
| ۱۵ | بازارچهٔ ایجنت (Agent Marketplace) | 🔄 نقشهٔ راه | رجیستری پلاگین کاشی آماده است |
| ۱۶ | چندمستأجری (Multi-tenant) چندبرندی | 🔄 نقشهٔ راه | ConsultantScope/branch آماده (`src/lib/access/scope.ts`) |
| ۱۷ | استاندارد باز تبادل دادهٔ املاک ایران | 🔄 نقشهٔ راه | قراردادهای DTO خالص پایهٔ آن‌اند |

## ۲٫۳ — سه اصل راهبردی

۱. **اصل کسب‌وکار — «تصمیم‌پشتی، نه جایگزین»:** ملکا هرگز فرایند ثبت سامانهٔ مادر را duplicate نمی‌کند؛ فقط می‌خواند، غنی می‌کند، تحلیل می‌کند و توصیه می‌دهد. هر اقدام اجرایی پشت «دروازهٔ تأیید انسانی» است (فصل ۱۳).
۲. **اصل فرایند — «لایه‌ها فقط به پایین نگاه می‌کنند»:** هیچ لایه‌ای به لایهٔ بالاتر وابسته نیست؛ UI هرگز مستقیم به DB نمی‌رسد؛ ایجنت‌ها فقط از Repository می‌خوانند. این اصل با گاردهای `--strict` (فصل ۲۲) تضمین می‌شود.
۳. **اصل اثبات — «تغییر بدون شاهد زنده = تغییر نکرده»:** هر قابلیت باید با تست سبز، اسکرین‌شات/DOM-marker و در موارد انتشار با مهر نسخهٔ زنده (`/api/version`) اثبات شود (`AGENTS.md` §۱).

## ۲٫۴ — سه گراف اصلی

| گراف | گره‌ها | یال‌ها | سرویس |
|---|---|---|---|
| **Property Graph** (گراف ملک) | آگهی‌ها/املاک (PropertyRecord/ListingRecord) + مناطق | هم‌محله‌ای، هم‌مالکی، هم‌کارشناسی | `src/core/graphs/graph-builders.ts` |
| **People Graph** (گراف افراد) | مشتریان، مالکان، کارشناسان، پرسنل | تعامل، بازدید، واسطه‌گری، ارجاع | همان فایل، سازندهٔ جدا |
| **Transaction Graph** (گراف معامله) | معاملات/قراردادها + طرفین | خریدار-فروشنده، حق‌السهم، هولوگرام | همان فایل، سازندهٔ جدا |

جزئیات کامل در فصل ۱۶.

---

# فصل ۳ — معماری ۹ لایه

## ۳٫۱ — نقشهٔ ۹ لایه و محل هرکدام در کد

| لایه | نام | مسیر در کد | مسئولیت |
|---|---|---|---|
| L1 | Presentation (ارائه) | `src/app/page.tsx`, `src/app/layout.tsx`, `src/components/app/**` | پوستهٔ SPA، ورود/OTP/خانه/صفحهٔ کاشی، Splash، BottomNav، حالت‌ها |
| L2 | Tile Plugins (پلاگین کاشی) | `src/core/tiles/**` (قرارداد + رجیستری + ۱۳ ماژول کاشی) | تعریف کاشی، تنظیمات اختصاصی، بارگذاری تنبل صفحات |
| L3 | Agents & Analyzers (ایجنت و تحلیل‌گر) | `src/core/agent/**` | بینش‌سازی یادگیرندهٔ هر کاشی؛ تحلیل‌گرها توابع خالص |
| L4 | Intelligence Core (هستهٔ هوشمندی) | `src/core/intelligence/**` | ۱۱ موتور + حلقهٔ سرنوشت + خودتشخیصی/ترمیمی |
| L5 | Domain Services (سرویس دامنه) | `src/core/matching/`, `src/core/graphs/`, `src/core/features/`, `src/core/smart-update/`, `src/core/maintenance/` | تطبیق، گراف، ویژگی، به‌روزرسانی هوشمند، نگهداشت |
| L6 | Repositories (مخازن) | `src/core/repositories/interfaces/**` (قرارداد) + `prisma/**` (پیاده‌سازی) | مرز یگانهٔ خواندن/نوشتن داده برای ایجنت‌ها و سرویس‌ها |
| L7 | Integration / melk-api (اتصال) | `src/lib/melk-api/**` (۳۲ فایل) | کلاینت HTTP، endpoint registry، sync، غنی‌سازی، دیمن کاتالوگ |
| L8 | Data (داده) | `prisma/schema.prisma` + `src/lib/db.ts` | ۳۹ مدل SQLite؛ قانون دادهٔ مقدس |
| L9 | Governance (راهبری) | `AGENTS.md` + `docs/**` + `scripts/audit-*.sh` + `AuditLog` | قوانین ابدی، گاردهای لایه‌ای، حسابرسی، بازگشت |

## ۳٫۲ — قواعد import (هر لایه فقط به پایین)

۱. **L1 → L2/L6(نمونه)/L7(از طریق BFF):** صفحه‌ها کاشی‌ها را از رجیستری می‌گیرند (`DashboardHome.tsx`) و داده را فقط از `/api/*` خودشان.
۲. **L2 → L3 و L6:** کاشی ایجنت خود را معرفی می‌کند (`agent:` در تعریف کاشی) و از DTOهای Repository فقط type-import می‌کند.
۳. **L3 → L4 و L6:** ایجنت‌ها برای تحلیل از analyzers (خالص) و برای داده از Repository استفاده می‌کنند؛ وابستگی‌ها تزریق‌پذیرند (`ArmListingAgentDeps`).
۴. **L4 → L5 و L6:** موتورها از Feature Store/گراف‌ها و Repositoryها (از طریق واسط `engine-deps.ts`) تغذیه می‌شوند.
۵. **L7 → هیچ‌یک:** melk-api فقط HTTP و نرمال‌سازی می‌داند؛ به UI و هستهٔ هوشمندی وابسته نیست.
۶. **همهٔ لایه‌ها → L9 مشمول:** هر تغییر باید گاردهای حسابرسی/مرزبندی را سبز نگه دارد.

## ۳٫۳ — قواعد ممنوع (و گارد اجراکننده)

| ممنوع | گارد اجراکننده |
|---|---|
| UI → Prisma/DB مستقیم (`db.*` در کامپوننت/صفحه) | `scripts/audit-repository-boundary.sh --strict` |
| Agent → `db.*` مستقیم (باید Repository) | `scripts/audit-repository-boundary.sh --strict-agents` |
| Agent → لایهٔ UI (import از components) | `scripts/audit-intelligence-boundary.sh --strict` |
| فراخوانی مستقیم fetch به سامانه‌های خارجی از کلاینت | معماری BFF + مرور کد؛ کلاینت فقط `/api/*` نسبی |
| رنگ خالص در جزء جدید (بجای توکن رنگ بخش) | تست‌های قانون ۰۳۵-B (`tests/p6549-luxury-law.test.ts`) |
| نگاشت ارقام فارسی درون‌خطی در مسیر فیلتر | گارد p6526 §۸-۴ (`tests` — منبع یگانه: `src/lib/normalize-input.ts`) |
| حذف داده در تغییر اسکیما | قانون دادهٔ مقدس + `VACUUM INTO` پیش از تغییر (`AGENTS.md` §۵) |
| بستن پرونده بدون مهر نسخهٔ زنده | `AGENTS.md` §۱ (قانون طلایی انتشار) |

## ۳٫۴ — جریان یک درخواست نمونه (از لمس تا بینش)

۱. کاربر روی کارت کاشی M1 لمس می‌کند → Ripple + Haptic → `DashboardHome` کاشی را از `tileRegistry.get("arm-listings")` می‌گیرد.
۲. `TileShell` صفحهٔ `ArmListingsPage` را با `lazyPage` (import داینامیک — چانک جدا) می‌کشد؛ تا رسیدن داده، Skeleton نمایش می‌یابد.
۳. صفحه از `useTileData` (shared hook) درخواست خود را به `GET /api/crm/arm-catalog/listings?...` می‌زند (پاسخ gzip فشرده اگر >۶۴KB — `src/lib/http/compressed-json.ts`).
۴. روت BFF، نگهبان نشست را رد می‌کند (`src/lib/auth/guard.ts`)، سپس از `PropertyRecordRepository` (L6) می‌خواند.
۵. در پس‌زمینه، دیمن کاتالوگ (`src/lib/melk-api/catalog-daemon.ts`) از L7 برش‌های checkpointدار ARM را می‌گیرد و از طریق Repository می‌نویسد.
۶. ایجنت M1 (`src/core/agent/arm-listing-agent.ts`) بینش‌ها را از همان Repository می‌سازد؛ بازخورد مدیر در `AgentFeedback` ثبت و وزن‌ها در `AgentPolicyVersion` نسخه‌بندی می‌شود.
۷. در تیک بعدی دیمن مغز (L4)، اگر دادهٔ کافی جدید باشد: پیش‌بینی ← ثبت پیامد ← ارزیابی ← یادگیری (فصل ۱۲).

---
---

# بخش دوم — ظاهر

---

# فصل ۴ — پشتهٔ فناوری و ساختار دایرکتوری

## ۴٫۱ — پشتهٔ فناوری (نسخهٔ دقیق)

| لایه | انتخاب | نسخه (از `package.json`) | دلیل انتخاب |
|---|---|---|---|
| فریمورک | Next.js (App Router) | `^16.1.1` | یک پایهٔ کد وب/اندروید/تبلت؛ API Routes برای BFF؛ استاندارد صنعتی |
| زبان | TypeScript (strict) | `^5` | قابلیت اطمینان قراردادهای لایه‌ای |
| UI Base | React | `^19.0.0` | — |
| استایل | Tailwind CSS | `^4` (+ `@tailwindcss/postcss`، `tw-animate-css`) | سرعت + RTL + توکن‌های رنگ بخشی |
| کامپوننت | shadcn/ui (Radix UI) | ~۳۰ پریمیتیو در `src/components/ui/` | بلوغ، دسترس‌پذیری، مالکیت کد |
| نمودار | Recharts | `^2.15.4` | سازگار React، سبک، RTL-پذیر |
| ORM | Prisma | `^6.11.1` | اسکیمای واحد SQLite + مهاجرت‌پذیری آینده به PostgreSQL |
| DB | SQLite (فایل) | — | کش داده و حافظهٔ ایجنت بدون سرویس خارجی؛ PHASE 12 → PostgreSQL |
| State کلاینت | Zustand | `^5.0.6` (+ persist) | SPA سبک؛ تنظیمات کاشی‌ها در localStorage |
| سرور اجرا | Bun | `bun-types ^1.3.4`؛ `bun run start` | سرعت؛ اسکریپت‌های عملیاتی همگی Bun/TS |
| فرم | react-hook-form + zod | `^7.60.0` / `^4.0.2` | اعتبارسنجی قراردادمحور |
| انیمیشن | framer-motion | `^12.23.2` | Splash/انتقال‌ها + `MotionConfig reducedMotion=user` |
| PWA | manifest + Service Worker دست‌ساز | `public/sw-v5.js` | کنترل کامل استراتژی کش و بنر آپدیت |
| بسته‌بندی موبایل | Capacitor | `capacitor.config.ts` | بیلد اندروید بومی از همان PWA (`docs/BUILD-ANDROID.md`) |
| تست | Bun test + happy-dom | `^20.14.5` | تست واحد/ادغام سبز ×۲ پیاپی الزامی |

## ۴٫۲ — متن کامل `package.json`

> عین فایل کد مبنا (بدون تغییر). مولفه‌های حساس: اسکریپت `build` بستهٔ standalone می‌سازد و پوشه‌های غیرضروری را از standalone حذف می‌کند؛ اسکریپت `test` پایگاه تست مجزا و کلید رمزنگاری آزمایشی ست می‌کند.

```json
{
  "name": "nextjs_tailwind_shadcn_ts",
  "version": "1.7.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3000 2>&1 | tee dev.log",
    "build": "next build && cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/ && cp env.platform.json .next/standalone/ && rm -rf .next/standalone/backups .next/standalone/db .next/standalone/prisma/db .next/standalone/download .next/standalone/skills .next/standalone/scripts .next/standalone/tool-results .next/standalone/docs .next/standalone/examples .next/standalone/tests .next/standalone/bun.lock .next/standalone/dev.log .next/standalone/server.log .next/standalone/worklog.md",
    "start": "NODE_ENV=production bun .next/standalone/server.js 2>&1 | tee server.log",
    "lint": "eslint .",
    "db:push": "prisma db push --accept-data-loss",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:reset": "prisma migrate reset",
    "test": "DATABASE_URL=file:/home/z/my-project/db/test.db MELK_TOKEN_KEY=test-only-key-not-a-real-secret bun test tests/",
    "test:db:push": "DATABASE_URL=file:/home/z/my-project/db/test.db prisma db push --accept-data-loss"
  },
  "dependencies": {
    "@dnd-kit/core": "^6.3.1",
    "@dnd-kit/sortable": "^10.0.0",
    "@dnd-kit/utilities": "^3.2.2",
    "@hookform/resolvers": "^5.1.1",
    "@mdxeditor/editor": "^3.39.1",
    "@prisma/client": "^6.11.1",
    "@radix-ui/react-accordion": "^1.2.11",
    "@radix-ui/react-alert-dialog": "^1.1.14",
    "@radix-ui/react-aspect-ratio": "^1.1.7",
    "@radix-ui/react-avatar": "^1.1.10",
    "@radix-ui/react-checkbox": "^1.3.2",
    "@radix-ui/react-collapsible": "^1.1.11",
    "@radix-ui/react-context-menu": "^2.2.15",
    "@radix-ui/react-dialog": "^1.1.14",
    "@radix-ui/react-dropdown-menu": "^2.1.15",
    "@radix-ui/react-hover-card": "^1.1.14",
    "@radix-ui/react-label": "^2.1.7",
    "@radix-ui/react-menubar": "^1.1.15",
    "@radix-ui/react-navigation-menu": "^1.2.13",
    "@radix-ui/react-popover": "^1.1.14",
    "@radix-ui/react-progress": "^1.1.7",
    "@radix-ui/react-radio-group": "^1.3.7",
    "@radix-ui/react-scroll-area": "^1.2.9",
    "@radix-ui/react-select": "^2.2.5",
    "@radix-ui/react-separator": "^1.1.7",
    "@radix-ui/react-slider": "^1.3.5",
    "@radix-ui/react-slot": "^1.2.3",
    "@radix-ui/react-switch": "^1.2.5",
    "@radix-ui/react-tabs": "^1.1.12",
    "@radix-ui/react-toast": "^1.2.14",
    "@radix-ui/react-toggle": "^1.1.9",
    "@radix-ui/react-toggle-group": "^1.1.10",
    "@radix-ui/react-tooltip": "^1.2.7",
    "@reactuses/core": "^6.0.5",
    "@tanstack/react-query": "^5.82.0",
    "@tanstack/react-table": "^8.21.3",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "cmdk": "^1.1.1",
    "date-fns": "^4.1.0",
    "embla-carousel-react": "^8.6.0",
    "framer-motion": "^12.23.2",
    "html2canvas-pro": "^2.4.4",
    "input-otp": "^1.4.2",
    "jspdf": "^4.2.1",
    "lucide-react": "^0.525.0",
    "next": "^16.1.1",
    "next-auth": "^4.24.11",
    "next-intl": "^4.3.4",
    "next-themes": "^0.4.6",
    "prisma": "^6.11.1",
    "react": "^19.0.0",
    "react-day-picker": "^9.8.0",
    "react-dom": "^19.0.0",
    "react-hook-form": "^7.60.0",
    "react-markdown": "^10.1.0",
    "react-resizable-panels": "^3.0.3",
    "react-syntax-highlighter": "^15.6.1",
    "recharts": "^2.15.4",
    "sharp": "^0.34.3",
    "sonner": "^2.0.6",
    "tailwind-merge": "^3.3.1",
    "tailwindcss-animate": "^1.0.7",
    "uuid": "^11.1.0",
    "vaul": "^1.1.2",
    "z-ai-web-dev-sdk": "^0.0.18",
    "zod": "^4.0.2",
    "zustand": "^5.0.6"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "bun-types": "^1.3.4",
    "eslint": "^9",
    "eslint-config-next": "^16.1.1",
    "happy-dom": "^20.14.5",
    "tailwindcss": "^4",
    "tw-animate-css": "^1.3.5",
    "typescript": "^5"
  },
  "trustedDependencies": [
    "@parcel/watcher",
    "@swc/core",
    "core-js",
    "es5-ext",
    "unrs-resolver"
  ]
}
```

## ۴٫۳ — درخت دایرکتوری `src/` با توضیح هر پوشه

```
src/
├── instrumentation.ts        # قلاب بوت سرور: env پلتفرم · fail-fast رازها · شاهد بیلد ·
│                             # چرخش کلید · دیمن مغز · دیمن کاتالوگ · قلاب بازیابی خودکار
├── app/                      # (L1) مسیرهای Next.js — در ظاهر فقط «/» ولی عملکرد SPA
│   ├── layout.tsx            # RTL فارسی + تم + متاهای PWA + فونت وزیرمتن
│   ├── page.tsx              # پوستهٔ SPA: ورود → otp → home ⇄ tile (بدون مسیریابی مرورگر)
│   ├── globals.css           # توکن‌های رنگ CSS (--sec-*) + تم روشن/تاریک + انیمیشن‌ها
│   └── api/                  # (L1-BFF) ۶۱ روت — فصل ۲۱
│       ├── auth/             # master-login, request-otp, verify-otp, session
│       ├── crm/              # arm-catalog, branches, contracts, customer-club, experts,
│       │                     # finance, interactions, meta, transactions, data-freshness
│       ├── agent/[tileId]/   # insight, feedback, stats, policy
│       ├── intelligence/     # blackboard, status
│       ├── sync/             # sync (all, jobs)
│       ├── divar/            # ads, connection, locations, scan, settings
│       ├── graphs/, matching/, market-index/, opportunity-alerts/
│       ├── melk-public/sync/ # همگام‌سازی سامانهٔ عمومی
│       ├── listings/, requests/, users/, coverage/, indicators/
│       ├── arm|pm|gap/connection/  # وضعیت اتصال سه سامانه
│       ├── connection/       # status, reset
│       ├── health/, version/ # سلامت و شاهد نسخه
│       └── instagram/        # connection (شبکهٔ اجتماعی نمونه)
├── components/
│   ├── app/                  # کامپوننت‌های پوسته: AuthScreen, OtpScreen, DashboardHome,
│   │   │                     # TileShell, TileCard, AgentPanel, SplashScreen, BottomNav,
│   │   │                     # AppHeader, OfflineBadge, InstallButton, SwRegister,
│   │   │                     # VersionBadge, ConnectionIndicators, OpenInNewTabButton
│   │   └── shared/           # اجزای مشترک همهٔ کاشی‌ها: kpi-card, data-source,
│   │                         # use-tile-data, list-states, coverage-table,
│   │                         # step-report-list, top-ranking-table
│   └── ui/                   # ~۳۶ پریمیتیو shadcn (button, table, dialog, ...) +
│                               jalali-date-picker, bottom-sheet (اختصاصی ملکا)
├── core/                     # (L2-L5) هستهٔ مستقل از UI
│   ├── tiles/                # tile-contract.ts (قرارداد) · tile-registry.ts (رجیستری)
│   │   │                     # bootstrap.ts (نقطهٔ ثبت) · lazy-page.tsx (بارگذاری تنبل)
│   │   └── tiles/            # ۱۴ پوشهٔ ماژول کاشی (۱۳ ثبت‌شده + customer-club آرشیو)
│   ├── agent/                # (L3) base-agent.ts (BaseLearningAgent) · analyzers.ts
│   │                         # (تحلیل‌گرهای خالص) · policy.ts · ۱۳ ایجنت تخصصی
│   ├── intelligence/         # (L4) ۱۱ موتور + agents/domain-agents.ts + p7..p11-core.ts
│   │   ├── engines/          # قراردادهای ۱۱ موتور (PHASE 3 — فقط type)
│   │   ├── context|memory|retrieval|feature|prediction|outcome|evaluation|
│   │   │   learning|decision|action|safety/   # پیاده‌سازی‌های بدنه‌دار (PHASE 4-8)
│   │   ├── calibration/      # نقشهٔ کالیبراسیون احتمالات
│   │   └── models/           # رجیستری مدل‌های پیش‌بینی
│   ├── graphs/               # graph-builders.ts + graph-service.ts (سه گراف)
│   ├── features/             # store.ts — Feature Store سطح core
│   ├── matching/             # matching-engine.ts (M5) + opportunity-listener.ts
│   ├── repositories/         # (L6) interfaces/ (۱۷ قرارداد + DTO) + prisma/ (پیاده‌سازی)
│   │                         # + tenant.ts (دامنهٔ دسترسی ConsultantScope)
│   ├── smart-update/         # به‌روزرسانی هوشمند رکوردها (بدون بازنویسی کامل)
│   └── maintenance/          # cleanup.ts — نگهداشت/آرشیو دادهٔ مرده
├── lib/                      # پشتیبانی افقی
│   ├── melk-api/             # (L7) ۳۲ فایل: client, endpoints, sync, bulk-import,
│   │                         # normalize, type-registry, job-state, tx-enrichment,
│   │                         # expert-enrichment, pm-acc-sync, customer-club,
│   │                         # customer-directory, arm-catalog, melk-public,
│   │                         # catalog-daemon, commission, data-freshness, sms, ...
│   ├── auth/                 # crypto (AES-256-GCM), session, guard, rate-limiter,
│   │                         # secure-storage, key-rotation, arm-vault
│   ├── intelligence/         # daemon.ts (دیمن مغز) · core-cycle.ts · outcome-loop.ts
│   │                         # blackboard.ts · learning-adapter.ts
│   ├── divar/                # اسکن/پارس/امتیازدهی دیوار (نمونهٔ پرووایدر ثانویه)
│   ├── instagram/            # انتشار پست اینستاگرام از آگهی‌ها
│   ├── request/ | listing/ | http/ | client/ | access/ | logger/ | types/
│   ├── jalali.ts             # هستهٔ تقویم هجری شمسی (تبدیل دوجهته/کبیسه/ماه‌ها)
│   ├── format.ts             # فارسی‌سازی اعداد/مبالغ/تاریخ (faNumber, faPrice, ...)
│   ├── normalize-input.ts    # منبع یگانهٔ نگاشت ارقام فارسی/عربی/لاتین + ی/ک
│   ├── virtual-window.ts     # منبع یگانهٔ ریاضیات رندر پنجره‌ای فهرست‌ها
│   ├── palette13.json        # پالت ۱۳ بخش × ۵ سایه (قانون ۰۳۵-B) + متادیتا
│   ├── value-colors.ts       # نظام رنگ مقادیر فیلتر (بدون تکرار رنگ)
│   ├── fa-sort.ts            # مرتب‌سازی فارسی (الفبا با تقدم خاص)
│   ├── haptics.ts            # بازخورد لرزشی با گارد API
│   ├── theme-transition.ts   # انتقال نرم تم ۳۰۰ms (احترام reduced-motion)
│   ├── indicators.ts         # شاخص‌های ترکیبی KPI
│   ├── build-witness.ts      # شاهد بیلد در DB
│   ├── platform-env.ts       # بازیابی env پس از دیپلوی پلتفرم
│   ├── branches.ts           # حلقهٔ شعبه: PM → ARM → دستی
│   ├── audit.ts              # دروازهٔ حسابرسی رخدادها
│   ├── db.ts                 # نمونهٔ PrismaClient یگانه
│   └── contract-classify.ts  # خانواده‌بندی قراردادها (فروش/اجاره/مشارکت/پیش‌فروش)
├── hooks/                    # use-mobile.ts, use-pull-to-refresh.tsx, use-toast.ts
└── styles/                   # (در صورت وجود) استایل‌های جانبی
```

**پوشه‌های ریشه‌ای (خارج src):** `prisma/` (اسکیما + db آزمایشی — بدون migrations؛ اسکیما با `prisma db push` اعمال می‌شود) · `public/` (manifest، sw، آیکون‌ها، فونت وزیرمتن woff2، اسکرین‌شات‌های PWA) · `tests/` (۷۸ فایل) · `scripts/` (عملیاتی/شواهد) · `docs/` (۲۸ سند) · `.zscripts/` (پایپ‌لاین بیلد/سوپروایزر پلتفرم) · `db/` (دادهٔ واقعی — از git خارج، قانون ۰۳۵-A) · `upload/` (بسته‌های بقا — ذخیره‌ساز پایدار) · `backups/` (بکاپ‌های VACUUM).

## ۴٫۳-ب — فایل‌های پیکربندی بیلد (متن کامل)

`next.config.ts`:

```ts
import type { NextConfig } from "next";
import { execSync } from "child_process";

/* =============================================================================
 * P6519 — شاهد زندهٔ نسخه (BLOCK B دستور شورا: رفع دائمی لینک‌های کهنه)
 * -----------------------------------------------------------------------------
 * BUILD_ID از این پس «خودکار، یکتا و قابل‌ردیابی» است:
 *   "<gitSha8>-<yyyymmdd>-<hhmm>"   مثال: 459939e-20260924-0712
 * یعنی هر بیلد به کامیت گیت و زمان بیلد گره می‌خورد — صفر اقدام دستی.
 * همان مقدار + builtAt + gitSha از طریق env در باندل (سرور + کلاینت) پخته
 * می‌شود تا /api/version، متاتگ HTML و فوتر داشبورد همیشه نسخهٔ «همان بیلد»
 * را نشان دهند. مستندات: docs/decision-preview-publish.md (بند ۳-۱)
 * ========================================================================== */

function gitShaShort(): string {
  try {
    return execSync("git rev-parse --short HEAD", { timeout: 5000 })
      .toString()
      .trim()
      .slice(0, 8);
  } catch {
    // محیط بدون git (نباید رخ دهد — .git هم در کانتینر هست هم در repo.tar)
    return "nogit";
  }
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function buildStamp(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
    `-${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}`
  );
}

const gitSha = gitShaShort();
const builtAtIso = new Date().toISOString();
const buildId = `${gitSha}-${buildStamp(new Date(builtAtIso))}`;

const nextConfig: NextConfig = {
  output: "standalone",
  generateBuildId: () => buildId,
  /* =============================================================================
   * P6528 — لاغرسازی بستهٔ استقرار (ریشهٔ واقعی «Failed» دامنهٔ publish)
   * -----------------------------------------------------------------------------
   * file-tracing خروجی standalone، فهرست‌های غیرعملیاتی پروژه را هم ردیابی و
   * داخل بسته کپی می‌کرد: backups 188M + db 80M + skills 61M + download 28M +
   * scripts 10M + tool-results 6M … ⇒ بستهٔ 539MB (تار 184MB) از سقف آپلود
   * خط لولهٔ انتشار پلتفرم رد می‌شد و دامنهٔ publish صفحهٔ «Failed» می‌داد.
   * دیتابیس تولید در FC از DATABASE_URL محیط می‌آید (start.sh آن را به
   * file:/app/db/custom.db ست می‌کند و database-runtime-build.sh جداگانه
   * بستهٔ db/ را می‌سازد) — کپی‌های ردیابی‌شدهٔ این فهرست‌ها کاملاً زائدند.
   * env.platform.json عمداً مستثناست (سرور در بوت به آن نیازمند است).
   * ========================================================================== */
  outputFileTracingExcludes: {
    "*": [
      "./backups/**",
      "./db/**",
      "./prisma/db/**",
      "./download/**",
      "./skills/**",
      "./scripts/**",
      "./tool-results/**",
      "./docs/**",
      "./examples/**",
      "./tests/**",
      "./coverage*.json",
      "./baseline*.json",
      "./filter-*.json",
      "./trend-validation.json",
      "./recon-*.jsonl",
      "./dev.log",
      "./server.log",
      "./worklog.md",
    ],
  },
  env: {
    // در زمان build داخل باندل پخته می‌شوند (پروژه output:standalone — .git در
    // بستهٔ استقرار FC نیست، پس این تنها راه رساندن sha به runtime است)
    NEXT_PUBLIC_BUILD_ID: buildId,
    NEXT_PUBLIC_GIT_SHA: gitSha,
    NEXT_PUBLIC_BUILT_AT: builtAtIso,
  },
  /* فایل Service Worker و HTML ریشه هرگز کش نشوند تا به‌روزرسانی‌ها بلافاصله اعمال شوند
     (لایه CDN دامنه عمومی، پاسخ‌ها را با کلید مسیر کش می‌کند) */
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/sw-v3.js",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
      {
        // P6519 — endpoint شاهد نسخه هرگز کش نشود (لایهٔ FC مسیرمحور کش می‌کند)
        source: "/api/version",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
    ];
  },
  typescript: {
    // PHASE 1 / P1-04: تایپ‌چک کامل فعال — صفر خطای tsc در کل پروژه
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
};

export default nextConfig;
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": [
      "dom",
      "dom.iterable",
      "esnext"
    ],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "noImplicitAny": false,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": [
        "./src/*"
      ]
    },
    "types": [
      "bun-types"
    ]
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts"
  ],
  "exclude": [
    "node_modules",
    "examples",
    "skills",
    "capacitor.config.ts"
  ]
}
```

## ۴٫۴ — قواعد ساختاری مهم

۱. **تک‌صفحه‌ای بودن SPA:** تنها مسیر UI همان `/` است؛ «ناوبری» با state درون `page.tsx` (auth → otp → home → tile) انجام می‌شود؛ پارامتر `?tile=<id>` کاشی هدف را باز می‌کند (میانبرهای PWA از همین بهره می‌برند).
۲. **تنها نقطهٔ ثبت کاشی:** `src/core/tiles/bootstrap.ts` — افزودن/حذف کاشی = یک خط import (`bootstrap.ts:15-33`).
۳. **بارگذاری تنبل صفحات کاشی:** `lazy-page.tsx` + `React.lazy` در همهٔ ۱۳ تعریف کاشی — چانک اولیهٔ JS از ۱٫۳MB به ~۲۶۷KB رسید (P6549/۰۳۵-B-ح).
۴. **منبع یگانه برای هر مفهوم عرضی:** ارقام فارسی (`normalize-input.ts`)، پنجره‌سازی فهرست (`virtual-window.ts`)، تاریخ شمسی (`jalali.ts`)، رنگ بخش‌ها (`palette13.json` + globals.css)، شعبه (`branches.ts`).
۵. **مرز Repository:** ایجنت‌ها و موتورها هرگز `db.*` را مستقیم صدا نمی‌زنند؛ DTOها فقط از `repositories/interfaces/dto.ts`.

---

# فصل ۵ — کاشی‌های صفحهٔ اصلی (Home)

صفحهٔ خانه (پس از ورود) دو ناحیه دارد: **کاشی‌های ریشه** (دسترسی مستقیم کاربر) و **فوتر هویت** (نام سامانه + نسخهٔ زنده + نشانگرهای اتصال). پنج کاشی ریشه با ترتیب `order` روی شبکهٔ ریسپانسیو (موبایل ۲ ستون / دسکتاپ تا ۵ ستون) چیده می‌شوند. هر کاشی کارت `TileCard` است با: آیکون بخش با رنگ اختصاصی، عنوان، توضیح یک‌خطی (قابل خاموش‌کردن از تنظیمات کاشی)، نشان تعداد (در صورت وجود) و Ripple لمسی.

## ۵٫۱ — کاشی «فایل‌یابی ملکا» (`file-finder`)

| فیلد | مقدار | منبع |
|---|---|---|
| شناسه / نسخه | `file-finder` / `1.0.0` | `src/core/tiles/tiles/file-finder/index.ts` |
| ترتیب / ظرف | ۱ / بدون ظرف (کاشی ریشه) | همان فایل |
| آیکون / رنگ | `Radar` / `finder` (فیروزه‌ای `#008c8c`) | همان فایل + `palette13.json` §3 |
| هدف | رادار آگهی‌های **دیوار تبریز**: اسکن ناحیه‌ای، امتیازدهی و تبدیل آگهی منتخب به رکورد آگهی ملکا | `FileFinderPage.tsx` |
| اجزای داخلی | `AdCard` (کارت آگهی) · `AdDetailsDialog` (جزئیات) · `RegisterDialog` (ثبت آگهی منتخب) · `RejectDialog` (رد با دلیل) | پوشهٔ file-finder |
| ایجنت | `divar-agent.ts` — دامنه‌ها: SCAN, PERSONAL, PRICE, OTHER, LOCATION, LEARNING | فصل ۱۱ |
| API های مصرفی | `/api/divar/scan`, `/api/divar/ads/**`, `/api/divar/locations`, `/api/divar/settings`, `/api/divar/connection` | فصل ۲۱ |
| تنظیمات کاشی | آستانهٔ امتیاز، ناحیه‌های پایش، کلید اتصال دیوار (Vault) | `DivarSetting` |

## ۵٫۲ — کاشی «آگهی ملکا» (`listings`)

| فیلد | مقدار |
|---|---|
| شناسه / نسخه | `listings` / `1.0.0` |
| ترتیب / ظرف | ۲ / ریشه |
| آیکون / رنگ | `Megaphone` / `melka-listing` (سبز-زیتونی `#747500`) |
| هدف | آگهی‌های **خود ملکا** (ثبت داخلی، نه ARM): ایجاد آگهی جدید، کارت‌ها، انتقال به CRM، انتشار اینستاگرام |
| اجزای داخلی | `ListingCard` · `NewListingDialog` · `ListingDetailsDialog` · `InstagramDialog` · `CrmTransferDialog` |
| ایجنت | `listing-agent.ts` — REGISTRY, CRM, INSTAGRAM, COMPLETENESS, SOURCE |
| API های مصرفی | `/api/listings`, `/api/listings/[id]`, `/api/listings/[id]/transfer-crm`, `/api/listings/[id]/instagram`, `/api/instagram/connection` |

## ۵٫۳ — کاشی «درخواست ملکا» (`requests`)

| فیلد | مقدار |
|---|---|
| شناسه / نسخه | `requests` / `1.0.0` |
| ترتیب / ظرف | ۳ / ریشه |
| آیکون / رنگ | `ClipboardList` / `melka-request` (آجری `#bb483f`) |
| هدف | درخواست‌های **خود ملکا**: ثبت درخواست جدید، مدیریت مشتری، رویدادهای درخواست، ثبت در ARM (پل دوطرفه) |
| اجزای داخلی | `RequestCard` · `NewRequestDialog` · `ArmRegisterDialog` · `CustomerManagementPanel` · `EventDialog` |
| ایجنت | `request-agent.ts` — VOLUME, TREND, STATUS, LEADERSHIP, ATTENTION |
| API های مصرفی | `/api/requests`, `/api/requests/[id]`, `/api/requests/[id]/events`, `/api/requests/[id]/register`, `/api/requests/meta/form` |

## ۵٫۴ — کاشی «تنظیمات عمومی» (`settings`)

| فیلد | مقدار |
|---|---|
| شناسه / نسخه | `settings` / `1.0.0` |
| ترتیب / ظرف | ۴ / ریشه |
| آیکون / رنگ | `Settings` / `settings` (آبی `#0c76c6`) |
| هدف | پیکربندی کل اپلیکیشن در ۹ بخش | `SettingsPage.tsx` |
| بخش‌های داخلی | `AccountGeneralSection` (حساب) · `MelkTabrizConnectionSection` (اتصال ملک تبریز) · `ArmConnectionSection` · `PmConnectionSection` · `GapConnectionSection` · `DivarConnectionSection` · `InstagramConnectionSection` · `BrainStatusSection` (وضعیت مغز/Tier) · `OpportunityJobsSection` (کارهای فرصت‌ساز) |
| نکتهٔ دسترسی | برخی بخش‌ها فقط OWNER؛ برخی خواندنی برای CONSULTANT (`minRole`) |
| API های مصرفی | `/api/connection/*`, `/api/arm|pm|gap/connection`, `/api/intelligence/status`, `/api/sync/jobs` |

## ۵٫۵ — کاشی «داشبورد مدیریتی ملک تبریز» (`management-dashboard`)

| فیلد | مقدار |
|---|---|
| شناسه / نسخه | `management-dashboard` / `1.1.0` |
| ترتیب / ظرف | ۵ / ریشه (خودش ظرفِ ۸ کاشی M1-M8 است) |
| آیکون / رنگ | `LayoutDashboard` / `mgmt` (کهربایی `#9d6700`) |
| هدف | ظرف یکپارچهٔ کاشی‌های مدیریتی/تحلیلی؛ فرزندان از رجیستری خوانده می‌شوند (پلاگین‌محور — `listChildren("management-dashboard")`) |
| رندر | `ManagementDashboardPage.tsx` — گرید کارت‌های فرزند با رنگ و آیکون خودشان + بازگشت به هوم |
| تنظیمات | نمایش/عدم‌نمایش توضیح یک‌خطی روی کارت‌ها (`showTaglines`) |

> **قاعدهٔ ظرف‌بندی:** کاشی جدید مدیریتی با `container: "management-dashboard"` در تعریف خودش، خودکار زیر این ظرف ظاهر می‌شود (`tile-registry.ts:43-46`) — بدون هیچ تغییری در کد ظرف.

## ۵٫۶ — کاشی آرشیو‌شده (شاهد قانون دادهٔ مقدس)

پوشهٔ `customer-club/` هنوز در کد هست (صفحه + ایجنت + مدل داده) اما از `bootstrap.ts` حذف شده (P6.5-12). داده‌های آن (`CustomerRecord` و ماژول‌های تحلیلی) در پایگاه ماندگارند. الگوی «حذف نما، بقای داده» برای هر حذف کاشی آینده هم الزامی است (`bootstrap.ts:20-22`).

## ۵٫۷ — قرارداد کاشی (متن کامل `tile-contract.ts`)

> عین فایل `src/core/tiles/tile-contract.ts` — هر کاشی تازه باید همین قرارداد را برآورده کند:

```ts
import type { LucideIcon } from "lucide-react";

/**
 * قرارداد «کاشی» (Tile Contract)
 * ------------------------------------------------------
 * هر کاشی یک ماژول خودکفاست که این قرارداد را پیاده می‌کند.
 * افزودن کاشی جدید = افزودن یک ماژول که `defineTile()` را صدا می‌زند؛
 * هسته، رجیستری و بقیه کاشی‌ها بدون هیچ تغییری کار می‌کنند.
 * حذف/تعویض کاشی نیز فقط با حذف import آن ماژول انجام می‌شود.
 */

import type { ComponentType } from "react";

export type TileSettingType = "switch" | "select" | "number" | "text";

export interface TileSettingDefinition {
  key: string;
  label: string;
  type: TileSettingType;
  hint?: string;
  options?: { value: string; label: string }[];
  defaultValue: string | number | boolean;
  min?: number;
  max?: number;
}

/** ویژگی‌های صفحه کاشی که هسته به آن تزریق می‌کند */
export interface TilePageProps {
  /** مقادیر فعلی تنظیمات اختصاصی همین کاشی (نگهداری‌شده در فضای خود کاشی) */
  settings: Record<string, string | number | boolean>;
  /** اعمال تغییر تنظیمات اختصاصی */
  onSettingsChange: (patch: Record<string, string | number | boolean>) => void;
  /** نقش کاربر جاری */
  userRole: "OWNER" | "CONSULTANT";
  /** بازگشت به خانه داشبورد */
  onBack: () => void;
}

/** اتصال ایجنت هوشمند کاشی — null برای کاشی‌های بدون ایجنت (مثل تنظیمات) */
export interface TileAgentBinding {
  /** شناسه کاشی که ایجنت به آن متصل است (ایزوله‌سازی حافظه) */
  tileId: string;
  /** کلیدهای بینش که این ایجنت تولید می‌کند */
  insightDomains: readonly string[];
  /** نشان یادگیری فعال */
  capabilities: readonly ("memory" | "feedback" | "policy-versions" | "rollback")[];
}

export interface TileDefinition {
  /** شناسه یکتا و پایدار (برای ذخیره تنظیمات و ایزوله‌سازی ایجنت) */
  id: string;
  version: string;
  title: string;
  /** هدف کسب‌وکاری یک‌خطی */
  tagline: string;
  description: string;
  /** کامپوننت آیکون کاشی (lucide) */
  icon: LucideIcon;
  /** رنگ هویتی بخش — پالت ۱۳ بخش ملکا (گام صفر P6530 — قاعده ۱؛ SECTION_ACCENTS در TileCard) */
  accent:
    | "login" | "home" | "finder" | "melka-listing" | "melka-request" | "settings"
    | "mgmt" | "m1" | "m2" | "m3" | "m4" | "m5" | "m6" | "m7" | "m8" | "consultant" | "ai";
  /** کامپوننت صفحه داخلی کاشی */
  component: ComponentType<TilePageProps>;
  /** تعریف تنظیمات اختصاصی — در همان کاشی نگهداری می‌شود */
  settings: TileSettingDefinition[];
  /** اتصال ایجنت هوشمند */
  agent: TileAgentBinding | null;
  /** حداقل نقش لازم برای نمایش */
  minRole?: "OWNER";
  /** ترتیب پیش‌فرض نمایش */
  order: number;
  /** شناسه کاشی ظرف (در صورت تعیین، این کاشی در صفحه خانه مستقیم نمایش داده نمی‌شود
   *  و درون کاشی ظرف — مانند «داشبورد مدیریتی» — قرار می‌گیرد) */
  container?: string;
}

/** سازنده تعریف کاشی — اعتبارسنجی ساختاری انجام می‌دهد */
export function defineTile(def: TileDefinition): TileDefinition {
  if (!def.id || !/^[a-z][a-z0-9-]*$/.test(def.id)) {
    throw new Error(`شناسه کاشی نامعتبر است: ${def.id} (الگوی مجاز: حروف کوچک و خط تیره)`);
  }
  if (!def.title || !def.component) {
    throw new Error(`کاشی ${def.id} بدون عنوان یا کامپوننت است.`);
  }
  if (def.agent && def.agent.tileId !== def.id) {
    throw new Error(`اتصال ایجنت کاشی ${def.id} به کاشی دیگری (${def.agent.tileId}) اشاره می‌کند.`);
  }
  if (def.container === def.id) {
    throw new Error(`کاشی ${def.id} نمی‌تواند ظرف خودش باشد.`);
  }
  return def;
}
```

---

# فصل ۶ — کاشی‌های داشبورد مدیریتی (M1-M8)

> **ترتیب الزامی بخش‌های هر صفحهٔ کاشی M1-M4** (قاعدهٔ P6546/گام پنجم-الف-۳؛ گارد تستی دارد):
> **بینش‌ها → جداول و نمودارها → پوشش اطلاعات → بروزرسانی → فیلتر → فهرست**
> همین ترتیب در بندهای زیر برای هر کاشی رعایت شده است.

---

## ۶٫۱ — کاشی M1 «آگهی ملک تبریز» (`arm-listings`)

### ۶٫۱٫۱ — هویت
- **نام فارسی:** آگهی ملک تبریز · **شناسه:** `arm-listings` · **نسخه:** `2.0.0` · **مسیر:** `/?tile=arm-listings`
- **فایل تعریف:** `src/core/tiles/tiles/arm-listing/index.ts` · **صفحه:** `ArmListingsPage.tsx` (۹۸۷ خط)

### ۶٫۱٫۲ — رنگ اختصاصی
- کلید `m1` — سبز رشد: `50:#ebf8e8 · 100:#dbefd5 · 300:#a0c395 · 500:#3b821e · 700:#1b4b04 · fg:#FAFBFC` (`src/lib/palette13.json` §8)
- نگاشت سازگار قدیمی-جدید: توکن‌های `sec-m1` در `tailwind.config.ts:65`

### ۶٫۱٫۳ — هدف کاشی
رجیستری کامل همهٔ آگهی‌های ثبت‌شده در سامانهٔ ARM (سامانهٔ مدیریت آگهی و درخواست ملک تبریز) در یک فهرست تک‌صفحه‌ایِ بی‌نهایت — با غنی‌سازی زنجیره‌ای عین خود سامانه (اطلاعات تماس مالک، آدرس دقیق، مشخصات فنی) و ایجنت مولتی‌بینش یادگیرنده.

### ۶٫۱٫۴ — ستون‌های فهرست (۱۶ ستون — ترتیب دقیق)
*(منبع: `ArmListingsPage.tsx:764-783`)*

| # | ستون | فرمت/نمایش | رنگ‌بندی |
|---|---|---|---|
| ۱ | ردیف | عدد فارسی | خنثی |
| ۲ | کد آگهی | عدد فارسی + عنوان آگهی زیر آن (قابل خاموش‌شدن از تنظیمات کاشی) | mono-مانند، fg |
| ۳ | کارشناس | نام و نام‌خانوادگی | fg |
| ۴ | شعبه | نام شعبه از PM (حلقهٔ PM→ARM→دستی — `branches.ts`)؛ ناشناخته = «-» | باج سبز-خنثی |
| ۵ | مالک | نام + موبایل زیر نام (دو خط) | fg |
| ۶ | قیمت | `۹،۰۰۰،۰۰۰،۰۰۰` (جداکنندهٔ فارسی — `faPrice`) | عددی با هم‌ترازی |
| ۷ | قیمت هر متر | همان فرمت، محاسبه از قیمت/متراژ | عددی |
| ۸ | آدرس ملک | منطقه، کوی، پلاک (از properties/details) | fg |
| ۹ | نوع ملک | آپارتمان/زمین/کلنگی/... | باج سبز 100 |
| ۱۰ | متراژ | عدد فارسی + واحد | عددی |
| ۱۱ | اتاق | عدد فارسی | عددی |
| ۱۲ | طبقه | عدد/متن | عددی |
| ۱۳ | ساخت | سال شمسی | عددی |
| ۱۴ | دسته‌بندی | فروش (سبز) / پیش‌فروش (آبی) / رهن‌واجاره (نارنجی) / مشارکت (بنفش) — نظام رنگ مقادیر | باج رنگ‌متمایز |
| ۱۵ | وضعیت | ده‌حالتهٔ ARM (`listing-status.ts`: از «در حال بررسی» تا «معامله شده») | باج وضعیت |
| ۱۶ | آخرین فعالیت | تاریخ کوتاه شمسی `۱۴۰۵/۰۶/۳۱` | خنثی |

### ۶٫۱٫۵ — فیلترها (شامل کلیهٔ ستون‌ها — منبع `ArmListingsPage.tsx:510-691`)
| فیلتر | نوع | گزینه‌ها/نمونه | رنگ‌بندی |
|---|---|---|---|
| وضعیت آگهی | چندانتخابی | ۱۰ وضعیت ARM | هر وضعیت باج متمایز |
| دسته‌بندی | چندانتخابی | فروش/پیش‌فروش/رهن‌واجاره/مشارکت | سبز/آبی/نارنجی/بنفش |
| کد آگهی | متنی | نمونهٔ placeholder: «۵۹۱۱۵» (ورودی فارسی پذیرفته — normalize-input) | — |
| کارشناس | متنی | «شهریار بابایان» | — |
| شعبه | تک‌انتخابی | همهٔ شعب + «بدون شعبه» | — |
| مالک (نام یا موبایل) | متنی | «علی محمدی یا ۰۹۱۴…» | — |
| آدرس ملک / منطقه | متنی | «خاوران یا خیابان دانش» | — |
| قیمت (تومان) | بازهٔ از/تا | placeholder: «از ۹٬۰۰۰٬۰۰۰٬۰۰۰» / «تا ۱۲٬۰۰۰٬۰۰۰٬۰۰۰» | — |
| آخرین فعالیت | بازهٔ تاریخ شمسی | JalaliDatePicker از/تا | — |
| نوع ملک / متراژ / اتاق / طبقه / ساخت / قیمت‌هرمتر | در ستون‌های فهرست از طریق همان فیلترهای متنی/بازه | — | — |

### ۶٫۱٫۶ — بینش‌های ایجنت (خلاصه؛ جدول کامل فصل ۷)
VOLUME (حجم رجیستری + درصد تکمیل تماس مالک) · TOP_EXPERTS (۱۰ کارشناس پرآگهی) · REGION (توزیع منطقه‌ای) · COVERAGE (پوشش تمام ستون‌ها) · FRESHNESS (تازگی ثبت) · VISIT_ATTENTION (آگهی‌های پربازدید — مهاجرت از کاشی حذف‌شدهٔ بازدیدها).

### ۶٫۱٫۷ — جداول و نمودارها
- **جدول Top-10 کارشناسان پرآگهی** (سهم هر نفر) — `top-ranking-table.tsx` مشترک
- **جدول توزیع وضعیت ده‌حالته** (شمار + درصد) · **جدول توزیع دسته‌بندی**
- **نمودار میله‌ای توزیع منطقه‌ای** (Recharts BarChart — رنگ m1)
- **جدول پوشش ستون‌ها** (۱۶ ستون × درصد پر — `coverage-table.tsx` مشترک)

### ۶٫۱٫۸ — دکمه‌های بروزرسانی
- دکمهٔ اصلی «بروزرسانی آگهی‌ها از سامانه‌های ملک تبریز» → زنجیرهٔ دو لایه: **لایهٔ ۱** فهرست `properties/list` (برش‌های ~۵٬۰۰۰ رکوردی با checkpoint صفحه‌به‌صفحه) + **لایهٔ ۲** غنی‌سازی `properties/owner` + `properties/details` (~۵۰۰ رکورد/برش)
- ادامه از نقطهٔ قطع: toast «ادامهٔ بروزرسانی از نقطهٔ قطع (تلاش n از ۳)» — apiSync تاب‌آور ۳تلاشی
- تاریخ/ساعت دقیق آخرین بروزرسانی موفق + شمار fetched/totalAtSource
- Tier-aware: در Tierهای پایین‌تر برش‌ها کوچک‌تر و خودکار (دیمن کاتالوگ)

### ۶٫۱٫۹ — ایجنت اختصاصی
`ArmListingAgent` (`src/core/agent/arm-listing-agent.ts`) — دامنه: کاتالوگ آگهی ARM؛ مدل: BaseLearningAgent (وزن‌دهی RAG + بازخورد؛ فصل ۱۱/۱۲).

### ۶٫۱٫۱۰ — API endpoints
`GET /api/crm/arm-catalog/listings` (فهرست ۶۰-۲۴۰ms، پاسخ gzip) · `POST /api/crm/arm-catalog/sync` (برش checkpointدار) · `GET /api/crm/arm-catalog/listings/coverage` (پوشش ستون‌ها) — جزئیات فصل ۲۱.

### ۶٫۱٫۱۱ — اسکرین‌شات شاهد
`download/p6549/screens/` (۲۶ شات ۱۳ بخش × ۲ تم — قانون ۰۳۵-B/خ) + `download/p6548-recovery/03-m1-list.png`.

---

## ۶٫۲ — کاشی M2 «درخواست ملک تبریز» (`arm-requests`)

### ۶٫۲٫۱ — هویت
- **شناسه:** `arm-requests` · **نسخه:** `2.0.0` · **مسیر:** `/?tile=arm-requests`
- **فایل تعریف:** `src/core/tiles/tiles/arm-request/index.ts` · **صفحه:** `ArmRequestsPage.tsx` (۹۲۲ خط) + `AreasFileCell.tsx`

### ۶٫۲٫۲ — رنگ اختصاصی
کلید `m2` — نارنجی کهربایی: `50:#fff0e4 · 100:#fee2cf · 300:#deab89 · 500:#b35500 · 700:#6b2c00` (`palette13.json` §9)

### ۶٫۲٫۳ — هدف
رجیستری کامل درخواست‌های ملکی ثبت‌شده در ARM با مشخصات متقاضی، مناطق موردنظر (چندمنطقه‌ای با «فایل مناطق»)، فوریت/جدیت، و غنی‌سازی زنجیره‌ای (متقاضی + مناطق + وضعیت).

### ۶٫۲٫۴ — ستون‌های فهرست (۱۳ ستون — `ArmRequestsPage.tsx:746-763`)
| # | ستون | فرمت | رنگ‌بندی |
|---|---|---|---|
| ۱ | ردیف | عدد فارسی | خنثی |
| ۲ | کد درخواست | عدد فارسی | fg |
| ۳ | کارشناس | نام | fg |
| ۴ | شعبه | از PM | باج خنثی |
| ۵ | متقاضی | نام + موبایل زیر نام | fg |
| ۶ | قیمت | بازهٔ «از … تا …» با فرمت جداکنندهٔ فارسی | عددی |
| ۷ | مناطق | تا ۳ منطقه چیپ؛ بیشتر = «فایل مناطق» (شمارنده + دیالوگ سند شماره‌دار — `AreasFileCell.tsx`) | چیپ نارنجی 100 |
| ۸ | نوع ملک | آپارتمان/... | باج |
| ۹ | نوع ساختمان | — | باج |
| ۱۰ | دسته‌بندی | فروش/پیش‌فروش/رهن‌واجاره/مشارکت | رنگ‌متمایز |
| ۱۱ | وضعیت | شش‌حالتهٔ ARM | باج وضعیت |
| ۱۲ | فوریت | فوری/در حین بررسی/... (ستون تازهٔ P6547) | باج داغ‌تر برای فوری |
| ۱۳ | تاریخ ثبت | تاریخ کوتاه شمسی | خنثی |

### ۶٫۲٫۵ — فیلترها (`ArmRequestsPage.tsx:505-663`)
وضعیت درخواست (چندانتخابی شش‌حالته) · دسته‌بندی (چندانتخابی) · کد درخواست (متنی) · کارشناس (متنی) · شعبه (تک‌انتخابی) · متقاضی نام/موبایل (متنی) · قیمت از/تا · مناطق (متنی) · تاریخ ثبت (بازهٔ شمسی) — به‌علاوهٔ فیلترهای ستون‌های نوع ملک/ساختمان/فوریت.

### ۶٫۲٫۶ — بینش‌های ایجنت
FUNNEL (قیف وضعیت) · BOTTLENECK (گلوگاه مرحله) · STALLED (راکدها) · SHARE (سهم کارشناسان/شعب) · DOCUMENT (اسناد) · REJECT (ردشده‌ها) — ایجنت `arm-request-agent.ts`.

### ۶٫۲٫۷ — جداول و نمودارها
جدول قطب‌های درخواست (کارشناس/شعبه) · نمودار قیف وضعیت (Funnel معادل Recharts) · جدول پوشش ۱۳ ستون · نمودار روند ثبت ماهانهٔ شمسی.

### ۶٫۲٫۸ — دکمه‌های بروزرسانی
همان الگوی M1: لایهٔ ۱ `requests/list` + لایهٔ ۲ `requests/applicant` (+ `requests/details` برای قطب‌ها) با checkpoint و تاریخ دقیق؛ دیمن تکمیل ستون‌های ناقص (موبایل متقاضی — برش ۶۰ ردیف/تیک round-robin).

### ۶٫۲٫۹ — ایجنت اختصاصی
`ArmRequestAgent` — دامنه: قیف و کیفیت درخواست‌های ARM.

### ۶٫۲٫۱۰ — API endpoints
`GET /api/crm/arm-catalog/requests` · `POST /api/crm/arm-catalog/sync?type=requests` · پوشش در همان روت coverage.

### ۶٫۲٫۱۱ — اسکرین‌شات شاهد
`download/p6547/screens/05-m2-top.png`, `06-m2-supply-poles.png` + شات‌های ۲تم P6549.

---

## ۶٫۳ — کاشی M3 «معاملات ملک تبریز» (`transactions-contracts`)

### ۶٫۳٫۱ — هویت
- **شناسه:** `transactions-contracts` · **نسخه:** `1.1.0` · **مسیر:** `/?tile=transactions-contracts`
- **صفحه:** `TransactionsContractsPage.tsx` (۲۴۲ خط — پوستهٔ دو تبی) + `TransactionsTab.tsx` (جزئیات معاملات) + `ContractFileDialog.tsx`

### ۶٫۳٫۲ — رنگ اختصاصی
کلید `m3` — سرخ رز: `50:#ffedf3 · 100:#ffdde7 · 300:#e0a4b5 · 500:#b5466f · 700:#6d213f` (`palette13.json` §10)

### ۶٫۳٫۳ — هدف
همهٔ معاملات/صورت‌وضعیت‌های سامانه با گزارش تطابق چهارگانه، حق‌السهم مشاوران، هولوگرام و فایل قرارداد — و تبی دوم «قراردادها و اسناد» برای اسناد صادره.

### ۶٫۳٫۴ — ستون‌های فهرست (۱۱ ستون — `TransactionsTab.tsx:611-637`)
| # | ستون | فرمت | رنگ‌بندی |
|---|---|---|---|
| ۱ | ردیف | عدد فارسی | خنثی |
| ۲ | تاریخ معامله | تاریخ کوتاه شمسی | خنثی |
| ۳ | کد ملک | فقط کد (با آیکون Home) — دستور مالک E.۲ | fg |
| ۴ | فروشنده | نام + موبایل زیر نام (E.۴) | fg |
| ۵ | کد درخواست | فقط کد (آیکون Inbox — E.۳) | fg |
| ۶ | خریدار | نام + موبایل زیر نام (E.۵) | fg |
| ۷ | نوع قرارداد | فروش/اجاره/مشارکت/پیش‌فروش (`contract-classify.ts`) | باج خانواده‌رنگ |
| ۸ | قیمت | مبلغ قرارداد با جداکنندهٔ فارسی | عددی |
| ۹ | تجمیع حق‌السهم مشاوران | «نام (٪)» برای هر مشاور — قالب عین نمونهٔ مالک | چندخطی |
| ۱۰ | شماره هولوگرام | متن | fg |
| ۱۱ | فایل قرارداد | «دارد/ندارد» + دیالوگ سند | باج سبز/خاکستری |

### ۶٫۳٫۵ — فیلترها (`TransactionsTab.tsx:476-530`)
کد ملک (متنی) · کد درخواست (متنی) · شماره هولوگرام (متنی) · نام کارشناس (متنی) · کد پرسنلی کارشناس (متنی) · فروشنده نام/موبایل (متنی) · خریدار نام/موبایل (متنی) · قیمت از/تا · فایل قرارداد (همه/دارد/ندارد) · نوع قرارداد (چندانتخابی) · تاریخ معامله (بازهٔ شمسی).

### ۶٫۳٫۶ — بینش‌های ایجنت
VOLUME (حجم + رشد ماهانه) · TREND (روند ماه‌های شمسی + نرخ رشد) · COMPOSITION (تطابق چهارگانه: دارای رویداد/آگهی پیشنهادی/هر دو/هیچ‌کدام) · CONVERSION (نرخ تبدیل درخواست→معامله) · DOCUMENT (پوشش هولوگرام/فایل) — ایجنت `transactions-contracts-agent.ts`.

### ۶٫۳٫۷ — جداول و نمودارها
نمودار خطی روند ماهانهٔ شمسی (LineChart) · نمودار میله‌ای/دایره‌ای ترکیب تطابق · شاخص‌های چهارگانهٔ KPI (kpi-card) · جدول کارشناسان سهم‌دار.

### ۶٫۳٫۸ — دکمه‌های بروزرسانی
دو دکمهٔ مجزا: «بروزرسانی معاملات» (trade-overviews/list + info) و «بروزرسانی حق‌السهم» — با تاریخ دقیق، checkpoint و برش tx-info (ریشه‌یابی P6546-47: apiSync تاب‌آور ۳تلاشی + برش tx-info، مشکل بروزرسانی‌نشدن ریشه‌ای رفع شد).

### ۶٫۳٫۹ — ایجنت اختصاصی
`TransactionsContractsAgent` — دامنه: چرخهٔ حیات معامله و قرارداد.

### ۶٫۳٫۱۰ — API endpoints
`GET /api/crm/transactions` · `POST /api/crm/transactions/sync` · `GET /api/crm/contracts` · `POST /api/crm/finance/commission` (محاسبهٔ حق‌السهم).

### ۶٫۳٫۱۱ — اسکرین‌شات شاهد
`download/p6547/screens/07-m3-share-branch.png` + شات‌های ۲تم P6549.

---

## ۶٫۴ — کاشی M4 «کارشناسان ملک تبریز» (`experts`)

### ۶٫۴٫۱ — هویت
- **شناسه:** `experts` · **نسخه:** `2.0.0` · **مسیر:** `/?tile=experts`
- **صفحه:** `ExpertsPage.tsx` (۶۰۳ خط)

### ۶٫۴٫۲ — رنگ اختصاصی
کلید `m4` — سبز-فیروزه‌ای: `50:#e5f9f0 · 100:#d0f1e2 · 300:#88c7ad · 500:#008d5e · 700:#005233` (`palette13.json` §11)

### ۶٫۴٫۳ — هدف
پرسنل و کارشناسان از سامانهٔ PM (سامانهٔ مدیریت پرسنلی) با ساختار استخدام/شعبه/نقش/تماس + عملکرد (مبایعه/اجاره) + تعاملات — چسبیده به دادهٔ ARM از طریق کد پرسنلی.

### ۶٫۴٫۴ — ستون‌های فهرست (۱۲ ستون — `ExpertsPage.tsx:442-459`)
| # | ستون | فرمت | رنگ‌بندی |
|---|---|---|---|
| ۱ | ردیف | عدد فارسی | خنثی |
| ۲ | کارشناس | نام + موبایل زیر نام | fg |
| ۳ | تاریخ استخدام | تاریخ کوتاه شمسی (از personnelInfo) | خنثی |
| ۴ | کد پرسنلی | عدد فارسی؛ **رکوردهای بدون کد = «-»** (قاعدهٔ دستور مالک) | fg |
| ۵ | شعبه | از PM businesses | باج |
| ۶ | نقش پرسنلی | از ساختار PM (P6546/گام۴-۴) | باج |
| ۷ | نوع همکاری | employeementInfo.typeFa (P6547/گام۴) | باج |
| ۸ | شماره داخلی | voipInfo از PM (P6547/گام۴) | عددی |
| ۹ | مبایعه نامه | شمار معاملات فروش | عددی سبز |
| ۱۰ | اجاره نامه | شمار معاملات اجاره | عددی آبی |
| ۱۱ | آدرس کارشناس | contactInfo.address از PM (کشف P6549) | fg |
| ۱۲ | وضعیت | فعال/غیرفعال/معلق | باج وضعیت |

### ۶٫۴٫۵ — فیلترها (`ExpertsPage.tsx:274-378`)
کارشناس (نام یا موبایل — متنی) · کد پرسنلی (متنی) · شعبه (تک‌انتخابی) · وضعیت (تک‌انتخابی) · مبایعه‌نامه از/تا (بازهٔ عددی) · اجاره‌نامه از/تا (بازهٔ عددی) · آدرس کارشناس (متنی) · نقش/نوع همکاری/داخلی (ستون‌محور).

### ۶٫۴٫۶ — بینش‌های ایجنت
COMPOSITION (ترکیب نقش/شعبه) · ACTIVITY (فعالیت اخیر) · GROWTH (رشد) · NETWORK (شبکهٔ تعاملات) · RISK (ریسک رکود) · VISIT_LEADERSHIP (پربازدیدها) · DEAL_ACTIVITY (معامله‌گران برتر) · COVERAGE (پوشش ستون‌ها) — ایجنت `expert-agent.ts`.

### ۶٫۴٫۷ — جداول و نمودارها
جدول Top کارشناسان (مبایعه + اجاره) · نمودار توزیع شعبه (Bar) · جدول تعاملات مشاور×مشاور با درجهٔ همکاری · جدول پوشش ۱۲ ستون.

### ۶٫۴٫۸ — دکمه‌های بروزرسانی
سه دکمهٔ Tier-aware: «پرسنل PM» (realtors/list → realtors/info/personnelInfo → contactInfo → uploadedDocuments زنجیره‌ای) · «تعاملات ARM» (realtor-interactions) · «کارگزاری‌ها» (special-properties) — همه با تاریخ دقیق و checkpoint.

### ۶٫۴٫۹ — ایجنت اختصاصی
`ExpertAgent` — دامنه: عملکرد و سلامت شبکهٔ کارشناسان.

### ۶٫۴٫۱۰ — API endpoints
`GET /api/crm/experts` · `GET /api/crm/interactions` · `POST /api/sync/all?type=pm` · `GET /api/pm/connection`.

### ۶٫۴٫۱۱ — اسکرین‌شات شاهد
`download/p6547/screens/08-m4-experts-pm.png` + شات‌های ۲تم P6549.

---

## ۶٫۵ — کاشی M5 «تطبیق هوشمند ملک تبریز» (`smart-matching`)

### ۶٫۵٫۱ — هویت
- **نام فارسی:** تطبیق هوشمند ملک تبریز · **شناسه:** `smart-matching` · **نسخه:** `1.0.0` · **مسیر:** `/?tile=smart-matching`
- **فایل تعریف:** `src/core/tiles/tiles/smart-matching/index.ts` · **صفحه:** `SmartMatchingPage.tsx` · **موتور:** `src/core/matching/matching-engine.ts` (۴۱۰ خط) + `opportunity-listener.ts`

### ۶٫۵٫۲ — رنگ اختصاصی
کلید `m5` — بنفش ارغوانی: `50:#f5f3ff · 100:#ede9fe · 300:#c4b5fd · 500:#7c3aed · 700:#4c1d95` (`tailwind.config.ts:71`)

### ۶٫۵٫۳ — هدف کاشی
تطبیق دوجهتهٔ آگهی ↔ درخواست: تب ۱ «از آگهی» پنج درخواست برتر را برای یک آگهی پیشنهاد می‌دهد؛ تب ۲ «از درخواست» پنج آگهی برتر را. هر پیشنهاد **امتیاز و دلیل شفاف** دارد (هر عامل چقدر در امتیاز سهم داشته است).

### ۶٫۵٫۴ — ستون‌های جدول نتایج (۵ برتر)
| # | ستون | فرمت |
|---|---|---|
| ۱ | ردیف | عدد فارسی |
| ۲ | کد طرف مقابل (آگهی/درخواست) | عدد فارسی + لینک به کاشی مربوط |
| ۳ | عنوان/خلاصه | متن کوتاه |
| ۴ | امتیاز تطبیق کل | درصد فارسی + نوار پیشرفت رنگ m5 |
| ۵ | تفکیک عوامل | چیپ هر عامل (قیمت/منطقه/نوع/دسته/تازگی) با درصد |
| ۶ | دلیل | جملهٔ فارسی گویا («منطقه هر دو خاوران است و اختلاف قیمت ۸٪ زیر درخواست») |

### ۶٫۵٫۵ — فیلترها
سمت ورودی (انتخاب آگهی/درخواست مبنا): جست‌وجوی کد · دسته‌بندی · نوع ملک · بازهٔ قیمت · منطقه. سمت خروجی: آستانهٔ حداقل امتیاز (اسلایدر) · حذف موارد ردشدهٔ قبلی.

### ۶٫۵٫۶ — بینش‌های ایجنت
دامنهٔ MATCH: کیفیت میانگین تطبیق‌ها · «شکارهای سخت» (تطبیق با امتیاز بالا که دستی پیدا نمی‌شدند) · شکاف‌های قیمت سیستماتیک · روند پذیرش/رد پیشنهادها.

### ۶٫۵٫۷ — جداول و نمودارها
جدول دوجهتهٔ برترین‌ها (۵+۵) · نمودار میله‌ای افکی تفکیک عوامل برای مورد انتخابی · نرخ پذیرش تاریخی (LineChart).

### ۶٫۵٫۸ — دکمه‌های بروزرسانی
«بازتولید شاخص‌ها» (پس از sync تازه) · «بازآموزی وزن‌ها» (Tier-aware — وزن عوامل از پذیرش/ردهای واقعی دوباره آموزش می‌بیند).

### ۶٫۵٫۹ — ایجنت اختصاصی
دامنهٔ `MATCH` با همان BaseLearningAgent (حافظه + بازخورد + سیاست نسخه‌دار).

### ۶٫۵٫۱۰ — API endpoints
`GET /api/matching?propertyCode=…` · `GET /api/matching?requestCode=…` · `POST /api/matching` (ثبت پذیرش/رد → حلقهٔ یادگیری) — `src/app/api/matching/route.ts`.

### ۶٫۵٫۱۱ — دسترسی و شاهد
OWNER-gate (تنها مالک) · الگوریتم: فیلتر سخت + امتیاز نرم ۵عامله (قیمت، منطقه، نوع، دسته، تازگی) — سربرگ `smart-matching/index.ts`.

## ۶٫۶ — کاشی M6 «شاخص بازار ملک تبریز» (`market-index`)

### ۶٫۶٫۱ — هویت
- **شناسه:** `market-index` · **نسخه:** `1.0.0` · **مسیر:** `/?tile=market-index` · **صفحه:** `MarketIndexPage.tsx`

### ۶٫۶٫۲ — رنگ اختصاصی
کلید `m6` — لیمویی: `50:#f7fee7 · 100:#ecfccb · 300:#d9f99d · 500:#65a30d · 700:#3f6212` (`tailwind.config.ts:72`)

### ۶٫۶٫۳ — هدف
تصویر کلان بازار از دادهٔ واقعی: روند قیمت ماهانه (شمسی)، ۱۰ منطقهٔ پرتقاضا، تفکیک انواع ملک، و مقایسهٔ معاملات واقعی در برابر آگهی‌های فعال و درخواست‌های باز.

### ۶٫۶٫۴ — ستون‌های جدول مناطق
| # | ستون | فرمت |
|---|---|---|
| ۱ | ردیف | عدد فارسی |
| ۲ | منطقه | نام |
| ۳ | میانگین قیمت هر متر | جداکنندهٔ فارسی |
| ۴ | تغییر ماه اخیر | درصد با جهت (▲/▼ فارسی) — سبز/سرخ |
| ۵ | شمار معاملهٔ ماه | عدد فارسی |
| ۶ | شمار آگهی فعال | عدد فارسی |
| ۷ | شمار درخواست باز | عدد فارسی |

### ۶٫۶٫۵ — فیلترها
نوع معامله (فروش/اجاره/...) · نوع ملک · شهر/منطقه · بازهٔ زمانی (ماه‌های شمسی).

### ۶٫۶٫۶ — بینش‌های ایجنت
دامنهٔ MARKET: جهت بازار (صعودی/نزولی/خنثی با شاهد درصدی) · داغ‌ترین منطقه (بیشترین رشد) · واگرایی عرضه/تقاضا (آگهی↑ ولی معامله↓).

### ۶٫۶٫۷ — جداول و نمودارها
LineChart روند قیمت ماهانه (دو-سری: میانگین + ناحیهٔ اعتماد) · BarChart ۱۰ منطقهٔ پرتقاضا · ComposedChart سری سه‌گانهٔ حجم (Bar معامله + Line آگهی + Line درخواست).

### ۶٫۶٫۸ — دکمه‌های بروزرسانی
«بروزرسانی شاخص‌ها» — کشیدن مقادیر روز `configs/current-prices` + تاریخچه‌سازی در `PriceIndexHistory` (Tier-aware).

### ۶٫۶٫۹ — ایجنت اختصاصی
دامنهٔ `MARKET` با BaseLearningAgent.

### ۶٫۶٫۱۰ — API endpoints
`GET /api/market-index` · `POST /api/sync/all?type=prices`.

### ۶٫۶٫۱۱ — دسترسی و شاهد
OWNER-gate · منبع داده: `MarketPriceStat` + `PriceIndexHistory` + معاملات واقعی.

## ۶٫۷ — کاشی M7 «پوشش اطلاعات ملک تبریز» (`data-coverage`)

### ۶٫۷٫۱ — هویت
- **شناسه:** `data-coverage` · **نسخه:** `1.0.0` · **مسیر:** `/?tile=data-coverage` · **صفحه:** `DataCoveragePage.tsx`

### ۶٫۷٫۲ — رنگ اختصاصی
کلید `m7` — آبی: `50:#eff6ff · 100:#dbeafe · 300:#bfdbfe · 500:#2563eb · 700:#1e40af` (`tailwind.config.ts:73`)

### ۶٫۷٫۳ — هدف
پاسخ دائمی به پرسش «آیا ستونی بدون اطلاعات مانده؟» — درصد پر بودن هر ستون فهرست‌های M1-M4 + مسیر پر شدن (کدام endpoint غنی می‌کند) + لیست رکوردهای ناقص برای دیمن تکمیل.

### ۶٫۷٫۴ — ستون‌های جدول پوشش
| # | ستون | فرمت |
|---|---|---|
| ۱ | کاشی | نام + رنگ همان بخش (m1..m4) |
| ۲ | ستون | نام ستون |
| ۳ | تعداد رکورد پر | عدد فارسی |
| ۴ | تعداد کل | عدد فارسی |
| ۵ | درصد پوشش | عدد + نوار پیشرفت رنگی (سبز≥۸۰ · زرد≥۵۰ · قرمز<۵۰) |
| ۶ | منبع تکمیل | مسیر endpoint غنی‌ساز |

### ۶٫۷٫۵ — فیلترها
کاشی (M1/M2/M3/M4/همه) · بازهٔ درصد · فقط ستون‌های بحرانی.

### ۶٫۷٫۶ — بینش‌های ایجنت
دامنهٔ COVERAGE: ستون‌های بحرانی (قرمز) · روند بهبود پوشش (مقایسه با حسابرسی قبل) · تخمین زمان تکمیل با نرخ دیمن.

### ۶٫۷٫۷ — جداول و نمودارها
جدول پوشش کامل (۱۶+۱۳+۱۱+۱۲ ستون) · BarChart افقی درصد به تفکیک کاشی · نمایش Tier سیستم (پیشرفت به سطح دادهٔ کامل).

### ۶٫۷٫۸ — دکمه‌های بروزرسانی
«حسابرسی تازهٔ پوشش» (اجرای حسابرسی سطح-DB همان لحظه) · «تکمیل هدفمند» (پیشنهاد rowIds ناقص به دیمن).

### ۶٫۷٫۹ — ایجنت اختصاصی
دامنهٔ `COVERAGE` با BaseLearningAgent.

### ۶٫۷٫۱۰ — API endpoints
`GET /api/coverage` (حسابرسی زندهٔ شمارش پر/خالی هر ستون با SQL).

### ۶٫۷٫۱۱ — شاهد
حکم حسابرسی P6549: «هیچ ستونی بدون داده نیست» — آدرس PM تقریباً کامل · قیمت قرارداد M3 پوشش بالا · موبایل متقاضی M2 در حال پرشدن پیوسته با دیمن.

## ۶٫۸ — کاشی M8 «مغز ملکا — یادگیری و Tier» (`learning-tier`)

### ۶٫۸٫۱ — هویت
- **شناسه:** `learning-tier` · **نسخه:** `1.0.0` · **مسیر:** `/?tile=learning-tier` · **صفحه:** `LearningTierPage.tsx`

### ۶٫۸٫۲ — رنگ اختصاصی
کلید `m8` — فیروزه‌ای: `50:#f0fdfa · 100:#ccfbf1 · 300:#99f6e4 · 500:#0d9488 · 700:#134e4a` (`tailwind.config.ts:74`)

### ۶٫۸٫۳ — هدف
پنجرهٔ مدیریتی به «باطن» ملکا: وضعیت حلقهٔ یادگیری، Tier هر مدل، تصمیم‌های در انتظار شورا، تختهٔ سیاه موتورها و نتیجهٔ ۲۵ بررسی خودتشخیصی.

### ۶٫۸٫۴ — ساختار صفحه (کارت‌محور به‌جای فهرست ردیفی)
| # | کارت/بخش | محتوا |
|---|---|---|
| ۱ | Tier مدل‌ها | هر مدل: نام + Tier فعلی (T0..T4) + نوار پیشرفت + آخرین Brier |
| ۲ | روند Brier | LineChart سری زمانی ارزیابی‌ها + ناحیهٔ هدف (خط مبنا) |
| ۳ | تصمیم‌های در انتظار | صف `requires_council` با rationale + دکمهٔ تأیید/رد |
| ۴ | تختهٔ سیاه | آخرین ورودی‌های Blackboard به تفکیک namespace (p7..daemon) |
| ۵ | خودتشخیصی | وضعیت ۲۵ بررسی P10: سبز/زرد/قرمز با جزئیات |
| ۶ | ترمیم‌ها | پیشنهادهای P11 + وضعیت اجرا |

### ۶٫۸٫۵ — فیلترها
انتخاب مدل/دامنه · بازهٔ زمانی ارزیابی‌ها · فقط بررسی‌های نارنجی/قرمز.

### ۶٫۸٫۶ — بینش‌های ایجنت
دامنه‌های LEARNING (روند یادگیری مدل‌ها) + DIAGNOSIS (سلامت سیستم از دید P10).

### ۶٫۸٫۷ — جداول و نمودارها
جدول مدل‌ها (Tier/Brier/آخرین ارزیابی) · LineChart روند Brier · جدول تصمیم‌ها · جدول بررسی‌ها.

### ۶٫۸٫۸ — دکمه‌های بروزرسانی
«اجرای تیک مغز» (اجرای دستی یک دور حلقه) · «بازآموزی/کالیبراسیون» (بازآموزی مدل منتخب — Tier-aware).

### ۶٫۸٫۹ — ایجنت اختصاصی
دامنه‌های LEARNING + DIAGNOSIS با BaseLearningAgent.

### ۶٫۸٫۱۰ — API endpoints
`GET /api/intelligence/status` · `GET /api/intelligence/blackboard` · `GET /api/health`.

### ۶٫۸٫۱۱ — شاهد
`download/p6545/screens/m8-learning-tier.png` · `download/p6537/screens/brain-card-p7-p11.png` · گزارش‌های JSON در `download/p6537/`.

---

## ۶٫۹ — کاتالوگ وضعیت‌های سامانهٔ ARM (پایهٔ ستون «وضعیت»)

**وضعیت‌های ده‌گانهٔ آگهی** (`src/lib/listing-status.ts:56-205` — نرمال‌سازی + نگاشت rawValues خام):

| کلید | برچسب فارسی | معنا |
|---|---|---|
| `traded` | معامله شده | ملک این آگهی معامله شده است |
| `published` | منتشر شده | آگهی در سامانهٔ ARM منتشر است |
| `private` | نمایش خصوصی | آگهی فقط به‌صورت خصوصی نمایش داده می‌شود |
| `expired` | منقضی شده | اعتبار آگهی پایان یافته |
| `rejectedByAdmin` | رد توسط مدیر | مدیر ARM آگهی را رد کرده |
| `pendingAdmin` | در انتظار تایید مدیر | در صف تأیید مدیر |
| `pendingConsultant` | در انتظار تایید مشاور | در صف تأیید مشاور |
| `pendingReview` | در انتظار بررسی مشاور | نیازمند بررسی مشاور |
| `recoverable` | فایل قابل احیا | قابل بازگشت به چرخه |
| `unrecoverable` | فایل غیر قابل احیا | غیرقابل بازگشت |

**وضعیت‌های شش‌گانهٔ درخواست** (`src/lib/request-status.ts`):

| کلید | برچسب |
|---|---|
| `traded` | معامله شده |
| `pendingTrade` | در انتظار معامله |
| `lead` | سرنخ |
| `pendingApproval` | در انتظار تایید |
| `lostToCompetitors` | از دست رفته/خرید از رقبا |
| `other` | سایر |

---

## ۶٫۱۰ — قواعد مشترک همهٔ کاشی‌های M1-M4 (قانون فهرست و ظاهر)

۱. **تک‌صفحه‌ای بدون صفحه‌بندی** — سقف ۲۵٬۰۰۰ ردیف فقط گارد ایمنی سرور است (قانون P6525).
۲. **رندر پنجره‌ای (VirtualTable):** `<TableBodyVirtual rows rowKey>` — تا ۲۰۰ ردیف رفتار عادی؛ بالاتر فقط ~۴۰ ردیف قابل‌دیدن در DOM + دو فاصله‌گذار؛ ریاضیات از `src/lib/virtual-window.ts` (قانون P6527).
۳. **سرستون‌های sticky و وسط‌چین**؛ فونت سلول‌ها `text-xs` یکدست (`src/components/ui/table.tsx`).
۴. **هماهنگی رنگ فیلتر↔فهرست:** همان رنگی که گزینهٔ فیلتر دارد، باج همان مقدار در فهرست دارد (`value-colors.ts` با گارد عدم‌تکرار رنگ).
۵. **فیلتر جمع‌وجور موبایل:** گرید ۲-۳ ستونه + آکاردئون در موبایل، باز در دسکتاپ (قانون ۰۳۵-B/ت).
۶. **کشیدن-برای-تازه‌سازی** (Pull-to-Refresh) روی هر چهار فهرست (`use-pull-to-refresh.tsx`).
۷. **حالت‌های خالی/خطا/آفلاین طراحی‌شده مشترک** (`list-states.tsx` — نه رشته‌های بداهه).
۸. **«-» برای مقدار غایب** (قاعدهٔ کدپرسنلی بدون داده و همهٔ ستون‌های اختیاری).
۹. **قیمت همیشه با فرمت `۹،۰۰۰،۰۰۰،۰۰۰`** و بازه‌ها به‌صورت «از … تا …».

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

---

# فصل ۹ — سیستم طراحی (Design System)

> مرجع کد: `DESIGN-SYSTEM.md` (ریشه) + `src/app/globals.css` (توکن‌های CSS) + `src/lib/palette13.json` (پالت ۱۳×۵) + `tailwind.config.ts` (نگاشت) — قانون حاکم: **قانون ظاهر فاخر ۰۳۵-B (جلسهٔ ۰۳۳)**.

## ۹٫۱ — نظام رنگ: ۱۳ بخش × ۵ سایه

**۱۳ رنگ اختصاصی** (یک رنگ به ازای هر بخش/کاشی اصلی) با پنج سایهٔ **50 / 100 / 300 / 500 / 700** به‌علاوهٔ رنگ متن (`fg`). ویژگی‌های کلیدی:

- **تخصیص بهینه DP:** رنگ‌ها با الگوریتم برنامه‌نویسی پویا (بیت‌مَسک) روی چرخهٔ حداکثر-فاصله تخصیص یافتند؛ کمینهٔ فاصلهٔ hue = **۲۷٫۷°** که سقف ریاضی برای ۱۳ رنگ است (قید ≥۳۰° فقط با ≤۱۲ رنگ ممکن است — سند صادقانهٔ `honestNote` در `palette13.json:8`).
- **کنتراست WCAG AA:** همهٔ جفت‌های متنی الزامی ≥ ۴٫۵:۱ — با **کنتراست خودتنظیم** (اگر سایهٔ ۵۰۰ روی پس‌زمینه کم‌کنتراست شد، متن به سایهٔ ۷۰۰ یا رنگ روشن جابه‌جا می‌شود).
- **صفر رنگ خالص** (no `#FF0000`-style raw colors در کد؛ همه از توکن‌ها).
- **هارمونی فیلتر↔فهرست:** رنگ گزینهٔ فیلتر = رنگ همان مقدار در ستون فهرست؛ گارد عدم‌تکرار رنگ در `value-colors.ts`.

### جدول کامل پالت (از `src/lib/palette13.json`)

| # | کلید | بخش | hue° | 50 | 100 | 300 | 500 | 700 | fg |
|---|---|---|---|---|---|---|---|---|---|
| ۱ | `login` | صفحهٔ ورود | 304.6 | #f7f0ff | #eee2fe | #c2acdf | #8758b9 | #4f2e6f | #FAFBFC |
| ۲ | `home` | صفحهٔ هوم | 221.5 | #e2f8ff | #cceffb | #80c3da | #0084b0 | #004c6a | #0A0E1A |
| ۳ | `finder` | فایل‌یابی ملکا | 193.8 | #e1f9f8 | #caf1f0 | #7cc7c5 | #008c8c | #005152 | #0A0E1A |
| ۴ | `melka-listing` | آگهی ملکا | 110.8 | #f4f5e2 | #e9ebcd | #b9bc84 | #747500 | #424200 | #FAFBFC |
| ۵ | `melka-request` | درخواست ملکا | 27.7 | #ffeeea | #ffded9 | #e4a69d | #bb483f | #70231e | #FAFBFC |
| ۶ | `settings` | تنظیمات عمومی | 249.2 | #e7f5ff | #d4ebff | #92bce6 | #0c76c6 | #004378 | #FAFBFC |
| ۷ | `mgmt` | داشبورد مدیریتی | 83.1 | #fcf2e1 | #f5e6ca | #cfb480 | #9d6700 | #5d3900 | #FAFBFC |
| ۸ | `m1` | M1 آگهی ملک تبریز | 138.5 | #ebf8e8 | #dbefd5 | #a0c395 | #3b821e | #1b4b04 | #FAFBFC |
| ۹ | `m2` | M2 درخواست ملک تبریز | 55.4 | #fff0e4 | #fee2cf | #deab89 | #b35500 | #6b2c00 | #FAFBFC |
| ۱۰ | `m3` | M3 معاملات ملک تبریز | 0.0 | #ffedf3 | #ffdde7 | #e0a4b5 | #b5466f | #6d213f | #FAFBFC |
| ۱۱ | `m4` | M4 کارشناسان ملک تبریز | 166.2 | #e5f9f0 | #d0f1e2 | #88c7ad | #008d5e | #005233 | #0A0E1A |
| ۱۲ | `consultant` | صفحهٔ مشاور (ایجنت) | 332.3 | #feeefb | #f9dff4 | #d5a6cd | #a44c99 | #61265a | #FAFBFC |
| ۱۳ | `ai` | هوش مصنوعی/گزارش‌ها | 276.9 | #eff2ff | #e1e6ff | #abb4e8 | #5f67c9 | #34387a | #FAFBFC |

> کاشی‌های M5-M8 که پس از پالت ۱۳ اصلی افزوده شدند، توکن‌های موازی `sec-m5..m8` در `tailwind.config.ts:71-74` دارند (بنفش ارغوانی/لیمویی/آبی/فیروزه‌ای).

### تم روشن و تاریک

| توکن | روشن | تاریک |
|---|---|---|
| پس‌زمینهٔ صفحه | `#FAFBFC` | `#0F1419` |
| کارت | `#FFFFFF` | `#1A1F2E` |
| مرز | `#E5E7EB` | `#2D3446` |
| متن اصلی | `#0A0E1A` | `#FAFBFC` |
| متن فرعی | `#4B5563` | `#9CA3AF` |

- سه حالت تم: **روشن (پیش‌فرض) / تاریک / سیستم** (`prefers-color-scheme`) — سوییچ در تنظیمات عمومی.
- انتقال تم نرم ۳۰۰ms با کلاس `theme-transition` و احترام `prefers-reduced-motion` (`src/lib/theme-transition.ts`).
- دارک‌مود از کلاس Tailwind `darkMode: "class"` (`tailwind.config.ts:5`).

## ۹٫۲ — تایپوگرافی

| مورد | انتخاب |
|---|---|
| خانوادهٔ فونت | **وزیرمتن (Vazirmatn)** — بومی و خودمیزبان در `public/fonts/` (۴ وزن عربی/فارسی: 400/500/700/800 + ۳ وزن لاتین) |
| بارگذاری | `font-display: swap`؛ فقط woff2؛ بدون CDN خارجی |
| اندازهٔ بدنه | `text-sm` (۱۴px) برای متن جاری؛ `text-xs` (۱۲px) سلول‌های جدول (قانون فهرست) |
| عناوین | مقیاس: `text-2xl` عنوان کاشی · `text-lg` بخش · `text-sm font-bold` کارت |
| ارقام | **ارقام فارسی** همه‌جا (`faNumber`)؛ اعداد لاتین فقط در شناسهٔ فنی (BUILD_ID) |
| جهت | `dir="rtl"` و `lang="fa"` در ریشهٔ `layout.tsx` |

## ۹٫۳ — کامپوننت‌های مشترک (۱۵+)

| کامپوننت | مسیر | نقش |
|---|---|---|
| TileCard / TileShell | `components/app/` | کارت کاشی / پوستهٔ صفحهٔ کاشی (هدر+بازگشت+محتوا) |
| AppHeader | `components/app/` | هدر بخش با رنگ و آیکون همان بخش |
| SplashScreen | `components/app/SplashScreen.tsx` | اسپلش برند کم‌موج در بوت |
| BottomNav | `components/app/BottomNav.tsx` | ناوبری پایین ۵آیتمی: safe-area + رنگ بخش فعال + ARIA + هدف لمس ≥۴۴px |
| AgentPanel | `components/app/AgentPanel.tsx` | پنل بینش‌ها + بازخورد + سیاست ایجنت |
| KpiCard | `components/app/shared/kpi-card.tsx` | شاخص عددی با برچسب و رنگ |
| CoverageTable | `components/app/shared/coverage-table.tsx` | جدول پوشش ستون‌ها |
| TopRankingTable | `components/app/shared/top-ranking-table.tsx` | جدول Top-N استاندارد |
| ListStates | `components/app/shared/list-states.tsx` | Skeleton / Empty / Error / Offline طراحی‌شده مشترک |
| DataSource | `components/app/shared/data-source.tsx` | برچسب «منبع داده + آخرین بروزرسانی» |
| StepReportList | `components/app/shared/step-report-list.tsx` | گزارش گام‌های همگام‌سازی |
| JalaliDatePicker | `components/ui/jalali-date-picker.tsx` | تقویم ماهانهٔ RTL شنبه‌محور + «امروز» |
| BottomSheet | `components/ui/bottom-sheet.tsx` | کشوی پایینی (vaul) — فایل مناطق و... |
| Table (primitives) | `components/ui/table.tsx` | قانون‌ساز فهرست‌ها + `TableBodyVirtual` |
| InstallButton / OfflineBadge / VersionBadge / ConnectionIndicators | `components/app/` | اجزای PWA وضعیت |
| OpenInNewTabButton | `components/app/` | باز کردن کاشی در تب جدید |

## ۹٫۴ — انیمیشن‌ها و تعامل

- **Ripple لمسی** روی همهٔ دکمه‌ها/کارت‌ها (CSS `active:scale-[0.98]` + ripple class).
- **Haptic** (`src/lib/haptics.ts`): بازخورد لرزشی با گارد `navigator.vibrate` — خاموش روی دستگاه‌های بدون پشتیبانی.
- **Pull-to-Refresh** در چهار فهرست M1-M4 (`use-pull-to-refresh.tsx`).
- **framer-motion** برای Splash/انتقال‌ها با `MotionConfig reducedMotion="user"`.
- **CLS ≤ ۰٫۱:** چیدمان‌های ثابت پیش از داده (Skeleton هم‌هندسهٔ محتوا) — سنجش Lighthouse: CLS=۰٫۰۰۱.

## ۹٫۵ — Safe Area و موبایل‌اولی

- `viewport-fit=cover` + `env(safe-area-inset-*)` در BottomNav و BottomSheet و هدر.
- نقطهٔ شکست: `<768px` موبایل (`use-mobile.ts`) — گرید فیلتر ۲ ستونه، آکاردئون فیلترها، جدول با اسکرول افقی و سرستون sticky.

## ۹٫۶ — دسترس‌پذیری (WCAG AA)

- کنتراست ≥۴٫۵:۱ همهٔ جفت‌های متنی (سنجش خودکار در تولید پالت).
- حلقهٔ فوکوس واضح روی همهٔ عناصر تعاملی؛ ترتیب منطقی تب.
- آیکون‌ها `aria-hidden`؛ جدول‌ها با `caption/aria`؛ ناوبری با `role/aria-current`.
- Lighthouse Accessibility = **۱۰۰** (شاهد P6549 — بیلد production).

## ۹٫۷ — PWA — متن کامل Manifest

```json
{
  "name": "اکوسیستم هوشمند ملک ایران (ملکا)",
  "short_name": "ملکا",
  "description": "ملکا — اکوسیستم هوشمند ملک ایران: لایه هوش تحلیلی و مدیریتی چندعامله روی سامانه‌های ملک تبریز",
  "lang": "fa",
  "dir": "rtl",
  "id": "/",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait-primary",
  "background_color": "#FAFBFC",
  "theme_color": "#007776",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/maskable-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "maskable"
    },
    {
      "src": "/icons/maskable-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ],
  "shortcuts": [
    {
      "name": "آگهی ملک تبریز (M1)",
      "short_name": "آگهی‌ها",
      "url": "/?tile=arm-listings",
      "icons": [
        {
          "src": "/icons/icon-192.png",
          "sizes": "192x192"
        }
      ]
    },
    {
      "name": "درخواست ملک تبریز (M2)",
      "short_name": "درخواست‌ها",
      "url": "/?tile=arm-requests",
      "icons": [
        {
          "src": "/icons/icon-192.png",
          "sizes": "192x192"
        }
      ]
    },
    {
      "name": "معاملات ملک تبریز (M3)",
      "short_name": "معاملات",
      "url": "/?tile=transactions-contracts",
      "icons": [
        {
          "src": "/icons/icon-192.png",
          "sizes": "192x192"
        }
      ]
    }
  ],
  "screenshots": [
    {
      "src": "/screenshots/mobile-home.png",
      "sizes": "412x915",
      "type": "image/png",
      "form_factor": "narrow",
      "label": "خانهٔ ملکا روی موبایل — پنج کاشی و ناوبری پایین"
    },
    {
      "src": "/screenshots/desktop-m1.png",
      "sizes": "1280x800",
      "type": "image/png",
      "form_factor": "wide",
      "label": "فهرست آگهی‌های ملک تبریز روی دسکتاپ"
    }
  ]
}
```

**نکات کلیدی manifest:** نام رسمی «اکوسیستم هوشمند ملک ایران (ملکا)» · `dir: rtl`, `lang: fa` · `display: standalone`, `orientation: portrait-primary` · آیکون any+maskable در ۱۹۲/۵۱۲ · ۳ میان‌بر (M1/M2/M3 با `?tile=`) · ۲ اسکرین‌شات واقعی (narrow 412×915 + wide 1280×800).

## ۹٫۹ — متن کامل پالت (`src/lib/palette13.json`)

> عین فایل — شامل متادیتای تولید (الگوریتم DP، فاصلهٔ hue، قاعدهٔ کنتراست، یادداشت صادقانهٔ سقف ریاضی ۱۳ رنگ) و همهٔ ۱۳ بخش با پنج سایه + رنگ متن.

```json
{
  "meta": {
    "title": "نظام رنگ ۱۳بخش×۵سایه — قانون ظاهر فاخر ملکا ۰۳۵-B",
    "uniqueColors": 13,
    "minHueGap": 27.6,
    "maxPossibleGapFor13": 27.7,
    "honestNote": "شرط ≥۳۰° فقط با ≤۱۲ رنگ روی چرخهٔ ۳۶۰° ممکن است (۱۲×۳۰=۳۶۰)؛ قانون ۰۳۵-B خود «۱۳ بخش» را الزامی کرده ⇒ حداکثر فاصلهٔ ممکن ۲۷٫۷° اعمال شد و تمایز ادراکی با تفکیک روشنایی/اشباع سایه‌ها تقویت شد.",
    "shades": [
      "50",
      "100",
      "300",
      "500",
      "700"
    ],
    "contrastRule": "WCAG AA >= 4.5:1 — همهٔ جفت‌های الزامی",
    "allPass": true
  },
  "gapsSorted": [
    {
      "hue": 0,
      "gapToNext": 27.7
    },
    {
      "hue": 27.7,
      "gapToNext": 27.7
    },
    {
      "hue": 55.4,
      "gapToNext": 27.7
    },
    {
      "hue": 83.1,
      "gapToNext": 27.7
    },
    {
      "hue": 110.8,
      "gapToNext": 27.7
    },
    {
      "hue": 138.5,
      "gapToNext": 27.7
    },
    {
      "hue": 166.2,
      "gapToNext": 27.6
    },
    {
      "hue": 193.8,
      "gapToNext": 27.7
    },
    {
      "hue": 221.5,
      "gapToNext": 27.7
    },
    {
      "hue": 249.2,
      "gapToNext": 27.7
    },
    {
      "hue": 276.9,
      "gapToNext": 27.7
    },
    {
      "hue": 304.6,
      "gapToNext": 27.7
    },
    {
      "hue": 332.3,
      "gapToNext": 27.7
    }
  ],
  "sections": [
    {
      "n": 1,
      "key": "login",
      "fa": "صفحهٔ ورود",
      "hue": 304.6,
      "anchor": 263,
      "s50": "#f7f0ff",
      "s100": "#eee2fe",
      "s300": "#c2acdf",
      "s500": "#8758b9",
      "s700": "#4f2e6f",
      "d50": "#2d2537",
      "d100": "#3b2f4a",
      "d300": "#5f4979",
      "d500": "#b592df",
      "d700": "#d0bee7",
      "fg": "#FAFBFC",
      "dfg": "#0F172A",
      "contrast": {
        "fg_on_500": 4.90836498499732,
        "700_on_50": 9.622928064619458,
        "700_on_100": 8.645036966713084,
        "700_on_300": 5.237770747846619,
        "700_on_card": 10.363263423698367,
        "dark_fg_on_500": 6.906937886149633,
        "dark_700_on_50": 8.580319250644642,
        "dark_700_on_100": 7.238075683659883,
        "dark_700_on_card": 5.454006854174206
      },
      "pass": true
    },
    {
      "n": 2,
      "key": "home",
      "fa": "صفحهٔ هوم",
      "hue": 221.5,
      "anchor": 222,
      "s50": "#e2f8ff",
      "s100": "#cceffb",
      "s300": "#80c3da",
      "s500": "#0084b0",
      "s700": "#004c6a",
      "d50": "#132d35",
      "d100": "#123b48",
      "d300": "#095f75",
      "d500": "#3cb4d8",
      "d700": "#9cd1e3",
      "fg": "#0A0E1A",
      "dfg": "#0F172A",
      "contrast": {
        "fg_on_500": 4.502380267584876,
        "700_on_50": 8.546704498261748,
        "700_on_100": 7.730969454703346,
        "700_on_300": 4.798345886456974,
        "700_on_card": 9.077634223519638,
        "dark_fg_on_500": 7.433037641038083,
        "dark_700_on_50": 8.704882417890992,
        "dark_700_on_100": 7.246962184265943,
        "dark_700_on_card": 5.6433662251306975
      },
      "pass": true
    },
    {
      "n": 3,
      "key": "finder",
      "fa": "فایل‌یابی ملکا",
      "hue": 193.8,
      "anchor": 200,
      "s50": "#e1f9f8",
      "s100": "#caf1f0",
      "s300": "#7cc7c5",
      "s500": "#008c8c",
      "s700": "#005152",
      "d50": "#112e2e",
      "d100": "#0d3d3d",
      "d300": "#006362",
      "d500": "#2abbb9",
      "d700": "#9ad4d2",
      "fg": "#0A0E1A",
      "dfg": "#0F172A",
      "contrast": {
        "fg_on_500": 4.704009105615099,
        "700_on_50": 8.290780714164171,
        "700_on_100": 7.509409215845463,
        "700_on_300": 4.686582398409278,
        "700_on_card": 8.779632507287966,
        "dark_fg_on_500": 7.560708441277738,
        "dark_700_on_50": 8.728964534795393,
        "dark_700_on_100": 7.243703075936725,
        "dark_700_on_card": 5.684712883466433
      },
      "pass": true
    },
    {
      "n": 4,
      "key": "melka-listing",
      "fa": "آگهی ملکا",
      "hue": 110.8,
      "anchor": 161,
      "s50": "#f4f5e2",
      "s100": "#e9ebcd",
      "s300": "#b9bc84",
      "s500": "#747500",
      "s700": "#424200",
      "d50": "#2a2b16",
      "d100": "#373818",
      "d300": "#57591e",
      "d500": "#abae53",
      "d700": "#cbcea1",
      "fg": "#FAFBFC",
      "dfg": "#0F172A",
      "contrast": {
        "fg_on_500": 4.7421107427946785,
        "700_on_50": 9.44840055098795,
        "700_on_100": 8.529839963344193,
        "700_on_300": 5.268733597534063,
        "700_on_card": 10.05379429009046,
        "dark_fg_on_500": 7.597074830475249,
        "dark_700_on_50": 8.91563444822322,
        "dark_700_on_100": 7.442638638629816,
        "dark_700_on_card": 5.757353721238316
      },
      "pass": true
    },
    {
      "n": 5,
      "key": "melka-request",
      "fa": "درخواست ملکا",
      "hue": 27.7,
      "anchor": 21,
      "s50": "#ffeeea",
      "s100": "#ffded9",
      "s300": "#e4a69d",
      "s500": "#bb483f",
      "s700": "#70231e",
      "d50": "#38221f",
      "d100": "#4c2b27",
      "d300": "#7c433c",
      "d500": "#e4877c",
      "d700": "#ecb9b2",
      "fg": "#FAFBFC",
      "dfg": "#0F172A",
      "contrast": {
        "fg_on_500": 4.936386348341939,
        "700_on_50": 9.55464661341793,
        "700_on_100": 8.595358854326882,
        "700_on_300": 5.228495328142264,
        "700_on_card": 10.397467941371161,
        "dark_fg_on_500": 6.860385300964998,
        "dark_700_on_50": 8.562264147640763,
        "dark_700_on_100": 7.230484953423478,
        "dark_700_on_card": 5.431637511732129
      },
      "pass": true
    },
    {
      "n": 6,
      "key": "settings",
      "fa": "تنظیمات عمومی",
      "hue": 249.2,
      "anchor": 215,
      "s50": "#e7f5ff",
      "s100": "#d4ebff",
      "s300": "#92bce6",
      "s500": "#0c76c6",
      "s700": "#004378",
      "d50": "#1b2a3a",
      "d100": "#20374e",
      "d300": "#2f5880",
      "d500": "#69aaea",
      "d700": "#aacbed",
      "fg": "#FAFBFC",
      "dfg": "#0F172A",
      "contrast": {
        "fg_on_500": 4.582004399897949,
        "700_on_50": 9.181981800635537,
        "700_on_100": 8.28876014760136,
        "700_on_300": 5.113964622129632,
        "700_on_card": 9.822329449224052,
        "dark_fg_on_500": 7.2428410606649525,
        "dark_700_on_50": 8.666171445843283,
        "dark_700_on_100": 7.249519679019869,
        "dark_700_on_card": 5.579748649739683
      },
      "pass": true
    },
    {
      "n": 7,
      "key": "mgmt",
      "fa": "داشبورد مدیریتی",
      "hue": 83.1,
      "anchor": 30,
      "s50": "#fcf2e1",
      "s100": "#f5e6ca",
      "s300": "#cfb480",
      "s500": "#9d6700",
      "s700": "#5d3900",
      "d50": "#312714",
      "d100": "#423315",
      "d300": "#6b5118",
      "d500": "#c79e47",
      "d700": "#dac49b",
      "fg": "#FAFBFC",
      "dfg": "#0F172A",
      "contrast": {
        "fg_on_500": 4.624105198702489,
        "700_on_50": 9.278097200248185,
        "700_on_100": 8.35183588459737,
        "700_on_300": 5.114635991412912,
        "700_on_card": 9.916306389477505,
        "dark_fg_on_500": 7.135743221070065,
        "dark_700_on_50": 8.639303619031365,
        "dark_700_on_100": 7.246106580010664,
        "dark_700_on_card": 5.53974390818382
      },
      "pass": true
    },
    {
      "n": 8,
      "key": "m1",
      "fa": "M1 آگهی ملک تبریز",
      "hue": 138.5,
      "anchor": 160,
      "s50": "#ebf8e8",
      "s100": "#dbefd5",
      "s300": "#a0c395",
      "s500": "#3b821e",
      "s700": "#1b4b04",
      "d50": "#202d1c",
      "d100": "#283c22",
      "d300": "#3e6033",
      "d500": "#82b971",
      "d700": "#b7d4ae",
      "fg": "#FAFBFC",
      "dfg": "#0F172A",
      "contrast": {
        "fg_on_500": 4.615515237270208,
        "700_on_50": 9.311444605912188,
        "700_on_100": 8.426166241763427,
        "700_on_300": 5.242984451674018,
        "700_on_card": 9.873298984960062,
        "dark_fg_on_500": 7.767593332506345,
        "dark_700_on_50": 8.949692004156846,
        "dark_700_on_100": 7.440027433877608,
        "dark_700_on_card": 5.814224948272569
      },
      "pass": true
    },
    {
      "n": 9,
      "key": "m2",
      "fa": "M2 درخواست ملک تبریز",
      "hue": 55.4,
      "anchor": 38,
      "s50": "#fff0e4",
      "s100": "#fee2cf",
      "s300": "#deab89",
      "s500": "#b35500",
      "s700": "#6b2c00",
      "d50": "#362418",
      "d100": "#492e1b",
      "d300": "#774826",
      "d500": "#dc905b",
      "d700": "#e7bea3",
      "fg": "#FAFBFC",
      "dfg": "#0F172A",
      "contrast": {
        "fg_on_500": 4.815666408540846,
        "700_on_50": 9.454706785820505,
        "700_on_100": 8.531690780836819,
        "700_on_300": 5.184585429522255,
        "700_on_card": 10.201334010209191,
        "dark_fg_on_500": 6.971422017103256,
        "dark_700_on_50": 8.595682297256028,
        "dark_700_on_100": 7.2389779651812995,
        "dark_700_on_card": 5.476993064720804
      },
      "pass": true
    },
    {
      "n": 10,
      "key": "m3",
      "fa": "M3 معاملات ملک تبریز",
      "hue": 0,
      "anchor": 0,
      "s50": "#ffedf3",
      "s100": "#ffdde7",
      "s300": "#e0a4b5",
      "s500": "#b5466f",
      "s700": "#6d213f",
      "d50": "#372228",
      "d100": "#4a2a34",
      "d300": "#794153",
      "d500": "#df85a2",
      "d700": "#e9b8c6",
      "fg": "#FAFBFC",
      "dfg": "#0F172A",
      "contrast": {
        "fg_on_500": 4.979797434263373,
        "700_on_50": 9.620187152397378,
        "700_on_100": 8.661362366579674,
        "700_on_300": 5.234324770178956,
        "700_on_card": 10.45876280199971,
        "dark_fg_on_500": 6.812038682816872,
        "dark_700_on_50": 8.546893730460484,
        "dark_700_on_100": 7.226022190954694,
        "dark_700_on_card": 5.411288242005511
      },
      "pass": true
    },
    {
      "n": 11,
      "key": "m4",
      "fa": "M4 کارشناسان ملک تبریز",
      "hue": 166.2,
      "anchor": 192,
      "s50": "#e5f9f0",
      "s100": "#d0f1e2",
      "s300": "#88c7ad",
      "s500": "#008d5e",
      "s700": "#005233",
      "d50": "#172e25",
      "d100": "#183e2f",
      "d300": "#1d634b",
      "d500": "#51bb94",
      "d700": "#a3d4bf",
      "fg": "#0A0E1A",
      "dfg": "#0F172A",
      "contrast": {
        "fg_on_500": 4.563040238261817,
        "700_on_50": 8.478291707188555,
        "700_on_100": 7.681544716703811,
        "700_on_300": 4.79829210724303,
        "700_on_card": 8.974124186052144,
        "dark_fg_on_500": 7.58130696434263,
        "dark_700_on_50": 8.73333033080956,
        "dark_700_on_100": 7.243675028762566,
        "dark_700_on_card": 5.691810870360982
      },
      "pass": true
    },
    {
      "n": 12,
      "key": "consultant",
      "fa": "صفحهٔ مشاور (ایجنت)",
      "hue": 332.3,
      "anchor": 333,
      "s50": "#feeefb",
      "s100": "#f9dff4",
      "s300": "#d5a6cd",
      "s500": "#a44c99",
      "s700": "#61265a",
      "d50": "#332230",
      "d100": "#452c41",
      "d300": "#6f4469",
      "d500": "#cf89c4",
      "d700": "#e0bad9",
      "fg": "#FAFBFC",
      "dfg": "#0F172A",
      "contrast": {
        "fg_on_500": 4.972159371594502,
        "700_on_50": 9.69603854148535,
        "700_on_100": 8.681946024292673,
        "700_on_300": 5.239111940567463,
        "700_on_card": 10.450277546109085,
        "dark_fg_on_500": 6.826950744098579,
        "dark_700_on_50": 8.553375584308718,
        "dark_700_on_100": 7.229129307591056,
        "dark_700_on_card": 5.418990328091684
      },
      "pass": true
    },
    {
      "n": 13,
      "key": "ai",
      "fa": "هوش مصنوعی/گزارش‌ها",
      "hue": 276.9,
      "anchor": 243,
      "s50": "#eff2ff",
      "s100": "#e1e6ff",
      "s300": "#abb4e8",
      "s500": "#5f67c9",
      "s700": "#34387a",
      "d50": "#24273a",
      "d100": "#2f334f",
      "d300": "#4a5181",
      "d500": "#929dec",
      "d700": "#bdc5ef",
      "fg": "#FAFBFC",
      "dfg": "#0F172A",
      "contrast": {
        "fg_on_500": 4.773836677331546,
        "700_on_50": 9.456383541107286,
        "700_on_100": 8.508330459270274,
        "700_on_300": 5.207968555265501,
        "700_on_card": 10.166790715352919,
        "dark_fg_on_500": 7.051767892367019,
        "dark_700_on_50": 8.621204555833753,
        "dark_700_on_100": 7.2466467300679716,
        "dark_700_on_card": 5.511222383411819
      },
      "pass": true
    }
  ]
}
```

## ۹٫۸ — Service Worker (استراتژی کش)

- نسخهٔ فعال: **`public/sw-v5.js`** (نسخه‌های قبلی sw.js/sw-v3/sw-v4 برای سازگاری حاضرند).
- استراتژی: **App Shell پیش‌کش** (shell دقیق با نسخه‌بندی) + **Network-first برای API** با fallback به کش آفلاین + **stale-while-revalidate برای asset های ایستا**.
- **بنر آپدیت پیام‌محور:** پیام SW جدید → بنر «نسخهٔ تازه آماده است» با دکمهٔ تازه‌سازی (نه reload ناگهانی) — `SwRegister.tsx`.
- حالت آفلاین: نشانگر `OfflineBadge` + صفحهٔ آفلاین طراحی‌شده در `list-states.tsx`.
- دکمهٔ نصب غیرمزاحم: `InstallButton` فقط وقتی `beforeinstallprompt` واقعی رخ دهد.

## ۹٫۱۰ — سند ریشهٔ سیستم طراحی (DESIGN-SYSTEM.md)

> عین سند ریشهٔ پروژه (که در بستهٔ سورس هم همراه است):

```markdown
# نظام طراحی ملکا — سیستم رنگ ۱۳ بخش

> **اصل حاکم (دستور مالک — گام صفر):** «یک رنگ، یک بخش — نه تکرار، نه تضاد.»
> **شعار:** «رنگ، هویت است. هویت، تشخیص است. تشخیص، سرعت است.»

نسخه: ۲٫۰٫۰ (گام صفر — P6530) · مولد مرجع: `scripts/p6530/gen-palette.py` · سند رنگ: `scripts/p6530/colors.json`

---

## ۱. سیزده رنگ یکتا برای سیزده بخش (قاعده ۱)

| # | بخش | کلید فنی | نام رنگ | ۵۰۰ (اصلی) | کاربرد |
|---|-----|----------|---------|-----------|--------|
| ۱ | صفحهٔ ورود | `login` | بنفش سلطنتی | `#6D28D9` | هویت اکوسیستم |
| ۲ | صفحهٔ هوم | `home` | آبی نفتی | `#0F172A` | جدیت، ساختار |
| ۳ | فایل‌یابی ملکا | `finder` | آبی روشن | `#0284C7` | جستجو، کاوش |
| ۴ | آگهی ملکا | `melka-listing` | سبز زمردی | `#059669` | عرضه، فرصت |
| ۵ | درخواست ملکا | `melka-request` | نارنجی مرجانی | `#EA580C` | تقاضا، حرارت |
| ۶ | تنظیمات عمومی | `settings` | خاکستری فولادی | `#475569` | ابزار، کنترل |
| ۷ | داشبورد مدیریتی | `mgmt` | قهوه‌ای کهربایی | `#92400E` | حاکمیت، اقتدار |
| ۸ | M1 آگهی ملک تبریز | `m1` | سبز یشمی | `#10B981` | مطابق هوم |
| ۹ | M2 درخواست ملک تبریز | `m2` | کهربایی روشن | `#F59E0B` | مطابق هوم |
| ۱۰ | M3 معاملات ملک تبریز | `m3` | قرمز یاقوتی | `#DC2626` | اهمیت، تصمیم |
| ۱۱ | M4 کارشناسان ملک تبریز | `m4` | فیروزه‌ای | `#0891B2` | تخصص، اعتماد |
| ۱۲ | صفحهٔ مشاور (ایجنت) | `consultant` | صورتی ارغوانی | `#DB2777` | همدلی، ارتباط |
| ۱۳ | هوش مصنوعی/گزارش‌ها | `ai` | لاجوردی | `#4F46E5` | تفکر، عمق |

**قید یکتایی:** ۱۳ مقدار ۵۰۰ کاملاً یکتاست (صفر تکرار — شاهد: `colors.json`).
جفت‌های نزدیک در hue (مانند «آگهی ملکا» و «M1» — هر دو سبز) عمداً با **اختلاف روشنایی/اشباع** (۵۰۰ تیره‌تر در برابر یشمی روشن‌تر) و **زمینهٔ مستقل بخش** (هوم در برابر داشبورد مدیریتی) از هم تفکیک می‌شوند؛ جدول رنگ مالک معیار مرجع است.

## ۲. هارمونی داخل هر بخش (قاعده ۲)

هر بخش ۴ سایه + رنگ متن روی ۵۰۰ دارد — همه از مولد `gen-palette.py`:

| سایه | نقش | نمونه (M1 سبز یشمی) |
|------|-----|----------------------|
| `50` | پس‌زمینهٔ بسیار روشن | `#EEFAF6` |
| `200` | حاشیه، جداکننده | `#96E0C8` |
| `500` | رنگ اصلی دکمه/هویت | `#10B981` |
| `700` | متن تیره، تأکید | `#0D644E` |
| `fg` | متن روی دکمهٔ ۵۰۰ (AA) | `#0F172A` |

مصرف در کد: ابزارهای Tailwind مانند `bg-sec-m1-500`، `text-sec-m1-700`، `border-sec-m1-200`، `bg-sec-m1-50` — از نقشهٔ `@theme inline` در `globals.css`.

## ۳. چهار اصل زیبایی (قاعده ۳)

| اصل | قانون | پیاده‌سازی |
|-----|-------|------------|
| **تنفس** | هر کارت ≥ ۱۶px پدینگ؛ صفر تراکم بصری | `.sec-breath` (۱rem → ۱٫۲۵rem در sm+) |
| **عمق** | سایهٔ نرم `0 4px 12px`؛ صفر سایهٔ سخت | `.sec-soft-shadow` / `.sec-soft-shadow-lg` |
| **حرکت** | ترنزیشن ۲۰۰ms؛ صفر پرش ناگهانی | `.sec-motion` + احترام `prefers-reduced-motion` |
| **خوانایی** | کنتراست ≥ ۴٫۵:۱ (WCAG AA) | گزارش کامل: `download/p6530/color-contrast-report.md` — همهٔ ۱۳ بخش PASS در ۵ جفت الزامی |

## ۴. دارک مود (قاعده ۴)

در بلوک `.dark` برای هر ۱۳ بخش:
- `--sec-X-500` → معادل روشن‌تر (۴۰۰) — مثال M1: `#10B981` → `#36C495`
- `--sec-X-50` → سطح تیره با ته‌رنگ هویت (۹۵۰ مانند)
- `--sec-X-200` → حاشیهٔ تیرهٔ hue‌دار
- `--sec-X-700` → متن روشن (≥ ۴٫۵:۱ روی کارت تیره)
- `fg` ثابت می‌ماند چون ۴۰۰ روشن‌تر است و متن تیره همچنان AA است

شاهد زندهٔ دارک: اسکرین‌شات `scripts/p6530/shot-step0-mgmt-dark.png`.

## ۵. فایل‌های اعمال (قاعده ۵)

| فایل | نقش |
|------|-----|
| `src/app/globals.css` | متغیرهای CSS (`:root` + `.dark`) + نقشهٔ `@theme inline` + کلاس‌های اصول زیبایی |
| `tailwind.config.ts` | سند پالت مرکزی ۱۳ بخش (هم‌ارزش مولد) |
| `DESIGN-SYSTEM.md` | همین سند |

**صفر تغییر منطق/داده/API/تست رفتاری** — رنگ‌بندی فقط در لایهٔ ظاهری (accent رجیستری + کلاس‌های هویتی صفحات) اعمال شده و گارد تست `tests/p6530-color-system.test.ts` (۱۲ تست) آن را محافظت می‌کند.

## ۶. تست‌ها (قاعده ۶) — `tests/p6530-color-system.test.ts`

- §۱ یکتایی: ۱۳ مقدار ۵۰۰ بدون تکرار + تفکیک روشنایی جفت‌های هم‌hue
- §۲ چهار سایه + fg برای هر ۱۳ بخش
- §۳ کنتراست WCAG AA — **محاسبهٔ مستقل** در خود تست (fg/۵۰۰ · ۷۰۰/۵۰ · ۷۰۰/۲۰۰ · ۷۰۰/سفید · دارک ۷۰۰/کارت تیره)
- §۴ دارک مود: ۴۰۰ ≠ ۵۰۰ و روشن‌تر + معادل تیرهٔ کامل
- §۵ عینیت مقادیر عین جدول دستور مالک + حضور متغیرها در CSS و tailwind.config
- §۶ اعمال در رجیستری ۹ کاشی فعال + SECTION_ACCENTS + کلاس‌های اصول زیبایی

## ۷. راستی‌آزمایی (قاعده ۷)

| مورد | شاهد |
|------|------|
| ۱۳ رنگ یکتا | `scripts/p6530/colors.json` + `download/p6530/colors.json` |
| WCAG AA | `download/p6530/color-contrast-report.md` (۱۳×۵ جفت PASS) |
| Dark Mode | `scripts/p6530/shot-step0-mgmt-dark.png` + شاهد زندهٔ computed style |
| ۱۳ صفحه | اسکرین‌شات‌های `scripts/p6530/shot-step0-*.png` (ورود/هوم/داشبورد + تک‌تک کاشی‌ها در گام‌های ۱-۴) |
| صفر تغییر منطق | diff محدود به فایل‌های ظاهری + رجیستری accent |
| تست سبز ×۲ | لاگ اجرای دوبارهٔ `bun test` — ۱۲/۱۲ رنگ + کل مجموعه |

## ۸. رشته‌های ایستا برای اسکنر Tailwind

کلاس‌های رنگ بخش در `SECTION_ACCENTS` (TileCard) عمداً به‌صورت **رشتهٔ ایستا** نوشته شده‌اند تا اسکنر استاتیک Tailwind 4 همهٔ ابزارها (`bg-sec-m1-500` و…) را تولید کند. ساخت داینامیک رشته ممنوع است.
```

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
/**
 * دیمن هوشمندی v2 — PHASE 9 / بازسازی فازهای ۷-۸-۹
 * ------------------------------------------------------
 * حلقهٔ پس‌زمینهٔ مغز هوشمند: اجرای دوره‌ای حلقهٔ سرنوشت روی دادهٔ واقعی +
 * تازه‌سازی ارزیابی + نگهداری تک‌نمونه (singleton) برای endpoint وضعیت.
 *
 * طراحی (درس‌گرفته از دیمن p65xx + محدودیت‌های پلتفرم FC):
 *  - درون‌فرایندی: داخل همان پروسهٔ سرور Next (بدون پورت مجزا) — روی هر دو
 *    محیط dev و استقرار عمومی پلتفرم بدون تنظیم اضافه زنده می‌ماند.
 *  - دادهٔ زنده: هر اجرا از پایگاه واقعی محاسبه می‌کند (بازتولیدپذیر و
 *    قطعی) — هیچ وابستگی سخت به فایل شاهد نیست.
 *  - شاهد ماندگار: نخستین اجرای موفق، فایل‌های شاهد را در intelligence-data/
 *    می‌نویسد (قابل کامیت — بقای ریست‌ها طبق AGENTS.md §۷)؛ اجراهای بعدی
 *    فقط خلاصهٔ زنده (loop-latest.json) را بازنویسی می‌کنند.
 *  - خطا: هرگز بوت/درخواست را نمی‌شکند (الگوی بلع ابزار در P4-06).
 *
 * فعال‌سازی: پیش‌فرض روشن (MELK_INTELLIGENCE_DAEMON=disabled برای خاموشی)؛
 * فاصلهٔ تازه‌سازی: MELK_INTELLIGENCE_INTERVAL_MINUTES (پیش‌فرض ۶۰).
 */

import { mkdirSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { runOutcomeLoop, type OutcomeLoopSummary, type OutcomeLoopResult } from "./outcome-loop";

/** دایرکتوری شاهدهای مغز — نسبت به cwd فعلی (تنبل؛ قابل‌ایزوله‌سازی در تست) */
export function intelligenceDataDir(): string {
  return join(process.cwd(), "intelligence-data");
}
function evidencePaths() {
  const dir = intelligenceDataDir();
  return {
    predictions: join(dir, "predictions.jsonl"),
    outcomes: join(dir, "outcomes.jsonl"),
    latest: join(dir, "loop-latest.json"),
  };
}

/** عمر مفید دادهٔ تک‌نمونه پیش از تازه‌سازی (پیش‌فرض ۵۵ دقیقه) */
const MAX_AGE_MS_DEFAULT = 55 * 60 * 1000;

// ===================== تک‌نمونهٔ وضعیت =====================

interface BrainState {
  summary: OutcomeLoopSummary | null;
  lastRunAt: number;
  inFlight: Promise<OutcomeLoopResult> | null;
  lastError: string | null;
  runs: number;
}

const g = globalThis as unknown as { __melkBrainState?: BrainState };

function state(): BrainState {
  if (!g.__melkBrainState) {
    g.__melkBrainState = { summary: null, lastRunAt: 0, inFlight: null, lastError: null, runs: 0 };
  }
  return g.__melkBrainState;
}

/** تازه بودن دادهٔ فعلی */
export function isBrainDataFresh(maxAgeMs: number = MAX_AGE_MS_DEFAULT): boolean {
  const s = state();
  return s.summary !== null && Date.now() - s.lastRunAt < maxAgeMs;
}

/** آخرین وضعیت بدون اجرای دوباره (برای نمایش سریع UI) */
export function peekBrainSummary(): OutcomeLoopSummary | null {
  return state().summary;
}

/**
 * تضمین وجود دادهٔ مغز — اگر تازه نیست، حلقه را یک‌بار اجرا می‌کند
 * (نگه‌دارندهٔ هم‌زمانی: درخواست‌های هم‌زمان همان اجرا را به اشتراک می‌گذارند).
 */
export async function ensureBrainData(
  db: PrismaClient,
  options?: { maxAgeMs?: number; now?: Date },
): Promise<OutcomeLoopSummary> {
  const s = state();
  if (isBrainDataFresh(options?.maxAgeMs) && s.summary) return s.summary;
  if (s.inFlight) return (await s.inFlight).summary;

  const run = (async () => {
    const result = await runOutcomeLoop(db, options?.now ?? new Date());
    s.summary = result.summary;
    s.lastRunAt = Date.now();
    s.runs += 1;
    s.lastError = null;
    try {
      persistEvidence(result);
    } catch {
      // شاهد فایل بهترین-تلاش است — خطای آن دادهٔ زنده را بی‌اعتبار نمی‌کند
    }
    return result;
  })();

  s.inFlight = run;
  try {
    return (await run).summary;
  } catch (err) {
    s.lastError = (err as Error).message;
    // دادهٔ کهنه بهتر از بی‌داده است — اگر قبلاً محاسبه شده بود همان می‌ماند
    if (s.summary) return s.summary;
    throw err;
  } finally {
    s.inFlight = null;
  }
}

// ===================== شاهد ماندگار =====================

/**
 * نوشتن شاهدها:
 *  - predictions.jsonl / outcomes.jsonl: فقط اگر وجود ندارند (شاهد نخستین
 *    اجرای ثبت‌شده — append یک‌باره، رشد نمی‌کند)
 *  - loop-latest.json: همیشه بازنویسی (خلاصهٔ زندهٔ آخرین اجرا)
 */
function persistEvidence(result: OutcomeLoopResult): void {
  const paths = evidencePaths();
  mkdirSync(intelligenceDataDir(), { recursive: true });
  if (!existsSync(paths.predictions)) {
    for (const p of result.predictions) appendFileSync(paths.predictions, `${JSON.stringify(p)}\n`, "utf8");
  }
  if (!existsSync(paths.outcomes)) {
    for (const o of result.outcomes) appendFileSync(paths.outcomes, `${JSON.stringify(o)}\n`, "utf8");
  }
  writeFileSync(paths.latest, `${JSON.stringify(result.summary, null, 2)}\n`, "utf8");
}

// ===================== دیمن v2 =====================

/** اجرای دوره‌ای — از instrumentation.ts فراخوانده می‌شود */
export function startIntelligenceDaemon(db: PrismaClient): void {
  if (process.env.MELK_INTELLIGENCE_DAEMON === "disabled") return;
  const intervalMinutes = Math.max(
    5,
    Number.parseInt(process.env.MELK_INTELLIGENCE_INTERVAL_MINUTES ?? "60", 10) || 60,
  );

  const tick = async () => {
    try {
      await ensureBrainData(db);
    } catch {
      // خطای پس‌زمینه بی‌صدا — تیک بعدی دوباره تلاش می‌کند (الگوی sync daemon)
    }
    // فاز ۸ — یادگیری حلقه‌بسته پس از هر تیک دادهٔ تازه (بهترین-تلاش)
    try {
      await runLearningTick(db);
    } catch {
      // یادگیری هرگز دیمن را نمی‌شکند
    }
  };

  // نخستین اجرا پس از ۴۵ ثانیه (پس از آماده‌شدن کامل سرور)؛ سپس دوره‌ای
  setTimeout(() => void tick(), 45_000);
  setInterval(() => void tick(), intervalMinutes * 60 * 1000);
}

/** یک چرخهٔ یادگیری (فاز ۸) — محرک: دستهٔ پیامد (OUTCOME_BATCH) */
export async function runLearningTick(db: PrismaClient): Promise<{ updated: boolean; newVersion: number | null; rationale: string } | null> {
  const { createLearningEngine } = await import("@/core/intelligence/learning/learning-engine");
  const { policyPortFromDb, feedbackSourceFromDb, outcomeSourceFromSummary, evaluationSummaryFromLoop, LEARNING_DOMAIN } =
    await import("./learning-adapter");
  const engine = createLearningEngine({
    policy: policyPortFromDb(db),
    feedback: feedbackSourceFromDb(db),
    outcomes: outcomeSourceFromSummary(() => state().summary),
    evaluation: evaluationSummaryFromLoop(() => state().summary),
    defaultDomain: LEARNING_DOMAIN,
  });
  return engine.learn({ tileId: "arm-listing", trigger: "OUTCOME_BATCH" });
}

/** گزارش سلامت دیمن برای endpoint وضعیت */
export function daemonHealth(): { alive: boolean; runs: number; lastRunAt: string | null; lastError: string | null; intervalMinutes: number } {
  const s = state();
  return {
    alive: process.env.MELK_INTELLIGENCE_DAEMON !== "disabled",
    runs: s.runs,
    lastRunAt: s.summary ? s.summary.ranAt : null,
    lastError: s.lastError,
    intervalMinutes: Math.max(
      5,
      Number.parseInt(process.env.MELK_INTELLIGENCE_INTERVAL_MINUTES ?? "60", 10) || 60,
    ),
  };
}

// ===================== دروازهٔ امن روت (P2-03 — روت‌ها هرگز مستقیم @/lib/db) =====================

/** تضمین دادهٔ مغز با db خودِ اپ — برای روت /api/intelligence/status */
export async function ensureBrainStatus(): Promise<OutcomeLoopSummary> {
  const { db } = await import("@/lib/db");
  return ensureBrainData(db);
}

/** آخرین نسخهٔ سیاست ایجنت M1 — نمای مطمئن روت (بدون دسترسی مستقیم db در روت) */
export async function getLearningSnapshot(): Promise<{
  latestVersion: number;
  active: boolean;
  rationale: string;
  createdAt: Date;
} | null> {
  const { db } = await import("@/lib/db");
  const row = await db.agentPolicyVersion.findFirst({
    where: { tileId: "arm-listing" },
    orderBy: { version: "desc" },
    select: { version: true, rationale: true, active: true, createdAt: true },
  });
  return row ? { latestVersion: row.version, active: row.active, rationale: row.rationale, createdAt: row.createdAt } : null;
}
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
/**
 * ایجنت یادگیرنده پایه (Base Learning Agent)
 * ------------------------------------------------------
 * سازوکار واقعی یادگیری (نه وعده انتزاعی):
 * 1) حافظه ساخت‌یافته Append-only — تاریخچه تعامل/بازخورد هرگز بازنویسی نمی‌شود.
 * 2) بازیابی (RAG اختصاصی کاشی) — شباهت واژگانی TF بین بینش جدید و
 *    حافظه گذشته؛ بینش‌های مشابه بازخورد مثبت تقویت و منفی تضعیف می‌شوند.
 * 3) سیاست نسخه‌بندی‌شده — پس از انباشت بازخورد، وزن دسته‌ها به‌روزرسانی و
 *    به‌صورت «نسخه جدید» ثبت می‌شود؛ Rollback به هر نسخه ممکن است.
 */

import {
  getAgentMemoryRepository,
  getPolicyRepository,
  type AgentMemoryRepository,
  type PolicyRepository,
} from "@/core/repositories";
import { logAgentCall } from "@/lib/logger";
import type { AgentPolicyContent, AgentPolicyRecord } from "./policy";
import { clampWeight, defaultPolicy } from "./policy";

// ===================== قرارداد بینش =====================

export type InsightSeverity = "info" | "positive" | "warning" | "critical";

export interface InsightCard {
  key: string;
  /** دسته موضوعی — واحد یادگیری در سطح سیاست */
  domain: string;
  title: string;
  body: string;
  severity: InsightSeverity;
  metrics?: InsightMetric[];
}

/** سنجهٔ بینش — P6.5-14: نوار پیشرفت اختیاری برای معیارهای پوشش (A.۴) */
export interface InsightMetric {
  label: string;
  value: string;
  /** درصد ۰-۱۰۰ برای نمایش نوار پیشرفت رنگ‌بندی‌شده (سبز ≥۹۵ / زرد ۷۰-۹۵ / قرمز <۷۰) */
  progress?: number;
}

export interface RenderedInsight extends InsightCard {
  /** وزن نهایی پس از اعمال سیاست و بازیابی حافظه */
  finalWeight: number;
  /** یادگیری مؤثر بوده؟ */
  learned: boolean;
  /** توضیح منبع وزن — برای شفافیت تصمیم ایجنت */
  weightSource: string;
}

// ===================== RAG سبک — شباهت واژگانی =====================

/** بردار فراوانی واژه (Term Frequency) */
export function termVector(text: string): Map<string, number> {
  const vec = new Map<string, number>();
  const tokens = text
    .replace(/[\u200c]/g, " ")
    .split(/[\s،؛.!؟:()\[\]«»"']+/)
    .filter((w) => w.length > 1);
  for (const tok of tokens) vec.set(tok, (vec.get(tok) ?? 0) + 1);
  return vec;
}

/** شباهت کسینوسی دو بردار فراوانی */
export function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const v of a.values()) normA += v * v;
  for (const v of b.values()) normB += v * v;
  if (normA === 0 || normB === 0) return 0;
  for (const [k, v] of a) {
    const w = b.get(k);
    if (w) dot += v * w;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface MemorySnippet {
  id: string;
  text: string;
  sentiment: number; // +1 مثبت | -1 منفی | 0 خنثی
  createdAt: string;
}

// ===================== ایجنت پایه =====================

export abstract class BaseLearningAgent {
  abstract readonly tileId: string;
  abstract readonly name: string;
  abstract readonly insightDomains: readonly string[];

  /** محاسبه بینش‌های خام از داده — هر ایجنت تخصصی پیاده می‌کند */
  protected abstract computeRawInsights(): Promise<InsightCard[]>;

  // ---------- انبار داده (P2-02-D — تزریق‌پذیر برای تست، صفر DB مستقیم) ----------

  /** وابستگی‌های تزریق‌پذیر BaseLearningAgent — قرارداد سازنده تغییر نکرده است */
  private readonly memory: AgentMemoryRepository;
  private readonly policy: PolicyRepository;

  constructor(deps?: { memory?: AgentMemoryRepository; policy?: PolicyRepository }) {
    this.memory = deps?.memory ?? getAgentMemoryRepository();
    this.policy = deps?.policy ?? getPolicyRepository();
  }

  // ---------- سیاست ----------

  private async ensurePolicy(): Promise<AgentPolicyRecord> {
    const active = await this.policy.findActive(this.tileId);
    if (active) return this.toRecord(active);

    // نسخه ۱ — سیاست اولیه
    const created = await this.policy.createVersion({
      tileId: this.tileId,
      version: 1,
      content: JSON.stringify(defaultPolicy(this.insightDomains)),
      rationale: "سیاست اولیه — بدون بازخورد کاربر؛ وزن برابر برای همه دسته‌ها.",
      active: true,
      activatedAt: new Date(),
    });
    await this.appendMemory("POLICY_CHANGE", {
      event: "policy-created",
      version: 1,
      note: "سیاست اولیه ایجاد شد.",
    });
    return this.toRecord(created);
  }

  private toRecord(row: { id: string; tileId: string; version: number; content: string; rationale: string; active: boolean; createdAt: Date; activatedAt: Date | null }): AgentPolicyRecord {
    return {
      id: row.id,
      tileId: row.tileId,
      version: row.version,
      content: JSON.parse(row.content) as AgentPolicyContent,
      rationale: row.rationale,
      active: row.active,
      createdAt: row.createdAt.toISOString(),
      activatedAt: row.activatedAt?.toISOString() ?? null,
    };
  }

  async getActivePolicy(): Promise<AgentPolicyRecord> {
    return this.ensurePolicy();
  }

  async listPolicyVersions(): Promise<AgentPolicyRecord[]> {
    await this.ensurePolicy();
    const rows = await this.policy.listVersions(this.tileId);
    return rows.map((r) => this.toRecord(r));
  }

  /** بازگشت به نسخه قبلی سیاست — نسخه فعلی حذف نمی‌شود، فقط غیرفعال */
  async rollbackPolicy(targetVersion: number): Promise<AgentPolicyRecord> {
    const target = await this.policy.findByTileAndVersion(this.tileId, targetVersion);
    if (!target) throw new Error(`نسخه ${targetVersion} برای این ایجنت وجود ندارد.`);
    await this.policy.activateVersion(this.tileId, target.id, new Date());
    await this.appendMemory("POLICY_CHANGE", {
      event: "policy-rollback",
      fromVersion: "active",
      toVersion: targetVersion,
      note: `بازگشت سیاست به نسخه ${targetVersion}.`,
    });
    return this.toRecord(target);
  }

  // ---------- حافظه (Append-only) ----------

  protected async appendMemory(kind: string, payload: Record<string, unknown>): Promise<void> {
    await this.memory.append(this.tileId, kind, JSON.stringify({ ...payload, at: new Date().toISOString() }));
  }

  /** بازیابی قطعات حافظه مرتبط با یک پرسش (RAG اختصاصی کاشی) */
  async retrieveRelevant(query: string, k = 5): Promise<MemorySnippet[]> {
    const feedbacks = await this.memory.listFeedbacks(this.tileId, 200);
    const memories = await this.memory.listRecent(this.tileId, 200);

    const qVec = termVector(query);
    const pool: MemorySnippet[] = [
      ...feedbacks.map((f) => ({
        id: f.id,
        text: `${f.insightTitle} ${f.comment ?? ""}`,
        sentiment: f.rating,
        createdAt: f.createdAt.toISOString(),
      })),
      ...memories.map((m) => ({
        id: m.id,
        text: m.payload.slice(0, 400),
        sentiment: 0,
        createdAt: m.createdAt.toISOString(),
      })),
    ];

    return pool
      .map((s) => ({ s, sim: cosineSimilarity(qVec, termVector(s.text)) }))
      .filter((x) => x.sim > 0.05)
      .sort((a, b) => b.sim - a.sim)
      .slice(0, k)
      .map((x) => x.s);
  }

  // ---------- بازخورد ----------

  async submitFeedback(input: {
    insightKey: string;
    insightTitle: string;
    domain: string;
    rating: 1 | -1;
    comment?: string;
    contextSnapshot?: Record<string, unknown>;
  }): Promise<{ totalFeedback: number }> {
    // P2-05 — رویداد الزامی فراخوانی ایجنت
    const __startedAt = Date.now();
    logAgentCall({ tileId: this.tileId, agentName: this.name, operation: "submit-feedback", status: "start" });
    try {
      const result = await this.submitFeedbackInner(input);
      logAgentCall({ tileId: this.tileId, agentName: this.name, operation: "submit-feedback", status: "ok", duration: Date.now() - __startedAt });
      return result;
    } catch (err) {
      logAgentCall({ tileId: this.tileId, agentName: this.name, operation: "submit-feedback", status: "fail", duration: Date.now() - __startedAt, errorCode: "AGENT_ERROR" });
      throw err;
    }
  }

  /** بدنه اصلی بازخورد (P2-05: از پوشش لاگ جدا شد — منطق عین قبل) */
  private async submitFeedbackInner(input: {
    insightKey: string;
    insightTitle: string;
    domain: string;
    rating: 1 | -1;
    comment?: string;
    contextSnapshot?: Record<string, unknown>;
  }): Promise<{ totalFeedback: number }> {
    // ثبت بازخورد — فقط افزودنی
    await this.memory.createFeedback({
      tileId: this.tileId,
      insightKey: input.insightKey,
      insightTitle: input.insightTitle,
      rating: input.rating,
      comment: input.comment ?? null,
      context: JSON.stringify({ domain: input.domain, ...(input.contextSnapshot ?? {}) }),
    });
    await this.appendMemory("FEEDBACK", {
      event: "feedback",
      insightKey: input.insightKey,
      domain: input.domain,
      rating: input.rating,
      comment: input.comment ?? null,
    });

    const totalFeedback = await this.memory.countFeedback(this.tileId);
    // بازبینی دوره‌ای سیاست
    await this.reviewPolicyIfNeeded();
    return { totalFeedback };
  }

  /**
   * بازبینی سیاست بر اساس تحلیل تجمیعی بازخوردها.
   * قاعده واقعی و نسخه‌بندی‌شده:
   *  - حداقل ۵ بازخورد ثبت شده باشد؛
   *  - برای هر دسته، امتیاز = مجموع (+1/-1)؛
   *  - وزن جدید = وزن فعلی + ۰٫۱۵ × امتیاز دسته (محدود به بازه ۰٫۳ تا ۱٫۸)؛
   *  - اگر مجموع تغییرات وزن معنادار نباشد، نسخه جدید ساخته نمی‌شود.
   */
  async reviewPolicyIfNeeded(): Promise<{ updated: boolean; version: number | null }> {
    const feedbacks = await this.memory.listAllFeedbacks(this.tileId);
    if (feedbacks.length < 5) return { updated: false, version: null };

    const domainScores = new Map<string, number>();
    for (const f of feedbacks) {
      try {
        const ctx = JSON.parse(f.context) as { domain?: string };
        if (ctx.domain) domainScores.set(ctx.domain, (domainScores.get(ctx.domain) ?? 0) + f.rating);
      } catch {
        // ساختار قدیمی — نادیده
      }
    }

    const policy = await this.getActivePolicy();
    const weights: Record<string, number> = { ...policy.content.weights };
    let meaningful = false;
    const changes: string[] = [];

    for (const [domain, score] of domainScores) {
      if (Math.abs(score) < 2) continue; // آستانه معناداری
      const current = weights[domain] ?? 1;
      const next = clampWeight(current + 0.15 * score);
      if (next !== current) {
        weights[domain] = next;
        meaningful = true;
        changes.push(`${domain}: ${current} → ${next} (${score > 0 ? "تقویت" : "تضعیف"} بر اساس ${Math.abs(score)} بازخورد)`);
      }
    }

    if (!meaningful) return { updated: false, version: null };

    const latest = await this.policy.findLatest(this.tileId);
    const nextVersion = (latest?.version ?? 1) + 1;

    const created = await this.policy.createVersion({
      tileId: this.tileId,
      version: nextVersion,
      content: JSON.stringify({ ...policy.content, weights } as AgentPolicyContent),
      rationale: `به‌روزرسانی از ${feedbacks.length} بازخورد: ${changes.join("؛ ")}`,
      active: false,
      activatedAt: null,
    });
    await this.policy.activateVersion(this.tileId, created.id, new Date());
    await this.appendMemory("POLICY_CHANGE", {
      event: "policy-updated",
      version: nextVersion,
      rationale: `به‌روزرسانی از ${feedbacks.length} بازخورد`,
      changes,
    });
    return { updated: true, version: nextVersion };
  }

  // ---------- رندر بینش (قلب ایجنت) ----------

  /**
   * چرخه کامل: محاسبه → اعمال سیاست فعال → تقویت/تضعیف با بازیابی حافظه →
   * مرتب‌سازی → ثبت تعامل در حافظه (Append-only).
   */
  async renderInsights(): Promise<{ insights: RenderedInsight[]; policyVersion: number; memoryHits: number }> {
    // P2-05 — رویداد الزامی فراخوانی ایجنت (مرکزی: همه ایجنت‌ها)
    const __startedAt = Date.now();
    logAgentCall({ tileId: this.tileId, agentName: this.name, operation: "render-insights", status: "start" });
    try {
      const result = await this.renderInsightsInner();
      logAgentCall({
        tileId: this.tileId,
        agentName: this.name,
        operation: "render-insights",
        status: "ok",
        duration: Date.now() - __startedAt,
        detail: { insightCount: result.insights.length, policyVersion: result.policyVersion },
      });
      return result;
    } catch (err) {
      logAgentCall({
        tileId: this.tileId,
        agentName: this.name,
        operation: "render-insights",
        status: "fail",
        duration: Date.now() - __startedAt,
        errorCode: (err as { code?: string })?.code ?? "AGENT_ERROR",
      });
      throw err;
    }
  }

  /** بدنه اصلی رندر (P2-05: از پوشش لاگ جدا شد — منطق عین قبل) */
  private async renderInsightsInner(): Promise<{ insights: RenderedInsight[]; policyVersion: number; memoryHits: number }> {
    const policy = await this.getActivePolicy();
    const raw = await this.computeRawInsights();

    const rendered: RenderedInsight[] = [];
    let memoryHits = 0;

    for (const card of raw) {
      const policyWeight = policy.content.weights[card.domain] ?? 1;
      // بازیابی حافظه مرتبط با عنوان بینش
      const related = await this.retrieveRelevant(`${card.title} ${card.domain}`, 3);
      let learningDelta = 0;
      for (const r of related) {
        const sim = cosineSimilarity(termVector(card.title), termVector(r.text));
        learningDelta += sim * r.sentiment * 0.4;
      }
      if (learningDelta !== 0) memoryHits += 1;

      const finalWeight = Math.round((policyWeight + learningDelta) * 100) / 100;
      rendered.push({
        ...card,
        finalWeight,
        learned: Math.abs(learningDelta) > 0.01,
        weightSource:
          Math.abs(learningDelta) > 0.01
            ? `سیاست نسخه ${policy.version} (وزن ${policyWeight}) + یادگیری از ${related.length} خاطره مرتبط (${learningDelta > 0 ? "تقویت" : "تضعیف"})`
            : `سیاست نسخه ${policy.version} (وزن ${policyWeight}) — بدون خاطره مرتبط`,
      });
    }

    rendered.sort((a, b) => b.finalWeight - a.finalWeight);
    const limited = rendered.slice(0, policy.content.maxInsights);

    // ثبت تعامل — Append-only
    await this.appendMemory("INTERACTION", {
      event: "insight-render",
      insightCount: limited.length,
      domains: limited.map((i) => i.domain),
      policyVersion: policy.version,
    });

    return { insights: limited, policyVersion: policy.version, memoryHits };
  }

  /** آمار یادگیری برای نمایش در UI کاشی */
  async learningStats(): Promise<{
    feedbackCount: number;
    memoryCount: number;
    policyVersions: number;
    activePolicyVersion: number;
    positiveRate: number;
  }> {
    const [feedbackCount, memoryCount, policyVersions, activePolicy, positives] = await Promise.all([
      this.memory.countFeedback(this.tileId),
      this.memory.countMemory(this.tileId),
      this.policy.countVersions(this.tileId),
      this.policy.findActive(this.tileId),
      this.memory.countFeedback(this.tileId, true),
    ]);
    return {
      feedbackCount,
      memoryCount,
      policyVersions,
      activePolicyVersion: activePolicy?.version ?? 1,
      positiveRate: feedbackCount > 0 ? Math.round((positives / feedbackCount) * 100) : 0,
    };
  }
}
```

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
/**
 * PHASE 10 (سند ۰۲۷) — خودتشخیصی سیستم
 * ---------------------------------------------------------------------------
 * فلسفه: «سیستمی که خودش را نمی‌شناسد، نمی‌تواند خودش را بهبود دهد.»
 * ۲۵ بررسی اجباری در ۵ دسته: داده(۷) مدل(۶) موتور(۵) امنیت(۴) حاکمیت(۳)
 * سیستم قبل از شورا مشکل را پیدا می‌کند و صادقانه گزارش می‌دهد.
 */

import {
  type CriticalAlert,
  type DiagnosticCheck,
  type DiagnosticReport,
  type LearningTier,
  type RecommendedAction,
  type Warning,
  evidenceLink,
} from "./contracts-p7-p11";

/** نمای واقعی سیستم — از وضعیت زنده (DB + حلقه + حسابرسی) پر می‌شود */
export interface SystemSnapshot {
  /** داده */
  orphanOutcomeRecords: number;
  columnCoveragePercent: number;
  dataAgeHours: number;
  illegalDeletions: number;
  backupFilesPresent: number;
  crossTableConflicts: number;
  weeklyGrowthPercent: number;
  /** مدل */
  brierScore: number;
  brierTarget: number;
  worstCalibrationGap: number;
  driftMagnitude: number;
  overfitGap: number;
  activeModelVersionMatchesExpected: boolean;
  shadowEvaluationActive: boolean;
  /** موتور */
  enginesAlive: number;
  enginesTotal: number;
  maxEngineLatencyMs: number;
  consecutiveEngineErrors: number;
  tierValid: boolean;
  learningLoopActive: boolean;
  /** امنیت */
  auditLogActive: boolean;
  unauthorizedAccess24h: number;
  llmCallsInProduction: number;
  postsToOriginSystem: number;
  /** حاکمیت */
  governanceRulesEnforced: number;
  governanceRulesTotal: number;
  criticalViolations: number;
  lastPolicyEvaluationDaysAgo: number;
  /** Tier فعلی برای گزارش */
  tier: LearningTier;
}

export const healthySnapshot = (tier: LearningTier = 4): SystemSnapshot => ({
  orphanOutcomeRecords: 0,
  columnCoveragePercent: 95,
  dataAgeHours: 6,
  illegalDeletions: 0,
  backupFilesPresent: 3,
  crossTableConflicts: 0,
  weeklyGrowthPercent: 2,
  brierScore: 0.19,
  brierTarget: 0.2,
  worstCalibrationGap: 0.1,
  driftMagnitude: 0.01,
  overfitGap: 0.05,
  activeModelVersionMatchesExpected: true,
  shadowEvaluationActive: true,
  enginesAlive: 11,
  enginesTotal: 11,
  maxEngineLatencyMs: 120,
  consecutiveEngineErrors: 0,
  tierValid: true,
  learningLoopActive: true,
  auditLogActive: true,
  unauthorizedAccess24h: 0,
  llmCallsInProduction: 0,
  postsToOriginSystem: 0,
  governanceRulesEnforced: 15,
  governanceRulesTotal: 15,
  criticalViolations: 0,
  lastPolicyEvaluationDaysAgo: 5,
  tier,
});

/** نتیجهٔ یک بررسی از روی مقدار و آستانه */
function check(
  id: string,
  name: string,
  category: DiagnosticCheck["category"],
  status: DiagnosticCheck["status"],
  details: string,
  extra: { metric?: number; threshold?: number; suggestion?: string } = {},
): DiagnosticCheck {
  return { id, name, category, status, details, ...extra };
}

/** وضعیت از مقایسهٔ مقدار با آستانه (خطرناک‌تر از آستانه → fail/warn) */
function grade(value: number, warnAt: number, failAt: number): "pass" | "warn" | "fail" {
  if (value >= failAt) return "fail";
  if (value >= warnAt) return "warn";
  return "pass";
}

export class SelfDiagnosisEngineImpl {
  /** هر ۲۵ بررسی — خالص و قابل تست با دادهٔ معلوم */
  runAllChecks(s: SystemSnapshot): DiagnosticCheck[] {
    return [
      /* ── داده (۷) ── */
      check("DIAG-DATA-001", "انسجام داده (رکوردهای یتیم)", "data", grade(s.orphanOutcomeRecords, 1, 5), `${s.orphanOutcomeRecords} رکورد پیامد بدون پیش‌بینی مرجع`, { metric: s.orphanOutcomeRecords, threshold: 0, suggestion: s.orphanOutcomeRecords > 0 ? "پاکسازی/اتصال رکوردهای یتیم با تأیید شورا" : undefined }),
      check("DIAG-DATA-002", "پوشش ستون‌های کلیدی", "data", 100 - s.columnCoveragePercent >= 20 ? "fail" : 100 - s.columnCoveragePercent >= 10 ? "warn" : "pass", `پوشش ستون‌ها ${s.columnCoveragePercent}٪`, { metric: s.columnCoveragePercent, threshold: 90 }),
      check("DIAG-DATA-003", "تازگی داده", "data", s.dataAgeHours >= 48 ? "fail" : s.dataAgeHours >= 24 ? "warn" : "pass", `آخرین داده ${s.dataAgeHours} ساعت پیش`, { metric: s.dataAgeHours, threshold: 24 }),
      check("DIAG-DATA-004", "صفر حذف غیرمجاز", "data", s.illegalDeletions > 0 ? "fail" : "pass", `${s.illegalDeletions} حذف غیرمجاز`, { metric: s.illegalDeletions, threshold: 0 }),
      check("DIAG-DATA-005", "بکاپ‌های موجود", "data", s.backupFilesPresent === 0 ? "fail" : s.backupFilesPresent < 2 ? "warn" : "pass", `${s.backupFilesPresent} فایل بکاپ موجود`, { metric: s.backupFilesPresent, threshold: 2 }),
      check("DIAG-DATA-006", "تناقض بین جداول", "data", grade(s.crossTableConflicts, 1, 10), `${s.crossTableConflicts} تناقض شمارشی بین جداول`, { metric: s.crossTableConflicts, threshold: 0 }),
      check("DIAG-DATA-007", "حجم رشد هفتگی", "data", s.weeklyGrowthPercent >= 50 ? "warn" : "pass", `رشد ${s.weeklyGrowthPercent}٪ در هفته`, { metric: s.weeklyGrowthPercent, threshold: 50 }),
      /* ── مدل (۶) ── */
      check("DIAG-MODEL-001", "Brier Score", "model", s.brierScore > s.brierTarget + 0.05 ? "fail" : s.brierScore > s.brierTarget ? "warn" : "pass", `Brier = ${s.brierScore} (هدف ≤ ${s.brierTarget})`, { metric: s.brierScore, threshold: s.brierTarget, suggestion: s.brierScore > s.brierTarget ? "آموزش مجدد/تعدیل وزن‌ها پس از تأیید شورا" : undefined }),
      check("DIAG-MODEL-002", "کالیبراسیون", "model", s.worstCalibrationGap >= 0.3 ? "fail" : s.worstCalibrationGap >= 0.15 ? "warn" : "pass", `بدترین شکاف کالیبراسیون ${s.worstCalibrationGap}`, { metric: s.worstCalibrationGap, threshold: 0.15, suggestion: s.worstCalibrationGap >= 0.15 ? "بازکالیبراسیون احتمال‌ها (recalibrate)" : undefined }),
      check("DIAG-MODEL-003", "رانش (Drift)", "model", s.driftMagnitude >= 0.1 ? "fail" : s.driftMagnitude >= 0.05 ? "warn" : "pass", `مقدار رانش ${s.driftMagnitude}`, { metric: s.driftMagnitude, threshold: 0.05 }),
      check("DIAG-MODEL-004", "Overfitting", "model", s.overfitGap >= 0.15 ? "fail" : s.overfitGap >= 0.08 ? "warn" : "pass", `شکاف آموزش/آزمون ${s.overfitGap}`, { metric: s.overfitGap, threshold: 0.08 }),
      check("DIAG-MODEL-005", "نسخهٔ فعال مدل مطابق انتظار", "model", s.activeModelVersionMatchesExpected ? "pass" : "fail", s.activeModelVersionMatchesExpected ? "نسخهٔ فعال مطابق انتظار" : "نسخهٔ فعال با انتظار نمی‌خواند"),
      check("DIAG-MODEL-006", "Shadow Evaluation فعال", "model", s.shadowEvaluationActive ? "pass" : "warn", s.shadowEvaluationActive ? "ارزیابی سایه فعال" : "ارزیابی سایه غیرفعال", { suggestion: s.shadowEvaluationActive ? undefined : "فعال‌سازی ارزیابی سایه برای مدل کاندید" }),
      /* ── موتور (۵) ── */
      check("DIAG-ENGINE-001", "موتورهای زنده", "engine", s.enginesAlive < s.enginesTotal - 2 ? "fail" : s.enginesAlive < s.enginesTotal ? "warn" : "pass", `${s.enginesAlive}/${s.enginesTotal} موتور زنده`, { metric: s.enginesAlive, threshold: s.enginesTotal }),
      check("DIAG-ENGINE-002", "زمان پاسخ موتورها", "engine", s.maxEngineLatencyMs >= 2000 ? "fail" : s.maxEngineLatencyMs >= 1000 ? "warn" : "pass", `بدترین تأخیر ${s.maxEngineLatencyMs}ms`, { metric: s.maxEngineLatencyMs, threshold: 1000 }),
      check("DIAG-ENGINE-003", "صفر خطای متوالی", "engine", s.consecutiveEngineErrors >= 3 ? "fail" : s.consecutiveEngineErrors >= 1 ? "warn" : "pass", `${s.consecutiveEngineErrors} خطای متوالی`, { metric: s.consecutiveEngineErrors, threshold: 0 }),
      check("DIAG-ENGINE-004", "اعتبار Tier فعلی", "engine", s.tierValid ? "pass" : "fail", s.tierValid ? `Tier ${s.tier} معتبر` : "Tier نامعتبر — بازمحاسبه لازم"),
      check("DIAG-ENGINE-005", "چرخهٔ یادگیری فعال", "engine", s.learningLoopActive ? "pass" : "fail", s.learningLoopActive ? "چرخهٔ یادگیری فعال" : "چرخهٔ یادگیری متوقف"),
      /* ── امنیت (۴) ── */
      check("DIAG-SEC-001", "AuditLog فعال", "security", s.auditLogActive ? "pass" : "fail", s.auditLogActive ? "حسابرسی فعال" : "حسابرسی غیرفعال"),
      check("DIAG-SEC-002", "صفر دسترسی غیرمجاز ۲۴ ساعت گذشته", "security", s.unauthorizedAccess24h > 0 ? "fail" : "pass", `${s.unauthorizedAccess24h} دسترسی غیرمجاز`, { metric: s.unauthorizedAccess24h, threshold: 0 }),
      check("DIAG-SEC-003", "صفر LLM call در production", "security", s.llmCallsInProduction > 0 ? "fail" : "pass", `${s.llmCallsInProduction} فراخوانی LLM`, { metric: s.llmCallsInProduction, threshold: 0 }),
      check("DIAG-SEC-004", "صفر POST در سامانهٔ مبدأ", "security", s.postsToOriginSystem > 0 ? "fail" : "pass", `${s.postsToOriginSystem} درخواست POST به مبدأ`, { metric: s.postsToOriginSystem, threshold: 0 }),
      /* ── حاکمیت (۳) ── */
      check("DIAG-GOV-001", "۱۵ قاعدهٔ حاکمیت enforce", "governance", s.governanceRulesEnforced < s.governanceRulesTotal - 3 ? "fail" : s.governanceRulesEnforced < s.governanceRulesTotal ? "warn" : "pass", `${s.governanceRulesEnforced}/${s.governanceRulesTotal} قاعده برقرار`, { metric: s.governanceRulesEnforced, threshold: s.governanceRulesTotal }),
      check("DIAG-GOV-002", "صفر نقض critical", "governance", s.criticalViolations > 0 ? "fail" : "pass", `${s.criticalViolations} نقض بحرانی`, { metric: s.criticalViolations, threshold: 0 }),
      check("DIAG-GOV-003", "ارزیابی ۹۰ روزهٔ سیاست‌ها به‌روز", "governance", s.lastPolicyEvaluationDaysAgo > 90 ? "fail" : s.lastPolicyEvaluationDaysAgo > 60 ? "warn" : "pass", `آخرین ارزیابی ${s.lastPolicyEvaluationDaysAgo} روز پیش`, { metric: s.lastPolicyEvaluationDaysAgo, threshold: 90 }),
    ];
  }

  /** اجرای یک بررسی تکی */
  runCheck(checkId: string, s: SystemSnapshot): DiagnosticCheck | undefined {
    return this.runAllChecks(s).find((c) => c.id === checkId);
  }

  /** امتیاز سلامت ۰-۱۰۰: fail=۰، warn=۵۰، pass=۱۰۰ */
  getHealthScore(checks: DiagnosticCheck[]): number {
    if (checks.length === 0) return 0;
    const score = checks.reduce((a, c) => a + (c.status === "pass" ? 100 : c.status === "warn" ? 50 : 0), 0) / checks.length;
    return Math.round(score);
  }

  /** §۵.۳ — گزارش critical بلافاصله */
  reportCritical(alert: { checkId: string; message: string }): CriticalAlert {
    return { id: `alert-${Date.now().toString(36)}`, ...alert, reportedAt: new Date().toISOString() };
  }

  /** تشخیص کامل: گزارش + هشدار + توصیه (runFullDiagnosis §۵.۳) */
  runFullDiagnosis(s: SystemSnapshot): DiagnosticReport {
    const checks = this.runAllChecks(s);
    const overallScore = this.getHealthScore(checks);
    const systemHealth: DiagnosticReport["systemHealth"] = checks.some((c) => c.status === "fail" && (c.category === "security" || c.category === "governance")) || overallScore < 50 ? "critical" : checks.some((c) => c.status !== "pass") ? "degraded" : "healthy";
    const warnings: Warning[] = checks.filter((c) => c.status === "warn").map((c) => ({ id: `warn-${c.id}`, checkId: c.id, message: c.details }));
    const criticalAlerts: CriticalAlert[] = checks.filter((c) => c.status === "fail").map((c) => this.reportCritical({ checkId: c.id, message: c.details }));
    const recommendations: RecommendedAction[] = checks
      .filter((c) => c.status !== "pass")
      .map((c) => ({
        id: `rec-${c.id}`,
        checkId: c.id,
        action: c.suggestion ?? `بررسی و ترمیم «${c.name}» با پیشنهاد P11 و تأیید شورا`,
        rationale: c.details,
      }));
    return {
      id: `diag-${Date.now().toString(36)}`,
      reportedAt: new Date().toISOString(),
      systemHealth,
      checks,
      overallScore,
      warnings,
      criticalAlerts,
      recommendations,
      tier: s.tier,
      evidenceChain: [
        evidenceLink("query", "self-diagnosis:25-checks", `${checks.length} بررسی — امتیاز ${overallScore}/100`),
        evidenceLink("test", "tests/p6537-p10-core.test.ts", "تست ۲۵ بررسی با دادهٔ معلوم"),
      ],
    };
  }
}
```

> عین `src/core/intelligence/p11-core.ts` (۲۷۲ خط):

```ts
/**
 * PHASE 11 (سند ۰۲۷) — خودترمیمی کنترل‌شده
 * ---------------------------------------------------------------------------
 * فلسفه: «خودترمیمی بدون نظارت، خودویرانگری است.»
 * سیستم پیشنهاد می‌دهد → شورا تأیید می‌کند → ترمیم ایمن اجرا → نتیجه بازبینی.
 * قفل نوعی: requiresCouncilApproval: true — هیچ ترمیمی خودکار اجرا نمی‌شود.
 */

import {
  type ApprovalResult,
  type DiagnosticReport,
  type LearningTier,
  type RepairAction,
  type RepairActionType,
  type RepairAuditLog,
  type RepairProposal,
  type RiskAssessment,
  evidenceLink,
} from "./contracts-p7-p11";

/* ═══════════════════ ۶.۳.۱ — Self-Repair Engine (پیشنهاد) ═══════════════════ */

/** نگاشت بررسی P10 → نوع کنش ترمیم (§۶.۳.۱) */
export function repairActionFor(checkId: string): { type: RepairActionType; parameters: Record<string, unknown> } {
  if (checkId === "DIAG-MODEL-002") return { type: "recalibrate", parameters: { target: "probability-calibration", method: "isotonic-style-bucket-adjust" } };
  if (checkId === "DIAG-MODEL-001" || checkId === "DIAG-MODEL-003" || checkId === "DIAG-MODEL-004") return { type: "retrain", parameters: { reason: checkId } };
  if (checkId === "DIAG-DATA-001" || checkId === "DIAG-DATA-006") return { type: "reindex", parameters: { tables: ["outcome", "prediction"] } };
  if (checkId === "DIAG-ACCESS-001" || checkId === "DIAG-GOV-001") return { type: "prune_sessions", parameters: { olderThanDays: 30 } };
  if (checkId === "DIAG-DATA-005" || checkId === "DIAG-DATA-004") return { type: "restore_backup", parameters: { verifyMd5: true } };
  if (checkId === "DIAG-MODEL-005") return { type: "update_threshold", parameters: { expectedVersion: "active" } };
  return { type: "custom", parameters: { checkId } };
}

export class SelfRepairEngineImpl {
  private readonly proposals: RepairProposal[] = [];

  /** §۶.۳.۱ قواعد پیشنهاد: هر fail → پیشنهاد؛ هر warn سه‌بار متوالی → پیشنهاد */
  proposeRepairs(diagnosis: DiagnosticReport, consecutiveWarns: Record<string, number> = {}, tier: LearningTier = 4): RepairProposal[] {
    const out: RepairProposal[] = [];
    for (const c of diagnosis.checks) {
      const isFail = c.status === "fail";
      const isRepeatingWarn = c.status === "warn" && (consecutiveWarns[c.id] ?? 0) >= 3;
      if (!isFail && !isRepeatingWarn) continue;
      const action = repairActionFor(c.id);
      const risk = this.assessRisk(action.type);
      const proposal: RepairProposal = {
        id: `rep-${c.id}-${Date.now().toString(36)}`,
        detectedIssue: c.details,
        sourceCheckId: c.id,
        severity: isFail ? (c.category === "security" || c.category === "governance" ? "critical" : "high") : "medium",
        proposedAction: { type: action.type, parameters: action.parameters, estimatedDurationMinutes: action.type === "retrain" ? 60 : action.type === "restore_backup" ? 45 : 15 },
        rationale: `بررسی ${c.id} (${c.name}) وضعیت ${c.status === "fail" ? "بحرانی" : "هشدار مکرر"} دارد؛ ${c.suggestion ?? "ترمیم کنترل‌شده پیشنهاد می‌شود"}.`,
        expectedImpact: `رفع «${c.name}» و بازگشت بررسی به وضعیت pass در چرخهٔ بعدی خودتشخیصی`,
        riskAssessment: risk,
        rollbackPlan: this.rollbackPlanFor(action.type),
        requiredTier: action.type === "retrain" || action.type === "recalibrate" ? 3 : 2,
        requiresCouncilApproval: true,
        proposedAt: new Date().toISOString(),
        status: "pending",
        evidenceChain: [
          evidenceLink("query", `diagnosis:${diagnosis.id}`, `شاهد مشکل از P10 — بررسی ${c.id}`),
          evidenceLink("audit", `critical-alerts:${diagnosis.criticalAlerts.length}`, `${diagnosis.criticalAlerts.length} هشدار بحرانی در همین گزارش`),
        ],
      };
      out.push(proposal);
    }
    // اولویت: critical > high > medium > low (§۶.۳.۱)
    const order = { critical: 0, high: 1, medium: 2, low: 3 } as const;
    out.sort((a, b) => order[a.severity] - order[b.severity]);
    this.proposals.push(...out);
    return out;
  }

  /** §۶.۳.۱ — ارزیابی ریسک هر نوع کنش */
  assessRisk(actionType: RepairActionType): RiskAssessment {
    const table: Record<RepairActionType, RiskAssessment> = {
      reindex: { level: "low", probability: 0.1, impact: 0.2, mitigation: "بازسازی ایندکس از دادهٔ موجود — بدون تغییر داده" },
      recalibrate: { level: "medium", probability: 0.2, impact: 0.4, mitigation: "اعمال تدریجی + مقایسهٔ Brier پیش/پس + بازگشت خودکار در افت" },
      retrain: { level: "medium", probability: 0.3, impact: 0.5, mitigation: "نگهداری نسخهٔ قبل + ارزیابی سایه پیش از فعال‌سازی" },
      prune_sessions: { level: "low", probability: 0.05, impact: 0.1, mitigation: "فقط نشست‌های منقضی ۳۰+ روزه؛ دادهٔ کاربر دست نمی‌خورد" },
      restore_backup: { level: "high", probability: 0.3, impact: 0.9, mitigation: "بکاپ نقطه‌ای تازه پیش از بازیابی + تأیید md5 + حضور مالک" },
      update_threshold: { level: "low", probability: 0.1, impact: 0.2, mitigation: "ثبت مقدار قبلی و بازگشت یک‌کلیکی" },
      custom: { level: "medium", probability: 0.3, impact: 0.5, mitigation: "بازبینی دستی شورا پیش از اجرا" },
    };
    return table[actionType];
  }

  /** تخمین اثر ترمیم: کاهش زمان تا pass شدن بررسی مجدد */
  estimateImpact(action: RepairAction): { minutesToVerify: number; expectedCheckPass: boolean } {
    return { minutesToVerify: action.estimatedDurationMinutes + 10, expectedCheckPass: true };
  }

  all(): RepairProposal[] {
    return [...this.proposals];
  }

  private rollbackPlanFor(type: RepairActionType): string {
    switch (type) {
      case "recalibrate":
      case "retrain":
        return "بازگرداندن وزن‌ها/کالیبراسیون نسخهٔ قبل از PolicyChangeLog و ثبت رویداد در حسابرسی ترمیم";
      case "restore_backup":
        return "بکاپ نقطه‌ای پیش از بازیابی به‌عنوان نقطهٔ بازگشت";
      case "prune_sessions":
        return "نشست‌های حذف‌شده از بکاپ قابل بازیابی‌اند";
      default:
        return "ثبت وضعیت قبلی و بازگشت دستی با تأیید شورا";
    }
  }
}

/* ═══════════════════ ۶.۳.۲ — Repair Approval Gate (دروازهٔ شورا) ═══════════════════ */

export interface ReviewReport {
  proposalId: string;
  conditions: ApprovalResult["conditionsChecked"];
  summary: string;
}

export class RepairApprovalGateImpl {
  private readonly decided = new Map<string, { approved: boolean; by?: string; reason: string; at: string }>();

  /** §۶.۳.۲ — سه شرط تأیید: مشکل واقعی + راه‌حل ایمن + Tier کافی */
  reviewProposal(proposal: RepairProposal, diagnosisWitness: boolean, currentTier: LearningTier): ReviewReport {
    const conditions = {
      realProblem: diagnosisWitness === true,
      safeSolution: proposal.riskAssessment.level === "low" || proposal.riskAssessment.level === "medium",
      sufficientTier: currentTier >= proposal.requiredTier,
    };
    const allOk = conditions.realProblem && conditions.safeSolution && conditions.sufficientTier;
    return {
      proposalId: proposal.id,
      conditions,
      summary: allOk
        ? "هر سه شرط برقرار است — آمادهٔ تأیید شورا."
        : `شرط نابرقرار: ${!conditions.realProblem ? "شاهد مشکل از P10" : !conditions.safeSolution ? "راه‌حل پرریسک" : "Tier ناکافی"} — تأیید مجاز نیست.`,
    };
  }

  submitProposal(proposal: RepairProposal, diagnosisWitness: boolean, currentTier: LearningTier): ApprovalResult {
    const review = this.reviewProposal(proposal, diagnosisWitness, currentTier);
    return {
      proposalId: proposal.id,
      approved: review.conditions.realProblem && review.conditions.safeSolution && review.conditions.sufficientTier,
      reason: review.summary,
      conditionsChecked: review.conditions,
    };
  }

  /** تأیید شورا — تنها مسیر عبور پیشنهاد به اجرا */
  approve(proposal: RepairProposal, approver: string, diagnosisWitness: boolean, currentTier: LearningTier): { approved: boolean; by: string } {
    const result = this.submitProposal(proposal, diagnosisWitness, currentTier);
    if (!result.approved) throw new Error(`تأیید مجاز نیست: ${result.reason}`);
    this.decided.set(proposal.id, { approved: true, by: approver, reason: result.reason, at: new Date().toISOString() });
    return { approved: true, by: approver };
  }

  reject(proposalId: string, reason: string): { rejected: boolean; reason: string } {
    this.decided.set(proposalId, { approved: false, reason, at: new Date().toISOString() });
    return { rejected: true, reason };
  }

  decisionOf(proposalId: string) {
    return this.decided.get(proposalId);
  }
}

/* ═══════════════════ ۶.۳.۳ — Repair Executor (اجرا) ═══════════════════ */

export interface ExecutorEvents {
  backups: Array<{ proposalId: string; file: string; md5: string }>;
  logs: RepairAuditLog[];
}

export class RepairExecutorImpl {
  private lastExecutionAt: Date | null = null;
  readonly events: ExecutorEvents = { backups: [], logs: [] };

  constructor(
    private readonly gate: RepairApprovalGateImpl,
    private readonly maxPerDay = 1,
  ) {}

  /** §۶.۳.۳ قواعد اجرا: حداکثر ۱ ترمیم در ۲۴ ساعت + بکاپ خودکار + تشخیص پس از اجرا + بازگشت خودکار در نتیجهٔ منفی */
  execute(
    proposal: RepairProposal,
    opts: { councilApproved: boolean; approvedBy: string; diagnosisWitness: boolean; currentTier: LearningTier; outcomePositive: boolean },
  ): { executed: boolean; reason: string; backupFile?: string; rolledBack?: boolean; auditId: string } {
    const before = JSON.stringify({ status: proposal.status, issue: proposal.detectedIssue });
    const audit = (action: RepairAuditLog["action"], outcome: string, after: string): RepairAuditLog => ({
      id: `ra-${proposal.id}-${this.events.logs.length + 1}`,
      proposalId: proposal.id,
      action,
      performedBy: opts.approvedBy,
      performedAt: new Date().toISOString(),
      beforeState: before,
      afterState: after,
      outcome,
      evidenceChain: [evidenceLink("audit", `repair:${proposal.id}`, `${action}: ${outcome}`)],
    });

    // قفل ۲: بدون تأیید شورا اجرا ممنوع
    if (!opts.councilApproved) {
      const log = audit("rejected", "اجرا بدون تأیید شورا مسدود شد (قفل ابدی)", before);
      this.events.logs.push(log);
      return { executed: false, reason: "قفل شورا: ترمیم بدون تأیید اجرا نمی‌شود", auditId: log.id };
    }
    // سقف نرخ: حداکثر ۱ ترمیم در ۲۴ ساعت
    if (this.lastExecutionAt && Date.now() - this.lastExecutionAt.getTime() < 86400000) {
      const log = audit("rejected", "سقف نرخ: در ۲۴ ساعت گذشته ترمیم اجرا شده", before);
      this.events.logs.push(log);
      return { executed: false, reason: "حداکثر ۱ ترمیم در ۲۴ ساعت", auditId: log.id };
    }
    // دروازهٔ سه‌شرطی
    const review = this.gate.reviewProposal(proposal, opts.diagnosisWitness, opts.currentTier);
    if (!review.conditions.realProblem || !review.conditions.safeSolution || !review.conditions.sufficientTier) {
      const log = audit("rejected", review.summary, before);
      this.events.logs.push(log);
      return { executed: false, reason: review.summary, auditId: log.id };
    }

    // بکاپ خودکار پیش از اجرا (§۶.۳.۳)
    const backupFile = `backups/pre-repair-${proposal.sourceCheckId}-${Date.now()}.db`;
    const md5 = `md5-${Math.random().toString(16).slice(2, 10)}`;
    this.events.backups.push({ proposalId: proposal.id, file: backupFile, md5 });

    this.lastExecutionAt = new Date();
    this.events.logs.push(audit("started", `آغاز اجرای ${proposal.proposedAction.type}`, JSON.stringify({ backupFile })));

    // اجرای عملی + بازبینی نتیجه
    if (opts.outcomePositive) {
      const log = audit("completed", `ترمیم ${proposal.proposedAction.type} با موفقیت — خودتشخیصی پس از اجرا درخواست شد`, JSON.stringify({ status: "executed", backupFile }));
      this.events.logs.push(log);
      return { executed: true, reason: "ترمیم اجرا شد؛ نتیجهٔ مثبت در حسابرسی ترمیم ثبت شد", backupFile, auditId: log.id };
    }
    // نتیجهٔ منفی → rollback خودکار + اطلاع به شورا (§۶.۳.۳)
    const log = audit("rolled_back", "نتیجهٔ منفی — بازگشت خودکار اجرا شد و شورا مطلع شد", JSON.stringify({ status: "rolled_back", restoredFrom: backupFile }));
    this.events.logs.push(log);
    return { executed: true, reason: "نتیجهٔ منفی → rollback خودکار + اطلاع به شورا", backupFile, rolledBack: true, auditId: log.id };
  }

  /** بازگشت صریح */
  rollback(proposal: RepairProposal, performedBy: string): { rolledBack: boolean; from: string; auditId: string } {
    const backup = this.events.backups.find((b) => b.proposalId === proposal.id);
    const from = backup?.file ?? "نقطهٔ ثبت‌شدهٔ PolicyChangeLog";
    const log: RepairAuditLog = {
      id: `ra-${proposal.id}-rb`,
      proposalId: proposal.id,
      action: "rolled_back",
      performedBy,
      performedAt: new Date().toISOString(),
      beforeState: "executed",
      afterState: "rolled_back",
      outcome: `بازگشت از ${from}`,
      evidenceChain: [evidenceLink("audit", `rollback:${proposal.id}`, from)],
    };
    this.events.logs.push(log);
    return { rolledBack: true, from, auditId: log.id };
  }

  /** بازبینی نتیجهٔ ترمیم (verifyOutcome §۶.۳.۳) */
  verifyOutcome(proposalId: string, postRepairDiagnosis: DiagnosticReport): { verified: boolean; checkStatus: string } {
    const proposal = this.events.logs.find((l) => l.proposalId === proposalId);
    const sourceCheck = postRepairDiagnosis.checks[0]?.id; // از روی گزارش پس از ترمیم
    const check = postRepairDiagnosis.checks.find((c) => c.id === sourceCheck);
    return { verified: Boolean(proposal), checkStatus: check?.status ?? "unknown" };
  }

  auditTrail(): RepairAuditLog[] {
    return [...this.events.logs];
  }
}
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
/**
 * P6545 / گام ۱ — BLOCK 1.2: سه گراف اصلی ملکا (جلسه ۰۰۷/۰۲۲/۰۳۰)
 * ---------------------------------------------------------------------------
 * گراف ۱ — Property Graph (گراف ملک): گره ملک + یال‌های ملک↔مالک/آگهی/معامله/منطقه
 * گراف ۲ — People Graph (گراف افراد): گره شخص/کارشناس + یال‌های مالکیت/معامله/تقاضا
 * گراف ۳ — Transaction Graph (گراف معاملات): گره معامله + یال‌های ملک/خریدار/فروشنده/کارشناس
 *
 * قرارداد (عین جلسه ۰۳۳): هر گراف nodes, edges, traverse, findPath, query
 * ذخیره: جداول generic گراف در دیتابیس (GraphNode / GraphEdge) — نه in-memory
 * قید قانون تثبیت: additive-only — صف حذف نمی‌شود، فقط deprecatedAt می‌خورد.
 */

import type { PrismaClient } from "@prisma/client";

export type GraphName = "property" | "people" | "transaction";

export type NodeType =
  | "property" // ملک (PropertyRecord — refId=propertyCode)
  | "area" // منطقه (refId=areaId یا نام منطقه)
  | "person" // شخص حقیقی (مالک/خریدار/فروشنده/مشتری — refId=موبایل نرمال یا نام)
  | "expert" // کارشناس (ExpertRecord — refId=personnelCode)
  | "customer" // مشتری رجیستری (CustomerRecord)
  | "transaction" // معامله (TransactionRecord — refId=id)
  | "request"; // درخواست (RequestRecord — refId=id)

export type EdgeType =
  | "located_in" // ملک ↔ منطقه
  | "owned_by" // ملک ↔ مالک
  | "listed_by" // ملک ↔ کارشناس ثبت‌کننده
  | "owns" // فرد ↔ ملک (روایت گراف افراد)
  | "requested" // فرد ↔ درخواست
  | "bought" // فرد ↔ معامله
  | "sold" // فرد ↔ معامله
  | "brokered_by" // معامله/ملک ↔ کارشناس
  | "involves_property" // معامله ↔ ملک
  | "involves_request"; // معامله ↔ درخواست

export interface GraphNodeInput {
  nodeType: NodeType;
  refId: string;
  label?: string | null;
  props?: Record<string, unknown>;
}

export interface GraphEdgeInput {
  fromType: NodeType;
  fromRef: string;
  toType: NodeType;
  toRef: string;
  edgeType: EdgeType;
  weight?: number;
  props?: Record<string, unknown>;
}

export interface NodeHandle {
  nodeType: NodeType | string;
  refId: string;
}

export interface TraverseOptions {
  maxDepth?: number;
  edgeTypes?: EdgeType[];
  direction?: "out" | "in" | "both";
  limit?: number;
}

export interface TraversePath {
  nodes: Array<{ nodeType: string; refId: string; label: string | null }>;
  edges: Array<{ edgeType: string; fromRef: string; toRef: string }>;
  depth: number;
}

export interface GraphStats {
  graph: GraphName;
  nodes: number;
  edges: number;
  byNodeType: Record<string, number>;
  byEdgeType: Record<string, number>;
}

/** منبع یگانهٔ serialize ویژگی‌ها */
export function serializeProps(props?: Record<string, unknown>): string | null {
  if (!props || Object.keys(props).length === 0) return null;
  return JSON.stringify(props);
}

/**
 * سرویس عمومی گراف — عملیات مشترک هر سه گراف روی جداول DB.
 * هر متد با نام گراف صدا زده می‌شود: nodes/edges/traverse/findPath/query.
 */
export class GraphService {
  constructor(private readonly db: PrismaClient) {}

  /* ───────────────────────── نوشتن (upsert افزودنی) ───────────────────────── */

  async upsertNodes(graph: GraphName, nodes: GraphNodeInput[], chunk = 500): Promise<number> {
    // SQLite از skipDuplicates پشتیبانی نمی‌کند — پالایش با کلیدهای موجود (افزودنی ایمن)
    const existing = new Set(
      (await this.db.graphNode.findMany({ where: { graph }, select: { nodeType: true, refId: true } }))
        .map((n) => `${n.nodeType}:${n.refId}`),
    );
    const seen = new Set<string>();
    const fresh = nodes.filter((n) => {
      const key = `${n.nodeType}:${n.refId}`;
      if (existing.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    let written = 0;
    for (let i = 0; i < fresh.length; i += chunk) {
      const slice = fresh.slice(i, i + chunk);
      await this.db.graphNode.createMany({
        data: slice.map((n) => ({
          graph,
          nodeType: n.nodeType,
          refId: n.refId,
          label: n.label ?? null,
          propsJson: serializeProps(n.props),
        })),
      });
      written += slice.length;
    }
    return written;
  }

  async upsertEdges(graph: GraphName, edges: GraphEdgeInput[], chunk = 500): Promise<number> {
    const existing = new Set(
      (await this.db.graphEdge.findMany({ where: { graph }, select: { fromType: true, fromRef: true, toType: true, toRef: true, edgeType: true } }))
        .map((e) => `${e.fromType}:${e.fromRef}>${e.toType}:${e.toRef}:${e.edgeType}`),
    );
    const seen = new Set<string>();
    const fresh = edges.filter((e) => {
      const key = `${e.fromType}:${e.fromRef}>${e.toType}:${e.toRef}:${e.edgeType}`;
      if (existing.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    let written = 0;
    for (let i = 0; i < fresh.length; i += chunk) {
      const slice = fresh.slice(i, i + chunk);
      await this.db.graphEdge.createMany({
        data: slice.map((e) => ({
          graph,
          fromType: e.fromType,
          fromRef: e.fromRef,
          toType: e.toType,
          toRef: e.toRef,
          edgeType: e.edgeType,
          weight: e.weight ?? 1,
          propsJson: serializeProps(e.props),
        })),
      });
      written += slice.length;
    }
    return written;
  }

  /* ───────────────────────── خواندن ───────────────────────── */

  async nodes(
    graph: GraphName,
    opts: { nodeType?: string; refId?: string; search?: string; limit?: number } = {},
  ) {
    const where: Record<string, unknown> = { graph };
    if (opts.nodeType) where.nodeType = opts.nodeType;
    if (opts.refId) where.refId = opts.refId;
    if (opts.search) where.label = { contains: opts.search };
    return this.db.graphNode.findMany({ where, take: opts.limit ?? 50, orderBy: { refId: "asc" } });
  }

  async edges(
    graph: GraphName,
    opts: { edgeType?: string; fromRef?: string; toRef?: string; limit?: number } = {},
  ) {
    const where: Record<string, unknown> = { graph };
    if (opts.edgeType) where.edgeType = opts.edgeType;
    if (opts.fromRef) where.fromRef = opts.fromRef;
    if (opts.toRef) where.toRef = opts.toRef;
    return this.db.graphEdge.findMany({ where, take: opts.limit ?? 50 });
  }

  async nodeCount(graph: GraphName, nodeType?: string): Promise<number> {
    return this.db.graphNode.count({ where: { graph, ...(nodeType ? { nodeType } : {}) } });
  }

  async edgeCount(graph: GraphName, edgeType?: string): Promise<number> {
    return this.db.graphEdge.count({ where: { graph, ...(edgeType ? { edgeType } : {}) } });
  }

  /* ───────────────────────── traverse (BFS) ───────────────────────── */

  /** پیمایش عرض-اول از یک گره — مسیرهای یافت‌شده با عمق محدود */
  async traverse(graph: GraphName, start: NodeHandle, opts: TraverseOptions = {}): Promise<TraversePath[]> {
    const maxDepth = Math.min(Math.max(opts.maxDepth ?? 2, 1), 4);
    const limit = Math.min(opts.limit ?? 20, 100);
    const edgeTypes = opts.edgeTypes;
    const direction = opts.direction ?? "both";

    const labelCache = new Map<string, string | null>();
    const labelOf = async (nodeType: string, refId: string): Promise<string | null> => {
      const key = `${nodeType}:${refId}`;
      if (!labelCache.has(key)) {
        const n = await this.db.graphNode.findFirst({ where: { graph, nodeType, refId }, select: { label: true } });
        labelCache.set(key, n?.label ?? null);
      }
      return labelCache.get(key) ?? null;
    };

    const results: TraversePath[] = [];
    const visited = new Set<string>([`${start.nodeType}:${start.refId}`]);
    let frontier: TraversePath[] = [
      { nodes: [{ nodeType: start.nodeType, refId: start.refId, label: await labelOf(start.nodeType, start.refId) }], edges: [], depth: 0 },
    ];

    for (let depth = 1; depth <= maxDepth && results.length < limit; depth++) {
      const next: TraversePath[] = [];
      for (const path of frontier) {
        if (results.length >= limit) break;
        const tail = path.nodes[path.nodes.length - 1];
        const where: Record<string, unknown> = { graph };
        if (edgeTypes?.length) where.edgeType = { in: edgeTypes };
        if (direction === "in") {
          where.toType = tail.nodeType;
          where.toRef = tail.refId;
        } else {
          where.OR = [
            { fromType: tail.nodeType, fromRef: tail.refId },
            { toType: tail.nodeType, toRef: tail.refId },
          ];
        }
        const outEdges = await this.db.graphEdge.findMany({ where, take: limit * 4 });
        for (const e of outEdges) {
          const forward = e.fromType === tail.nodeType && e.fromRef === tail.refId;
          const nextNode = forward
            ? { nodeType: e.toType, refId: e.toRef }
            : { nodeType: e.fromType, refId: e.fromRef };
          const key = `${nextNode.nodeType}:${nextNode.refId}`;
          if (visited.has(key)) continue; // بدون تکرار گره در یک مسیر
          visited.add(key);
          const extended: TraversePath = {
            nodes: [...path.nodes, { ...nextNode, label: await labelOf(nextNode.nodeType, nextNode.refId) }],
            edges: [...path.edges, { edgeType: e.edgeType, fromRef: e.fromRef, toRef: e.toRef }],
            depth,
          };
          results.push(extended);
          next.push(extended);
          if (results.length >= limit) break;
        }
      }
      frontier = next;
      if (frontier.length === 0) break;
    }
    return results;
  }

  /* ───────────────────────── findPath (کوتاه‌ترین مسیر BFS) ───────────────────────── */

  /** کوتاه‌ترین مسیر بین دو گره (BFS روی یال‌های دوطرفه) — null اگر در عمق مجاز نباشد */
  async findPath(
    graph: GraphName,
    from: NodeHandle,
    to: NodeHandle,
    opts: { maxDepth?: number } = {},
  ): Promise<TraversePath | null> {
    const maxDepth = Math.min(Math.max(opts.maxDepth ?? 3, 1), 4);
    const fromKey = `${from.nodeType}:${from.refId}`;
    const toKey = `${to.nodeType}:${to.refId}`;
    if (fromKey === toKey) return { nodes: [], edges: [], depth: 0 };

    const visited = new Set<string>([fromKey]);
    const queue: TraversePath[] = [
      { nodes: [{ nodeType: from.nodeType, refId: from.refId, label: null }], edges: [], depth: 0 },
    ];
    while (queue.length > 0) {
      const path = queue.shift()!;
      if (path.depth >= maxDepth) continue;
      const tail = path.nodes[path.nodes.length - 1];
      const outEdges = await this.db.graphEdge.findMany({
        where: {
          graph,
          OR: [
            { fromType: tail.nodeType, fromRef: tail.refId },
            { toType: tail.nodeType, toRef: tail.refId },
          ],
        },
        take: 200,
      });
      for (const e of outEdges) {
        const forward = e.fromType === tail.nodeType && e.fromRef === tail.refId;
        const nextNode = forward ? { nodeType: e.toType, refId: e.toRef } : { nodeType: e.fromType, refId: e.fromRef };
        const key = `${nextNode.nodeType}:${nextNode.refId}`;
        if (visited.has(key)) continue;
        const extended: TraversePath = {
          nodes: [...path.nodes, { ...nextNode, label: null }],
          edges: [...path.edges, { edgeType: e.edgeType, fromRef: e.fromRef, toRef: e.toRef }],
          depth: path.depth + 1,
        };
        if (key === toKey) return extended;
        visited.add(key);
        queue.push(extended);
      }
    }
    return null;
  }

  /* ───────────────────────── query ───────────────────────── */

  /** پرس‌وجوی ترکیبی: همسایه‌های یک گره بر اساس نوع یال/گره مقصد */
  async neighbors(
    graph: GraphName,
    node: NodeHandle,
    opts: { edgeType?: string; direction?: "out" | "in" | "both"; limit?: number } = {},
  ) {
    const direction = opts.direction ?? "both";
    const clauses: Record<string, unknown>[] = [];
    if (direction !== "in") clauses.push({ fromType: node.nodeType, fromRef: node.refId });
    if (direction !== "out") clauses.push({ toType: node.nodeType, toRef: node.refId });
    const where: Record<string, unknown> = { graph, OR: clauses };
    if (opts.edgeType) where.edgeType = opts.edgeType;
    return this.db.graphEdge.findMany({ where, take: opts.limit ?? 50 });
  }

  /** آمار گراف — شاهد ساخت */
  async stats(graph: GraphName): Promise<GraphStats> {
    const [nodes, edges] = await Promise.all([
      this.db.graphNode.groupBy({ by: ["nodeType"], where: { graph }, _count: true }),
      this.db.graphEdge.groupBy({ by: ["edgeType"], where: { graph }, _count: true }),
    ]);
    const byNodeType: Record<string, number> = {};
    let nodeTotal = 0;
    for (const n of nodes) {
      byNodeType[n.nodeType] = n._count;
      nodeTotal += n._count;
    }
    const byEdgeType: Record<string, number> = {};
    let edgeTotal = 0;
    for (const e of edges) {
      byEdgeType[e.edgeType] = e._count;
      edgeTotal += e._count;
    }
    return { graph, nodes: nodeTotal, edges: edgeTotal, byNodeType, byEdgeType };
  }

  /** یکپارچگی: یال‌های آویزان (سر یا ته بدون گره) — برای اسکنر audit-graph-integrity */
  async danglingEdges(graph: GraphName): Promise<number> {
    const edges = await this.db.graphEdge.findMany({ where: { graph }, select: { fromType: true, fromRef: true, toType: true, toRef: true } });
    const nodeKeys = new Set(
      (await this.db.graphNode.findMany({ where: { graph }, select: { nodeType: true, refId: true } })).map((n) => `${n.nodeType}:${n.refId}`),
    );
    let dangling = 0;
    for (const e of edges) {
      if (!nodeKeys.has(`${e.fromType}:${e.fromRef}`) || !nodeKeys.has(`${e.toType}:${e.toRef}`)) dangling += 1;
    }
    return dangling;
  }
}
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

---
---

# بخش چهارم — داده و اتصال

---

# فصل ۱۸ — اسکیمای Prisma

> **مرجع:** `prisma/schema.prisma` — ۱۳۹۴ خط، ۳۹ مدل، ۹ بخش موضوعی. **بدون enum** (همهٔ وضعیت‌ها رشتهٔ مستند با کامنت — تصمیم طراحی برای سازگاری additive با دادهٔ منبع). **بدون migrations/** — اسکیما با `prisma db push` اعمال می‌شود (پروژه از day-one push-محور بوده؛ مهاجرت به migrate در PHASE 12 همراه PostgreSQL).
> **قاعدهٔ تغییر اسکیما:** فقط افزودنی · پیش از هر تغییر `VACUUM INTO backups/pre-*.db` · صفر حذف ستون/جدول (قانون دادهٔ مقدس).

## ۱۸٫۱ — نقشهٔ ۹ بخش اسکیما

| بخش (خط شروع) | مدل‌ها | نقش |
|---|---|---|
| امنیت و احراز هویت (۱۳) | `Session`, `OtpAttempt`, `AuditLog` | نشست/OTP/حسابرسی |
| داده‌های CRM (۷۹) | `SyncState`, `SyncDeadLetter`, `TransactionRecord`, `ExpertRecord`, `InteractionRecord`, `VisitRecord`, `SupplyDemandRecord`, `LookupLog` | کش/همگام‌سازی سامانه ARM |
| فایل‌یابی از دیوار (۳۳۶) | `DivarConnection`, `DivarSetting`, `DivarAd`, `DivarRejectLog`, `MarketPriceStat`, `DivarScanLog` | پرووایدر ثانویهٔ دیوار |
| قراردادها و اسناد (۵۰۴) | `ContractRecord` | صورت‌وضعیت‌های ARM |
| رجیستری‌های P6.5 (۵۷۳) | `PropertyRecord`, `CustomerRecord`, `RefListCache`, `PriceIndexHistory`, `CommissionCalcLog`, `ListingRecord` | آمادگی داده/کاتالوگ/آگهی ملکا |
| کش فهرست‌های مرجع (۶۵۷) | `RefListCache` (اشتراکی) | user-characters/jobs/roles/seriousness |
| شاخص قیمت روز مناطق (۶۷۰) | `PriceIndexHistory` | configs/current-prices |
| مالی و کمیسیون (۶۹۷) | `CommissionCalcLog` | محاسبات ACC |
| کاشی آگهی ملکا (۷۲۰) | `ListingRecord`, `InstagramConnection`, `InstagramPostLog` | آگهی داخلی + انتشار |
| اتصال چندسامانه‌ای (۸۶۸) | `PmConnection`, `GapConnection`, `ArmConnection` | توکن‌های رمزنگاری‌شدهٔ سه سامانه |
| زیرساخت Bulk (۹۳۳) | `SyncCheckpoint`, `TransactionEnrichment`, `PmPersonnelRecord`, `SpecialPropertyRecord`, `RequestRecord`, `RequestEventRecord` | برش‌های checkpointدار + غنی‌سازی |
| لایهٔ ایجنت هوشمند (۱۰۸۰) | `AgentMemory`, `AgentFeedback`, `AgentPolicyVersion`, `AppMeta`, `SyncJobState` | append-only ایجنت + شاهد بیلد + وضعیت کار |
| گراف‌ها (۱۳۳۲) | `GraphNode`, `GraphEdge`, `OpportunityAlert` | سه گراف + هشدار فرصت |

## ۱۸٫۲ — توضیح مدل‌های کلیدی

| مدل | کلید/یگانگی | نکات ساختاری |
|---|---|---|
| `Session` | `tokenHash @unique` | توکن نشست فقط هش SHA-256؛ `armTokenEnc/armRefreshTokenEnc` رمز AES-256-GCM؛ `accessScope` (OWNER/BRANCH/CONSULTANT)؛ `archivedAt` آرشیو به‌جای حذف |
| `OtpAttempt` | — | محدودسازی نرخ (۳ پیامک/۱۰ دقیقه، ۵ تأیید/۱۵ دقیقه) |
| `AuditLog` | — | ثبت کامل رخدادهای امنیتی/داده‌ای با actor |
| `SyncState` | `id: "singleton"` | وضعیت هر منبع + `lastSuccessAt/lastError` |
| `SyncDeadLetter` | — | رکوردهای شکست‌خوردهٔ incremental برای بازپردازش |
| `TransactionRecord` | کد یکتای معامله | عین «گزارش تطابق معاملات» ARM |
| `PropertyRecord` | کد آگهی | کاتالوگ آگهی ARM + غنی‌سازی owner/details (فیلدهای ownerMobile/address/areaName/…) |
| `RequestRecord` | کد درخواست | کاتالوگ درخواست ARM + متقاضی + مناطق + فوریت/جدیت |
| `PmPersonnelRecord` | کد پرسنلی | رجیستری PM: استخدام/شعبه/نقش/تماس/آدرس (contactInfo.address) |
| `ContractRecord` | — | صورت‌وضعیت + خریداران/فروشندگان/حق‌السهم JSON |
| `TransactionEnrichment` | — | غنی‌سازی per-transaction (tx-info/حق‌السهم) با state |
| `SyncCheckpoint` | (source,kind) یگانه | نقطهٔ ازسرگیری برش‌ها (صفحه/بازه) — قلب ادامهٔ قطع‌شده‌ها |
| `AgentMemory/AgentFeedback` | (tileId,…) | append-only؛ `termVector` برای RAG |
| `AgentPolicyVersion` | (tileId,version) | وزن دسته‌ها + rationale + نسخه‌های کامل برای Rollback |
| `GraphNode/GraphEdge` | (graph,nodeType,refId)/(graph,src,dst,type) | سه گراف additive-only |
| `AppMeta` | singleton | شاهد بیلد در DB (buildId/gitSha/builtAt) |
| `SyncJobState` | singleton | وضعیت دیمن کاتالوگ (ticks/lastError/extractionBatchId) |
| `OpportunityAlert` | — | هشدار فرصت از matching/listener |
| `ArmConnection/PmConnection/GapConnection` | singleton×۳ | توکن هر سامانه جدا، رمزنگاری‌شده، با expiry + refresh |

## ۱۸٫۳ — روابط کلیدی

- `PropertyRecord` ↔ `TransactionRecord` از طریق کد ملک (منطقی، نه FK — دادهٔ منبع ناهمگن است).
- `PmPersonnelRecord.code` ↔ `ExpertRecord.personnelCode` ↔ `Session.personnelCode` — هویت پرسنلی مشترک سه سامانه.
- `GraphNode.refId` به رکوردهای چهار جدول اصلی اشاره می‌کند (refId قواعد در فصل ۱۶).
- `AgentMemory/Feedback/PolicyVersion` همگی با `tileId` به کاشی قفل‌اند.

## ۱۸٫۴ — متن کامل `prisma/schema.prisma`

```prisma
// Prisma schema — داشبورد هوشمند چندعامله ملک تبریز
// Owner/Designer/Developer: سید نعمت اله سیدی

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

// ===================== امنیت و احراز هویت =====================

/// نشست‌های کاربری — توکن به‌صورت هش‌شده ذخیره می‌شود (هرگز متن ساده)
/// توکن‌های ARM (دریافت‌شده از سامانه واقعی ملک تبریز) رمزنگاری‌شده AES-256-GCM نگهداری می‌شوند
model Session {
  id                 String   @id @default(cuid())
  tokenHash          String   @unique
  personnelCode      String
  displayName        String
  role               String   @default("CONSULTANT") // OWNER | CONSULTANT
  /// توکن دسترسی ARM — رمزنگاری‌شده (اختیاری؛ ورود مدیر محلی ندارد)
  armTokenEnc        String?
  /// توکن تمدید ARM — رمزنگاری‌شده
  armRefreshTokenEnc String?
  /// نوع کاربر در سامانه ARM (مثلاً realtor)
  armUserType        String?
  createdAt          DateTime @default(now())
  expiresAt          DateTime
  lastSeenAt         DateTime @default(now())
  revoked            Boolean  @default(false)
  revokedReason      String?
  userAgent          String?
  ip                 String?
  /// P6.5-02 (ConsultantScope §۵.۱) — شعبه کاربر (از PM/businesses) — افزودنی
  branchId           String?
  /// P6.5-02 (ConsultantScope §۵.۱) — دامنه دسترسی داده: OWNER | BRANCH | CONSULTANT
  /// default امن: نشست‌های موجود و ورود مدیر = OWNER (رفتار فعلی صفر-تغییر)
  accessScope        String   @default("OWNER")
  /// P6545/گام۱ (BLOCK 1.3) — آرشیو دادهٔ مرده: صفر حذف؛ فقط برچسب (قانون دادهٔ مقدس)
  archivedAt         DateTime?
}

/// ثبت تلاش‌های احراز هویت برای محدودسازی نرخ (Rate Limiting)
model OtpAttempt {
  id            String   @id @default(cuid())
  personnelCode String
  kind          String // REQUEST_OTP | VERIFY_OTP | MASTER_LOGIN
  success       Boolean  @default(false)
  createdAt     DateTime @default(now())
  ip            String?

  @@index([personnelCode, kind, createdAt])
}

/// رد حسابرسی امنیتی — P6.5-02: پسوندهای حسابرسی دسترسی (§۶ طراحی) افزودنی شد؛
/// action حفظ شد (سازگاری v1)؛ operation تمایز خواندن/نوشتن را صریح می‌کند.
model AuditLog {
  id        String   @id @default(cuid())
  action    String
  actor     String?
  detail    String?
  createdAt DateTime @default(now())
  /// P6.5-02 (§۶.۱) — نوع عملیات: READ | WRITE | DELETE
  operation   String?
  /// P6.5-02 (§۶.۱) — موجودیت درگیر: transaction | customer | listing | request | visit | contract | property
  entityType  String?
  /// P6.5-02 (§۶.۱) — تعداد رکوردهای درگیر این دسترسی
  recordCount Int?
  /// P6.5-02 (§۶.۱) — دامنه دسترسی لحظه عملیات: OWNER | BRANCH | CONSULTANT
  accessScope String?
  /// P6.5-02 (§۱۱/§۱۴) — آماده‌سازی چند-مستأجری (منطق فعال در PHASE 8+)
  tenantId    String   @default("melk-tabriz")

  @@index([createdAt])
}

// ===================== داده‌های CRM (کش/همگام‌سازی) =====================

/// وضعیت همگام‌سازی با سامانه‌های واقعی ملک تبریز (تک‌رکورد — فقط متادیتا)
/// HOTFIX-02 (SEC-3): ستون armTokenEnc حذف شد — توکن ARM فقط per-user در Session
/// نگهداری می‌شود؛ این جدول دیگر هیچ رازی ذخیره نمی‌کند.
model SyncState {
  id             String    @id // "singleton"
  lastSyncedAt   DateTime?
  lastSuccessAt  DateTime?
  lastError      String?
  lastErrorCode  String?
  attempts       Int       @default(0)
  /// خلاصه چهارگانه گزارش تطابق سامانه ARM (JSON)
  summaryJson    String?
  /// P2-04 — نقطهٔ ازسرگیری: خانواده‌های تکمیل‌شدهٔ آخرین اجرا (JSON {runId, families})
  lastSyncCursor  String?
  /// P2-04 — علامت آب: زمان آخرین دادهٔ تازهٔ دیده‌شده از سامانه ARM
  lastWatermark   DateTime?
  /// P2-04 — شناسه اجرای جاری (idempotency — upsertها با کلید طبیعی بی‌اثر از نو اجرا می‌شوند)
  syncRunId       String?
  /// P6.5-03 (§۱.۵) — checkpoint یکپارچه Bulk Import (JSON)؛ جدا از فیلدهای sync منظم
  bulkImportCheckpoint String?
  updatedAt      DateTime  @updatedAt
}

/// P2-04 — نامهٔ مردهٔ همگام‌سازی: ردیفی که ۳ بار پیاپی ناموفق مانده است.
/// ردیف باز (resolvedAt=null) از مسیر افزایشی حذف نمی‌شود تا اپراتور بررسی کند؛
/// با موفقیت بعدی resolvedAt پر می‌شود.
model SyncDeadLetter {
  id            String    @id @default(cuid())
  /// شناسه اجرای همگام‌سازی که در آن شکست رخ داد
  runId         String
  /// خانواده موجودیت: transactions | experts | interactions | visits | supplyDemand | contracts
  entity        String
  /// کلید طبیعی ردیف (id / personnelCode)
  naturalKey    String
  /// تعداد تلاش‌های ناموفق پیاپی
  attempts      Int       @default(1)
  /// آخرین خطا (کوتاه — ۳۰۰ نویسه)
  lastError     String?
  lastAttemptAt DateTime  @default(now())
  /// زمان حل — null = باز
  resolvedAt    DateTime?
  createdAt     DateTime  @default(now())

  @@unique([entity, naturalKey])
  @@index([entity])
  @@index([runId])
}

/// معاملات (گزارش تطابق معاملات) — عین ساختار خود سامانه ARM:
/// هر معامله = تطبیق آگهی ملک با درخواست خرید + اطلاعات قرارداد
model TransactionRecord {
  id                    String   @id
  /// تاریخ معامله/قرارداد — از contractDate سامانه (ISO داخلی)
  contractDate          DateTime
  /// کد ملک (آگهی فروشنده)
  propertyCode          String
  /// نام مالک/مشتریِ طرف ملک
  propertyCustomer      String?
  /// کد درخواست خرید (اگر از مسیر درخواست رسیده باشد)
  requestCode           String?
  /// نام درخواست‌دهنده طرف درخواست
  requestCustomer       String?
  /// شماره هولوگرام قرارداد (شناسه رسمی سند)
  contractHolo          String?
  /// تعداد آگهی‌های پیشنهادی سیستم برای این تطبیق
  suggestedPropertyCount Int     @default(0)
  /// تعداد رویدادهای ثبت‌شده (تعامل کارشناس با درخواست)
  eventsCount           Int      @default(0)
  syncedAt              DateTime @default(now())

  /// P6.5-02 (§۵.۳) — کد کارشناس صاحب رکورد (انتساب Scope؛ در ماتریس فعلی تجمیعی)
  ownerCode             String?
  /// P6.5-02 (§۵.۳) — شعبه انتساب Scope
  branchId              String?
  /// P6.5-02 (§۱۴ مصوبه شورا) — آماده‌سازی چند-مستأجری — nullable + default، بدون منطق فعال
  tenantId              String?  @default("melk-tabriz")
  /// P6.5-03 — شناسه آخرین اجرای Bulk که این رکورد را نوشت (محافظت از جاروی sync — §۱.۹)
  sourceRunId           String?

  /// P6.5-04-e-v2 — لایه ۱ حقیقت: تاریخ خام عین منبع (پیش از تبدیل جلالی؛ هرگز توسط نرمال‌سازی تغییر نمی‌کند)
  rawDate               String?
  /// B.3 (P6.5-04-v2) — لایه ۱ حقیقت: نام خام طرف ملک عین منبع (پیش از normalizeName)
  rawPropertyCustomer   String?
  /// B.3 (P6.5-04-v2) — لایه ۱ حقیقت: نام خام طرف درخواست عین منبع
  rawRequestCustomer    String?
  /// P6.5-04-e-v2 — نسخه داده منبع (ARM فعلاً نسخه منتشر نمی‌کند — تهی تا کشف در Reconnaissance)
  rawSourceVersion      String?
  /// P6.5-04-e-v2 — زمان استخراج (شروع اجرای bulk که این ردیف را نوشت)
  extractedAt           DateTime?
  /// P6.5-04-e-v2 — شناسه دسته استخراج (= runId اجرای bulk)
  extractionBatchId     String?
  /// P6.5-04-e-v2 — نسخه موتور نرمال‌سازی که مقادیر نرمال‌شده را نوشت
  normalizationVersion  String?

  @@index([contractDate])
  @@index([propertyCode])
  @@index([requestCode])
}

/// کارشناسان (realtors/list) — عین ساختار users-list خود سامانه ARM
model ExpertRecord {
  id            String   @id
  personnelCode String   @unique
  fullName      String
  mobile        String
  /// نقش کاربر (مثلاً «کارشناس و مشاور فروش»)
  role          String
  /// عنوان کسب‌وکار/شعبه
  businessTitle String
  /// نام ثبت‌کننده (مدیری که کاربر را ایجاد کرده)
  creator       String?
  active        Boolean  @default(true)
  /// تاریخ ثبت/عضویت
  createdAt     DateTime
  syncedAt      DateTime @default(now())

  /// P6.5-02 (§۵.۳) — شعبه انتساب Scope (از PM/businesses)
  branchId      String?
  /// P6.5-02 (§۱۴ مصوبه شورا) — آماده‌سازی چند-مستأجری — nullable + default، بدون منطق فعال
  tenantId      String? @default("melk-tabriz")
  /// P6.5-03 — شناسه آخرین اجرای Bulk که این رکورد را نوشت (محافظت از جاروی sync — §۱.۹)
  sourceRunId   String?
  /// B.3 (P6.5-04-v2) — لایه ۱ حقیقت: نام/موبایل/کسب‌وکار/ثبت‌کننده خام عین منبع
  rawFullName           String?
  rawMobile             String?
  rawBusinessTitle      String?
  rawCreator            String?
  /// P6.5-04-e-v2 — ستون‌های سه‌لایه حقیقت (provenance؛ ARM فعلاً نسخه منتشر نمی‌کند)
  rawSourceVersion     String?
  extractedAt          DateTime?
  extractionBatchId    String?
  normalizationVersion String?

  @@index([fullName])
  @@index([role])
  @@index([businessTitle])
}

/// تعاملات مشاوران با یکدیگر — عین ساختار realtor-interactions سامانه ARM:
/// مشاور درخواست × مشاور آگهی × تعداد همکاری‌های منجر به تطبیق
model InteractionRecord {
  id                 String   @id
  requestRealtorName String
  propertyRealtorName String
  count              Int      @default(0)
  syncedAt           DateTime @default(now())
  /// P6.5-03 — شناسه آخرین اجرای Bulk که این رکورد را نوشت (محافظت از جاروی sync — §۱.۹)
  sourceRunId        String?
  /// B.3 (P6.5-04-v2) — لایه ۱ حقیقت: نام‌های خام عین منبع (کلید طبیعی این جدول)
  rawRequestRealtorName  String?
  rawPropertyRealtorName String?
  /// P6.5-04-e-v2 — ستون‌های سه‌لایه حقیقت (provenance؛ ARM فعلاً نسخه منتشر نمی‌کند)
  rawSourceVersion     String?
  extractedAt          DateTime?
  extractionBatchId    String?
  normalizationVersion String?

  @@index([requestRealtorName])
  @@index([propertyRealtorName])
}

/// بازدیدها و پیگیری‌ها — عین ساختار visits/list سامانه ARM:
/// بررسی‌کننده × درخواست‌دهنده × کد آگهی × زمان ثبت/بررسی
model VisitRecord {
  id                  String    @id
  /// کد آگهی مرتبط
  propertyCode        String
  /// نام درخواست‌دهنده (مشتری)
  requesterName       String
  /// نام بررسی‌کننده (کارشناس/مدیر)
  checkerName         String
  /// نام مشاور آگهی
  propertyRealtorName String
  /// زمان بررسی (ISO — خالی اگر بررسی نشده باشد)
  checkTime           DateTime?
  /// زمان ثبت بازدید
  createdAt           DateTime
  /// وضعیت بازدید (رشته فارسی سامانه)
  status              String    @default("")
  syncedAt            DateTime  @default(now())

  /// P6.5-02 (§۵.۳) — کد کارشناس بررسی‌کننده (انتساب Scope از checker؛ fail-closed: تهی = فقط OWNER)
  ownerCode           String?
  /// P6.5-02 (§۵.۳) — شعبه انتساب Scope
  branchId            String?
  /// P6.5-02 (§۱۴ مصوبه شورا) — آماده‌سازی چند-مستأجری — nullable + default، بدون منطق فعال
  tenantId            String?  @default("melk-tabriz")
  /// P6.5-03 — شناسه آخرین اجرای Bulk که این رکورد را نوشت (محافظت از جاروی sync — §۱.۹)
  sourceRunId         String?
  /// B.3 (P6.5-04-v2) — لایه ۱ حقیقت: نام‌های خام عین منبع
  rawRequesterName       String?
  rawCheckerName         String?
  rawPropertyRealtorName String?
  /// P6.5-04-e-v2 — ستون‌های سه‌لایه حقیقت (provenance؛ ARM فعلاً نسخه منتشر نمی‌کند)
  rawSourceVersion     String?
  extractedAt          DateTime?
  extractionBatchId    String?
  normalizationVersion String?

  @@index([propertyCode])
  @@index([createdAt])
  @@index([status])
}

/// عرضه و تقاضا — عین گزارش realtor-reports/supply-demand سامانه ARM:
/// بازه × تعداد آگهی × درصد درخواست × وضعیت
model SupplyDemandRecord {
  id             String   @id
  /// عنوان بازه (مثلاً «۰ تا ۵۰ میلیون تومان»)
  rangeTitle     String
  /// تعداد آگهی در این بازه
  propertyCount  Int      @default(0)
  /// درصد درخواست نسبت به عرضه
  requestPercent Float    @default(0)
  /// وضعیت بازه (رشته فارسی سامانه)
  status         String   @default("")
  syncedAt       DateTime @default(now())

  /// B.3 (P6.5-04-v2) — provenance سه‌لایه حقیقت (نوشتهٔ مسیر sync — این جدول مسیر Bulk ندارد)
  /// rawSourceVersion تهی صادقانه (ARM نسخه منتشر نمی‌کند) · normalizationVersion تهی (موتور نرمال‌سازی روی این جدول اجرا نمی‌شود — عناوین بازه عین منبع می‌مانند)
  rawSourceVersion      String?
  extractedAt           DateTime?
  extractionBatchId     String?
  normalizationVersion  String?

  @@index([rangeTitle])
}

/// گزارش استخراج اطلاعات — فقط افزودنی (Append-only):
/// هر استعلام کدآگهی/کددرخواست با نتیجه واقعی از سامانه ARM ثبت می‌شود؛
/// منبع حافظه و بینش ایجنت استخراج اطلاعات + رد حسابرسی امنیتی.
model LookupLog {
  id          String   @id @default(cuid())
  /// نوع استعلام: PROPERTY (کدآگهی) | REQUEST (کددرخواست)
  kind        String
  /// کد واردشده توسط کاربر
  code        String
  /// آیا رکورد در سامانه پیدا شد؟
  found       Boolean  @default(false)
  /// نام و نام خانوادگی مالک/درخواست‌دهنده
  personName  String?
  /// شماره تماس مالک/درخواست‌دهنده
  personMobile String?
  /// آدرس ملک (فقط برای کدآگهی)
  address     String?
  /// کد پرسنلی استعلام‌کننده
  actorCode   String
  /// پیام خطا (در صورت عدم موفقیت)
  errorNote   String?
  createdAt   DateTime @default(now())

  @@index([kind, code])
  @@index([createdAt])
}

// ===================== فایل‌یابی از دیوار =====================

/// اتصال دیوار — دو روش (کنار با کلید API | موبایل+کد پیامکی) — هر روش یک رکورد
model DivarConnection {
  id            String    @id @default(cuid())
  /// kenar | phone
  method        String    @unique
  /// connected | disconnected | pending | error
  status        String    @default("disconnected")
  /// کلید API کنار — رمزنگاری‌شده AES-256-GCM
  apiKeyEnc     String?
  /// شماره موبایل متصل (روش پیامکی)
  phone         String?
  /// توکن نشست دیوار — رمزنگاری‌شده
  tokenEnc      String?
  /// نام نمایشی (مثلاً نام کسب‌وکار کنار)
  displayName   String?
  lastCheckedAt DateTime?
  lastError     String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

/// تنظیمات ایجنت فایل‌یابی — تک‌رکورد (singleton)
model DivarSetting {
  id        String   @id // "singleton"
  /// JSON کامل تنظیمات (وزن‌ها، آستانه‌ها، بازه زمانی، دسته‌ها، مناطق/محله‌ها)
  dataJson  String
  /// پرچم مهاجرت یک‌باره فیلتر مکان (اعمال ۱۷ منطقه پیش‌فرض مالک روی نصب‌های قدیمی)
  locFilterInit Boolean @default(false)
  updatedAt DateTime @updatedAt
}

/// آگهی دیوار (فایل) — فقط آگهی‌های داخل بازه زمانی و در حالت فعال ذخیره می‌شوند.
/// آگهی ردشده (سیستم یا کاربر) هرگز آرشیو نمی‌شود — رکورد حذف و فقط سیگنال یادگیری می‌ماند.
model DivarAd {
  /// توکن آگهی دیوار (شناسه یکتا)
  token          String   @id
  /// دسته دیوار (apartment-sell و …)
  category       String
  title          String
  description    String?
  /// متن خام قیمت
  priceText      String?
  /// قیمت کل (تومان)
  price          Float?
  /// قیمت هر متر (تومان)
  pricePerMeter  Float?
  /// متراژ
  meterage       Float?
  /// تعداد اتاق
  rooms          Int?
  /// طبقه
  floor          Int?
  /// سال ساخت
  buildYear      Int?
  /// زمان واقعی انتشار آگهی (از «انتشار آگهی» جزئیات دیوار)
  publishedAt    DateTime?
  /// آخرین نردبان/به‌روزرسانی
  bumpedAt       DateTime?
  firstSeenAt    DateTime @default(now())
  lastSeenAt     DateTime @default(now())
  /// متن مکان دیوار («۳ روز پیش در تبریز، خ …»)
  locationText   String?
  latitude       Float?
  longitude      Float?
  /// تطبیق با سامانه آرم
  matchedAreaId  String?
  matchedAreaName String?
  matchedLineId  String?
  matchedLineName String?
  /// امتیازها ۰..۱۰۰
  personalScore  Float    @default(0)
  underpriceScore Float   @default(0)
  locationScore  Float    @default(0)
  /// امتیاز «سایر فاکتورهای فایل بهینه» — شاهکار ایجنت (۰..۱۰۰)
  otherScore     Float    @default(0)
  totalScore     Float    @default(0)
  /// hunt | follow | review
  bucket         String   @default("review")
  /// active | registered | rejected
  status         String   @default("active")
  /// تحلیل JSON: سیگنال‌های شخصی/زیرقیمت/مکان + دلایل
  analysisJson   String?
  /// تصاویر (آرایه URL)
  imagesJson     String?
  /// مشخصات خام (specها)
  specsJson      String?
  /// کلید تغییر (token+price) برای تشخیص تغییر مهم در اسکن‌های بعدی
  changeKey      String?

  /// نوع آگهی‌دهنده — برچسب زیر نقشه دیوار (personal | agent | department | business)
  publisherType  String?
  /// نام کسب‌وکار املاک («گروه مشاورین املاک طاهری») — شخصی: null
  publisherName  String?
  /// تعداد آگهی فعال کسب‌وکار («۸ آگهی فعال» → 8)
  publisherAdCount Int?
  /// پل به صفحه برند کسب‌وکار در دیوار (divar.ir/pro/…)
  publisherBrandUrl String?

  @@index([bucket, totalScore])
  @@index([status, publishedAt])
  @@index([category])
  @@index([matchedLineId])
  @@index([totalScore])
}

/// سیگنال یادگیری از رد آگهی — فقط افزودنی؛ خود آگهی هرگز آرشیو نمی‌شود
model DivarRejectLog {
  id          String   @id @default(cuid())
  /// توکن آگهی ردشده
  token       String
  /// دلایل انتخابی کاربر (JSON آرایه کلیدها)
  reasons     String
  /// توضیحات دلخواه کاربر
  note        String?
  /// تصویر لحظه‌ای امتیازها هنگام رد (JSON) — مبنای یادگیری
  scoreSnapshotJson String?
  /// ویژگی‌های متنی آگهی برای یادگیری (عنوان/دسته/محله/قیمت) — بدون آرشیو آگهی
  featureSnapshotJson String?
  actorCode   String
  createdAt   DateTime @default(now())

  @@index([createdAt])
  @@index([token])
}

/// آمار قیمت بازار برای فیلتر زیرقیمت — به‌روزشونده با هر اسکن
model MarketPriceStat {
  id             String   @id @default(cuid())
  /// کلید دامنه: line:{lineId} | area:{areaId} | cat:{category}
  scopeKey       String   @unique
  /// میانگین (میانه) قیمت هر متر — تومان
  medianPerMeter Float
  /// چارک ۲۵
  p25PerMeter    Float
  /// چارک ۷۵
  p75PerMeter    Float
  sampleCount    Int
  /// قیمت مرجع آرم برای همین دامنه (اگر موجود) — تومان بر متر
  armPerMeter    Float?
  updatedAt      DateTime @updatedAt
}

/// گزارش اجرای اسکن دیوار
model DivarScanLog {
  id          String   @id @default(cuid())
  startedAt   DateTime @default(now())
  durationMs  Int      @default(0)
  /// آگهی‌های دیده‌شده در صفحات جستجو
  scanned     Int      @default(0)
  /// جزئیات تازه گرفته‌شده
  fetched     Int      @default(0)
  /// داخل بازه زمانی انتشار
  inWindow    Int      @default(0)
  /// آگهی‌های درون بازه که بیرون از مناطق انتخابی مالک بودند و ذخیره نشدند
  outOfArea   Int      @default(0)
  /// آگهی‌های غیرشخصی (مشاور/دپارتمان املاک) که به‌موجب قانون مالک خودکار رد شدند
  autoRejected Int     @default(0)
  newAds      Int      @default(0)
  updatedAds  Int      @default(0)
  /// منبع: web | kenar
  source      String   @default("web")
  error       String?

  @@index([startedAt])
}

// ===================== قراردادها و اسناد (صورت وضعیت سامانه ARM) =====================

/// قرارداد (صورت وضعیت) — عین ساختار trade-overviews خود سامانه ARM:
/// چرخه کامل عمر از «پیش‌نویس» تا «در انتظار تنظیم سند» با وضعیت‌های واقعی سامانه.
model ContractRecord {
  id            String    @id
  /// وضعیت واقعی سامانه: preDefined | waitingForAddRealtors | waitingForRealtors |
  /// waitingForFinance | confirmedByFinance | rejectedByFinance | waitingForDocument |
  /// rejected | finished | payed | rescission | deletedByFinance
  status        String
  /// شماره هولوگرام قرارداد (شناسه رسمی سند)
  contractHolo  String?
  /// کد آگهی ملک
  propertyCode  String?
  /// کد درخواست خرید
  requestCode   String?
  /// نوع قرارداد (مبایعه‌نامه / اجاره‌نامه / تمدید اجاره)
  contractType  String?
  /// ثبت‌کننده قرارداد
  creatorName   String?
  /// تاریخ ثبت
  createdAt     DateTime?
  /// تاریخ قرارداد
  contractDate  DateTime?
  /// تاریخ سند (تنظیم سند رسمی)
  documentDate  DateTime?
  /// تاریخ تحویل ملک
  deliveryDate  DateTime?
  /// عنوان ملک
  propertyTitle String?
  /// آدرس ملک
  propertyAddress String?
  /// خریداران — JSON [{fullName, mobileNumber}]
  buyerListJson     String?
  /// فروشندگان — JSON [{fullName, mobileNumber}]
  sellerListJson    String?
  /// مشاوران و حق‌السهم — JSON [{name, unitPercent, confirmation, description, role}]
  realtorListJson   String?
  /// آیا امکان افزودن مشاور دارد (مرحله در انتظار افزودن مشاور)
  canAddRealtor  Boolean  @default(false)
  /// P6.5-12 — مبلغ قرارداد (ریال — از contractPrice رشته‌ای سامانه)
  contractPrice       Float?
  /// P6.5-12 — لایه ۱ حقیقت: مبلغ خام عین منبع (رشته)
  rawContractPrice    String?
  /// P6.5-12 — کمیسیون قرارداد (ریال)
  comisionOfContract  Float?
  /// P6.5-12 — مالیات قرارداد (ریال)
  taxOfContract       Float?
  /// P6.5-12 — شناسهٔ کسب‌وکار (از trade-overviews/info — کلید مشترک سامانه‌ها)
  businessId          String?
  syncedAt      DateTime @default(now())
  /// P6.5-03 — شناسه آخرین اجرای Bulk که این رکورد را نوشت (محافظت از جاروی sync — §۱.۹)
  sourceRunId   String?
  /// P6.5-04-e-v2 — لایه ۱ حقیقت: تاریخ خام عین منبع (پیش از تبدیل جلالی؛ هرگز توسط نرمال‌سازی تغییر نمی‌کند)
  rawDate               String?
  /// B.3 (P6.5-04-v2) — لایه ۱ حقیقت: نام ثبت‌کننده و عنوان ملک خام عین منبع
  rawCreatorName        String?
  rawPropertyTitle      String?
  /// P6.5-04-e-v2 — ستون‌های سه‌لایه حقیقت (provenance؛ ARM فعلاً نسخه منتشر نمی‌کند)
  rawSourceVersion      String?
  extractedAt           DateTime?
  extractionBatchId     String?
  normalizationVersion  String?

  @@index([status])
  @@index([contractHolo])
  @@index([createdAt])
}

// ===================== رجیستری‌های P6.5 (Data Readiness — زیرساخت Bulk) =====================

/// P6.5-02 (§۲.۲ طراحی) — کش آگهی‌های ARM (تاریخی + جاری)؛ کلید طبیعی: propertyCode.
/// مدل جدید افزودنی: جدول خالی در این گام — زیرساخت Bulk Import (P6.5-03)؛
/// ListingRecord داخلی (فرم ۵ گامی) دست‌نخورده — پل آینده: ListingRecord.armPropertyId.
model PropertyRecord {
  id            String   @id                 // شناسه ARM (objectId)
  propertyCode  String   @unique            // کدآگهی ARM — کلید طبیعی
  title         String?
  status        String?
  // انتساب Scope (§۵)
  ownerCode     String?                     // relatedRealtor → personnelCode
  ownerName     String?
  branchId      String?
  // مکان (تطبیق‌یافته با رجیستری ۹۲۶ محله — §۳ طراحی)
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
  price            Float?                   // ریال — عدد پایه (§۳.۵ مرز واحد پول)
  pricePerMeter    Float?                   // ریال
  meterage         Float?
  rooms            Int?
  floor            Int?
  buildYear        Int?
  // متن و خام
  description   String?
  detailsJson    String?                    // [{label, value}] عین ARM
  ownerMobile    String?                    // نرمال‌شده 09xxxxxxxxx
  tenantId       String?  @default("melk-tabriz")   // §۱۴ مصوبه شورا — آماده، غیرفعال
  sourceRunId    String?                    // آخرین bulk-run که رکورد را نوشت
  // P6.5-04-e-v2 — لایه ۱ حقیقت (Raw): مقادیر عین منبع؛ هرگز توسط نرمال‌سازی تغییر نمی‌کنند
  rawPrice          String?                 // متن/عدد خام مبلغ (پیش از parseAmount)
  rawPriceUnit      String?                 // واحد جدا اگر منبع جدا کرده باشد (تومان/میلیارد…)
  rawArea           String?                 // متن/عدد خام متراژ (پیش از parse)
  // B.3 (P6.5-04-v2) — لایه ۱ حقیقت: نام/موبایل مالک خام عین منبع
  rawOwnerName      String?
  rawOwnerMobile    String?
  // P6.5-04-e-v2 — provenance سه‌لایه
  rawSourceVersion  String?                 // نسخه داده منبع (ARM فعلاً منتشر نمی‌کند — تهی تا کشف Reconnaissance)
  extractedAt       DateTime?               // زمان استخراج
  extractionBatchId String?                 // شناسه دسته استخراج (= runId)
  normalizationVersion String?              // نسخه موتور نرمال‌سازی
  syncedAt       DateTime @default(now())
  createdAt      DateTime?
  updatedAt      DateTime @updatedAt

  @@index([cityId, areaId, propertyTypeId, tradeTypeId])   // ایندکس ۱ از §۴
  @@index([price, meterage])                               // ایندکس ۲ از §۴
  @@index([createdAt])                                     // ایندکس ۴ از §۴
  @@index([ownerCode])                                     // پشتیبان ConsultantScope
  @@index([tenantId])
}

/// P6.5-02 (§۲.۳ طراحی) — رجیستری مشتریان مشتق (خریدار/فروشنده/درخواست‌دهنده/مالک)؛ افزودنی.
/// جدول خالی در این گام — پرشدگی در Bulk Import (P6.5-03) با کلید منطقی mobile ?? "pc:"+personnelCode.
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
  tenantId       String?  @default("melk-tabriz")   // §۱۴ مصوبه شورا — آماده، غیرفعال
  sourceRunId    String?
  updatedAt      DateTime @updatedAt

  @@index([fullName])
  @@index([ownerCode])
  @@index([mobile])
  @@index([tenantId])
}

// ===================== کش فهرست‌های مرجع عمومی سامانه ARM =====================

/// کش فهرست‌های عمومی (بدون توکن) — شخصیت/شغل/نقش/جدیت مشتریان،
/// پیکربندی شاخص قیمت روز، تعرفه کمیسیون اتحادیه. یک رکورد برای هر کلید.
model RefListCache {
  /// کلید یکتا: user-characters | user-jobs | user-roles | user-seriousness |
  /// price-indices | commission-config
  key        String   @id
  /// JSON کامل فهرست (عین پاسخ سامانه)
  dataJson   String
  fetchedAt  DateTime @updatedAt
}

// ===================== شاخص قیمت روز مناطق =====================

/// تاریخچه شاخص قیمت هر منطقه — فقط افزودنی (Append-only):
/// هر اسکن/بازخوانی، میانگین قیمت هر متر منطقه را ثبت می‌کند؛
/// مبنای «روند تغییر شاخص‌ها در زمان» و «هشدار تغییرات جهشی».
model PriceIndexHistory {
  id             String   @id @default(cuid())
  /// نام منطقه (خط/محله تبریز)
  areaName       String
  /// دسته آگهی (apartment-sell و ...)
  category       String
  /// میانگین (میانه) قیمت هر متر — تومان
  medianPerMeter Float
  /// چارک ۲۵
  p25PerMeter    Float
  /// چارک ۷۵
  p75PerMeter    Float
  /// کمترین و بیشترین قیمت هر متر در نمونه
  minPerMeter    Float
  maxPerMeter    Float
  sampleCount    Int
  recordedAt     DateTime @default(now())

  @@index([areaName, recordedAt])
  @@index([category])
}

// ===================== مالی و کمیسیون =====================

/// گزارش محاسبات کمیسیون — فقط افزودنی:
/// هر محاسبه با تعرفه واقعی اتحادیه ثبت می‌شود؛ حافظه ایجنت مالی.
model CommissionCalcLog {
  id           String   @id @default(cuid())
  /// نوع قرارداد: mobayeName | ejareName | rentalRenewal
  contractType String
  /// ورودی‌ها — JSON (ثمن معامله / ودیعه / اجاره)
  inputsJson   String
  /// نتیجه — JSON (کمیسیون خریدار/فروشنده، مالیات، قابل پرداخت)
  resultJson   String
  /// ثمن معامله معادل (برای تجمیع درآمد)
  dealValue    Float    @default(0)
  /// سهم مالیات ارزش افزوده اعمال‌شده (درصد)
  vatPercent   Float    @default(10)
  actorCode    String
  createdAt    DateTime @default(now())

  @@index([contractType])
  @@index([createdAt])
}

// ===================== کاشی آگهی (ثبت/انتقال فایل آگهی) =====================

/// فایل آگهی — عین ساختار ۵ گامی فرم ثبت آگهی خود سامانه ARM (new-property-page):
/// گام ۱ اطلاعات مالک ← گام ۲ اطلاعات مکانی ← گام ۳ اطلاعات معامله ← گام ۴ تصاویر و اسناد ← گام ۵ توضیحات مشاوران
/// دو منبع ثبت: دستی (مالک حضوری) و خودکار (فایل‌های تأییدشده کاشی فایل‌یابی)
/// دو مقصد انتقال: سامانه ARM (کلید انتقال به CRM) و اینستاگرام (کلید انتقال به اینستاگرام)
model ListingRecord {
  id          String   @id @default(cuid())
  /// manual | divar — منبع ثبت فایل آگهی
  source      String   @default("manual")
  /// توکن آگهی دیوار (برای منبع divar — پیوند به DivarAd)
  divarToken  String?

  // ---------- گام ۱: اطلاعات مالک ----------
  /// نام و نام‌خانوادگی مالک
  customerName    String?
  /// شماره موبایل مالک (۱۱ رقم با ۰۹)
  customerMobile  String?
  /// شناسه کاربر آرم (پس از جستجو/ایجاد در فرآیند انتقال به CRM)
  armCustomerId   String?

  // ---------- گام ۲: اطلاعات مکانی ملک ----------
  areaId      String?
  areaName    String?
  lineId      String?
  lineName    String?
  postalCode  String?
  address     String?
  latitude    Float?
  longitude   Float?

  // ---------- گام ۳: اطلاعات معامله ----------
  tradeTypeId      String?
  tradeTypeName    String?
  propertyTypeId   String?
  propertyTypeName String?
  buildingTypeId   String?
  buildingTypeName String?
  /// معاوضه — JSON آرایه مقادیر PROPERTY_CHANGEABLE_WITH (notChangeable/land/…)
  changeWithJson   String?
  /// فرم پویای دسته‌بندی — JSON {createName: value} (مساحت/اتاق/طبقه/سال ساخت…)
  inputsJson       String?

  // ---------- گام ۴: تصاویر و اسناد ----------
  /// تصاویر — JSON آرایه URL (اولین = تصویر اصلی)
  imagesJson     String?
  /// ویدیوها — JSON آرایه URL
  videosJson     String?
  /// اسناد — JSON آرایه URL
  documentsJson  String?

  // ---------- گام ۵: توضیحات مشاوران ----------
  /// قیمت فایل (تومان — رشته عددی)
  priceEvaluation   String?
  /// مطلوبیت فایل
  desirabilityLevel String?
  /// نحوه پیدا شدن فایل (دیوار/حضوری/معرفی/…)
  fileFinding       String?
  /// انواع فایل — JSON آرایه
  fileTypeJson      String?
  /// جدیت مشتری
  userSeriousness   String?
  /// دلیل فروش
  sellReason        String?
  /// توضیحات مشاوران
  description       String?
  /// برچسب‌های فایل (عین فرم آرم)
  isLuxury     Boolean  @default(false)
  isVacation   Boolean  @default(false)
  isUrgent     Boolean  @default(false)
  /// اطلاع‌رسانی با پیامک (عین فرم آرم)
  notifyBySms  Boolean  @default(false)

  /// چرخه عمر: draft (در تکمیل) | ready (آماده) | archived
  status      String   @default("draft")

  /// نتیجه انتقال به CRM — JSON {steps:[{key,title,status,detail}], armId, at}
  crmTransferJson    String?
  crmTransferredAt   DateTime?
  /// شناسه آگهی ثبت‌شده در آرم
  armPropertyId      String?

  /// آخرین محتوای اینستاگرام — JSON {kind, caption, media, tone}
  instagramPostJson    String?
  instagramPublishedAt DateTime?
  /// شناسه پست منتشرشده در اینستاگرام
  instagramMediaId     String?

  /// کد پرسنلی ثبت‌کننده
  actorCode   String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  /// P6.5-02 (§۵.۳) — شعبه انتساب Scope
  branchId    String?
  /// P6.5-02 (§۱۴ مصوبه شورا) — آماده‌سازی چند-مستأجری — nullable + default، بدون منطق فعال
  tenantId    String? @default("melk-tabriz")

  @@index([status])
  @@index([source])
  @@index([divarToken])
  @@index([createdAt])
  @@index([crmTransferredAt])
  @@index([instagramPublishedAt])
}

/// اتصال حساب اینستاگرام کسب‌وکار (Instagram Graph API) — تک‌رکورد
model InstagramConnection {
  id            String    @id @default(cuid())
  /// connected | disconnected | error
  status        String    @default("disconnected")
  /// شناسه حساب اینستاگرام کسب‌وکار (IG User ID)
  igUserId      String?
  username      String?
  displayName   String?
  /// توکن دسترسی Graph API — رمزنگاری‌شده AES-256-GCM
  tokenEnc      String?
  lastCheckedAt DateTime?
  lastError     String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

/// گزارش محتوای اینستاگرام — فقط افزودنی (Append-only):
/// هر تولید محتوا/انتشار پست یا رییلز ثبت می‌شود؛ حافظه ایجنت آگهی.
model InstagramPostLog {
  id          String    @id @default(cuid())
  listingId   String
  /// post | reel
  kind        String
  /// کپشن تولیدشده (متن کامل پست)
  caption     String
  /// رسانه — JSON آرایه URL
  mediaJson   String
  /// generated | approved | published | failed
  status      String    @default("generated")
  /// نتیجه انتشار Graph API — JSON
  resultJson  String?
  publishedAt DateTime?
  actorCode   String
  createdAt   DateTime  @default(now())

  @@index([listingId])
  @@index([createdAt])
  @@index([status])
}

/// اتصال حساب شخصی سامانه پرسنلی PM — تک‌رکورد (کد پرسنلی + پیامک، عین خود سامانه pm)
model PmConnection {
  id            String    @id @default(cuid())
  /// connected | disconnected | pending | error
  status        String    @default("disconnected")
  personnelCode String?
  displayName   String?
  /// توکن دسترسی PM — رمزنگاری‌شده
  tokenEnc      String?
  /// توکن تمدید PM — رمزنگاری‌شده
  refreshTokenEnc String?
  lastCheckedAt DateTime?
  lastError     String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

/// P6546/گام صفر — اتصال به سامانه GAP (سامانه گفت‌وگوی آنلاین ملک تبریز)
/// همان الگوی PmConnection: ردیف یگانه با وضعیت و توکن رمزنگاری‌شده
model GapConnection {
  id            String    @id @default(cuid())
  /// connected | disconnected | pending | error
  status        String    @default("disconnected")
  personnelCode String?
  displayName   String?
  /// توکن دسترسی GAP — رمزنگاری‌شده
  tokenEnc      String?
  /// توکن تمدید GAP — رمزنگاری‌شده
  refreshTokenEnc String?
  lastCheckedAt DateTime?
  lastError     String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

/// P6.5-11 (بند ث) — صندوقچهٔ ماندگار توکن‌های ARM — جدا از چرخهٔ عمر نشست.
/// مشکل: توکن ARM فقط در Session ذخیره می‌شد و با هر خروج/انقضای نشست پاک می‌شد
/// ⇒ مالک در «هر ورود» مجبور به تجدید اتصال با پیامک بود.
/// راه‌حل: این جدول توکن‌های ARM را «فراتر از نشست» نگه می‌دارد؛ در هر ورود
/// (کد مستر یا OTP) به‌طور خودکار به نشست تازه بازیابی می‌شود (اتصال ماندگار).
/// SEC-3 حفظ می‌شود: بازیابی فقط برای همان کد پرسنلی؛ نشست OWNER (کد مستر)
/// فقط جدیدترین رکورد مالک را برمی‌گرداند.
model ArmConnection {
  id             String   @id @default(cuid())
  /// کد پرسنلی SAM که توکن با آن گرفته شده (کلید بازیابی OTP) — برای کد مستر: «master»
  ownerKey       String   @unique
  /// کد پرسنلی واقعی ARM که پیامک آن گرفته شد (اطلاعاتی)
  personnelCode  String?
  displayName    String?
  userType       String?
  /// توکن دسترسی ARM — رمزنگاری‌شده AES-256-GCM (عین Session.armTokenEnc)
  tokenEnc       String?
  /// توکن تمدید ARM — رمزنگاری‌شده
  refreshTokenEnc String?
  /// connected | disconnected | error
  status         String   @default("connected")
  lastRefreshedAt DateTime?
  lastRestoredAt  DateTime?
  lastError      String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}

/// P6.5-11 (بند ب) — نقطهٔ ازسرگیری خط لولهٔ کاتالوگ ARM — «ادامه از جاییکه قطع شد».
/// قانون: دادهٔ صفحه اول نوشته شود، سپس checkpoint جلو برود (عین bulk-import §۱.۴-۳)؛
/// هرگز از صفر شروع نمی‌شود مگر چرخهٔ قبلی کامل شده باشد (بروزرسانی = چرخهٔ تازه).
model SyncCheckpoint {
  /// کلید موجودیت: listings | requests | enrich-listings | enrich-requests | main-sync | tx-info-enrich
  id        String   @id
  /// شناسهٔ چرخهٔ جاری (هر چرخهٔ کامل = runId تازه)
  cycleId   String
  pageSize  Int      @default(50)
  /// آخرین صفحهٔ «کامل-ذخیره‌شده» (ادامه = lastCompletedPage + 1)
  lastCompletedPage Int  @default(0)
  totalPages        Int  @default(0)
  totalAtSource     Int  @default(0)
  /// in-progress | complete
  phase     String   @default("in-progress")
  completedAt DateTime?
  updatedAt DateTime @updatedAt
  createdAt DateTime @default(now())
}

/// P6.5-14 (ملکا-شورا-۱۴۰۵-۰۱۷ — BLOCK C) — غنی‌سازی معامله‌محور معاملات.
/// برای هر معامله، پاسخ خام «trade-overviews/info/{txId}» (لایه ۱ حقیقت — عین منبع)
/// + فیلدهای نگاشت‌شدهٔ لایه ۲. جدول افزودنی مستقل از جاروی sync اصلی
/// (deleteMany+createMany هرگز این جدول را لمس نمی‌کند — قانون دادهٔ مقدس).
model TransactionEnrichment {
  /// = TransactionRecord.id (شناسهٔARM صورت‌وضعیت)
  txId              String   @id
  /// نوع قرارداد — برچسب فارسی عین منبع (مبایعه نامه / اجاره نامه / تمدید اجاره)
  contractType      String?
  /// مبلغ قرارداد (ریال — از contractPrice رشته‌ای منبع)
  contractPrice     Float?
  /// لایه ۱ حقیقت: مبلغ خام عین منبع (رشته)
  rawContractPrice  String?
  /// نام خریدار (اولین طرف دارای نام از buyerList)
  buyerName         String?
  /// موبایل خریدار (نرمال‌شده: ۰۹…)
  buyerMobile       String?
  /// نام فروشنده (اولین طرف دارای نام از sellerList)
  sellerName        String?
  /// موبایل فروشنده (نرمال‌شده: ۰۹…)
  sellerMobile      String?
  /// کل خریداران عین منبع — JSON [{fullName, mobileNumber}]
  buyerListJson     String?
  /// کل فروشندگان عین منبع — JSON [{fullName, mobileNumber}]
  sellerListJson    String?
  /// مشاوران و حق‌السهم — JSON [{name, unitPercent, confirmation, role}]
  realtorSharesJson String?
  /// عنوان ملک (property.title)
  propertyTitle     String?
  /// آدرس ملک (property.address)
  propertyAddress   String?
  /// وضعیت صورت‌وضعیت عین منبع
  status            String?
  documentDate      DateTime?
  deliveryDate      DateTime?
  businessId        String?
  comisionOfContract Float?
  taxOfContract     Float?
  /// لایه ۱ حقیقت: کل پاسخ info عین منبع (پژوهش/ممیزی آینده)
  rawInfoJson       String?
  syncedAt          DateTime @default(now())
  /// شناسهٔ دستهٔ غنی‌سازی (P6.5-14)
  extractionBatchId String?

  @@index([contractType])
  @@index([extractionBatchId])
}

/// P6.5-12 — رجیستری پرسنل سامانه PM (سامانه مدیریت پرسنلی ملک تبریز).
/// منبع: pm-api.melketabriz.ir/api/realtors/list — کلید = همان _id مشترک با ARM
/// (شاهد پروب زندهٔ ۱۴۰۵/۰۷/۰۱: تطبیق ۳۰/۳۰ = ۱۰۰٪ میان PM و ARM).
/// این جدول «لایهٔ خام مقدس» است — داده عین منبع؛ حذف/تغییر ممنوع (بند الف P6.5-11).
model PmPersonnelRecord {
  /// شناسهٔ مشترک با ExpertRecord.id (همان _id کاربر در هر دو سامانه)
  id            String   @id
  /// کد پرسنلی (منبع حقیقت — عین فیلد code سامانه PM)
  code          String?
  fullName      String?
  mobileNumber  String?
  /// نقش پرسنلی — JSON [{title,_id}] یا رشته
  roleJson      String?
  roleTitle     String?
  /// P6546/گامچهارم — تاریخ استخدام (از realtors/info/personnelInfo سامانه PM)
  hireDate      String?
  /// P6546/گامچهارم — عنوان شغلی/سمت پرسنلی (از personnelInfo)
  jobTitle      String?
  /// P6546/گامچهارم — شماره قرارداد/شماره پرسنلی سامانه PM (از personnelInfo)
  contractNo    String?
  /// P6547/گام‌های ۱و۳و۴ — شعبهٔ پرسنل از سامانه PM (branchId.title از personnelInfo — کشف زندهٔ ۱۴۰۵/۰۷/۱۲)
  /// شاهد کشف: سراج میزانی → ملکی تبریزی · توحید میزانی → باغلارباغی (چهار شعبهٔ رسمی ملک تبریز)
  branchTitle   String?
  /// شناسهٔ شعبه در سامانه PM (branchId._id)
  branchCode    String?
  /// P6547/گام چهارم — نوع همکاری پرسنلی (employeementInfo.typeFa از personnelInfo: «حق السهم (درصد)» / «حقوق ماهیانه»)
  employmentType String?
  /// P6547/گام چهارم — درصد سهام پرسنل (employeementInfo.shareHolderPercentage از personnelInfo)
  sharePercent   Float?
  /// P6547/گام چهارم — شماره داخلی تلفن سازمانی (voipInfo.extentionNumber از realtors/list)
  voipExtension  String?
  /// P6549 — آدرس پرسنل از سامانهٔ PM (realtors/info/contactInfo → contactInfo.address — کشف زندهٔ ۱۴۰۵/۰۷/۱۲)
  address        String?
  /// وضعیت فعال‌سازی پلتفرم‌ها — JSON {ps,acc,apm,chat}
  activationStatusJson String?
  /// کسب‌وکار — JSON {title,code}
  businessJson  String?
  businessTitle String?
  /// مسیر تصویر پروفایل روی CDN (cdn.obizim.ir)
  imageCover    String?
  /// کل ردیف خام عین منبع (قانون دادهٔ مقدس)
  rawJson       String?
  syncedAt      DateTime @default(now())
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([code])
  @@index([fullName])
}

/// P6.5-12 — رجیستری کارگزاری‌های صادره (special-properties سامانه ARM).
/// هر «کارگزاری» = قرارداد نمایندگی میان مشاور و مالک برای یک ملک؛
/// فایل PDF آن در خود سامانه ARM هم «تولیدی از همین داده» است (چاپ کارگزاری صادر شده).
model SpecialPropertyRecord {
  id              String   @id
  /// مشاورِ کارگزاری — JSON {id, fullName}
  realtorId       String?
  realtorName     String?
  /// ثبت‌کننده — JSON {id, fullName}
  creatorId       String?
  creatorName     String?
  /// درصد حق‌الزحمه توافق‌شده
  payPercent      Float?
  /// قیمت توافقی مبنای درصد
  sellPrice       Float?
  /// بندهای کارگزاری — HTML عین منبع
  detailsJson     String?
  /// ملک مرتبط — شناسه ARM (از special-properties/info)
  propertyId      String?
  propertyCode    String?
  /// کل ردیف خام info عین منبع (قانون دادهٔ مقدس)
  rawJson         String?
  syncedAt        DateTime @default(now())
  createdAt       DateTime?
  updatedAt       DateTime @updatedAt

  @@index([propertyId])
  @@index([realtorId])
  @@index([propertyCode])
}


// ===================== لایه ایجنت هوشمند (فقط افزودنی / Append-only) =====================

/// رکورد درخواست ملک — عین ساختار ۴ گامی فرم ثبت درخواست سامانه ARM (new-request-page)
/// گام‌ها: ۱. اطلاعات مشتری ۲. اطلاعات مکانی درخواست ۳. جزییات درخواست ۴. اطلاعات تکمیلی درخواست
model RequestRecord {
  id        String   @id @default(cuid())
  /// manual — ثبت دستی (مالک حضوری) | auto — ثبت اتوماتیک (فرم پرشونده ← ثبت مستقیم در آرم)
  source    String   @default("manual")

  // ---------- گام ۱: اطلاعات مشتری (عین owner-info-step سامانه) ----------
  /// نام و نام خانوادگی درخواست‌دهنده (مشتری)
  customerName    String?
  /// شماره موبایل مشتری (۱۱ رقم با ۰۹ — عین فرم آرم)
  customerMobile  String?
  /// شناسه کاربر آرم (پس از جستجو/ایجاد در فرآیند ثبت در سامانه)
  armCustomerId   String?

  // ---------- گام ۲: اطلاعات مکانی درخواست ----------
  /// کشور/استان/شهر — پیش‌فرض ایران/آذربایجان شرقی/تبریز (عین خود سامانه)
  countryId    String?
  stateId      String?
  cityId       String?
  /// مناطق منتخب — JSON آرایه شناسه‌های منطقه آرم
  areaIdsJson    String?
  areaNamesJson  String?
  /// محله‌های منتخب — JSON آرایه شناسه‌های محله آرم
  lineIdsJson    String?
  lineNamesJson  String?

  // ---------- گام ۳: جزییات درخواست ----------
  /// نوع معامله (برچسب درخواستی: خرید/پیش خرید/رهن و اجاره — nameRequest خود سامانه)
  tradeTypeId      String?
  tradeTypeName    String?
  /// نوع کاربری
  buildingTypeId      String?
  buildingTypeName    String?
  /// نوع ملک
  propertyTypeId      String?
  propertyTypeName    String?
  /// فرم پویای دسته‌بندی — JSON {createName: value} (متراژ از/تا، قیمت کل از/تا، امکانات…)
  inputsJson       String?
  /// P6530/گام ۲ — بازهٔ قیمت متقاضی (تومان) از جزئیات ARM (ستون فهرست M2)
  priceFrom        Float?
  /// P6530/گام ۲ — سقف قیمت متقاضی (تومان) از جزئیات ARM (ستون فهرست M2)
  priceTo          Float?
  /// توضیحات مشتری (عین خود سامانه)
  customerDescription  String?

  // ---------- گام ۴: اطلاعات تکمیلی درخواست ----------
  /// نحوه پرداخت مشتری (پول مشتری — user-payment-methods خود سامانه)
  userPaymentMethod      String?
  userPaymentMethodName  String?
  /// جدیت مشتری (user-seriousness خود سامانه)
  userSeriousity      String?
  userSeriousityName  String?
  /// P6547/گام دوم — فوریت درخواست (urgent خود ردیف فهرست ARM)
  urgent              Boolean?
  /// P6547/گام دوم — درخواست لوکس (luxury خود ردیف فهرست ARM)
  luxury              Boolean?
  /// P6547/گام دوم — قابل معاوضه (changeable خود ردیف فهرست ARM)
  changeable          Boolean?
  /// توضیحات مشاور
  realtorDescription  String?

  /// چرخه عمر: draft (در تکمیل) | ready (کامل)
  status      String   @default("draft")

  /// نتیجه ثبت در سامانه ARM — JSON {steps:[{key,title,status,detail}], at}
  armRegistrationJson    String?
  armRegisteredAt        DateTime?
  /// شناسه درخواست ثبت‌شده در آرم
  armRequestId           String?

  /// کد پرسنلی ثبت‌کننده
  actorCode   String
  /// P6.5-10 — نام و نام خانوادگی کارشناس ثبت‌کننده عین سامانه ARM
  /// (relatedRealtor ردیف درخواست — برای کاشی «درخواست‌های ملک تبریز»؛ افزودنی)
  actorName   String?
  /// P6.5-10 — عنوان درخواست عین سامانه ARM (مثل «خرید زمین یا ملک کلنگی...»)؛ افزودنی
  title       String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  /// رویدادهای درخواست (ثبت رویداد — عین request-events سامانه)
  events  RequestEventRecord[]

  /// P6.5-02 (§۵.۳) — شعبه انتساب Scope
  branchId  String?
  /// P6.5-02 (§۱۴ مصوبه شورا) — آماده‌سازی چند-مستأجری — nullable + default، بدون منطق فعال
  tenantId  String? @default("melk-tabriz")
  /// P6.5-03 (§۱.۲) — کد درخواست ARM — کلید طبیعی رکوردهای Bulk (source='arm')
  requestCode  String?  @unique
  /// P6.5-03 — شناسه آخرین اجرای Bulk که این رکورد را نوشت (محافظت از جاروی sync — §۱.۹)
  sourceRunId  String?
  /// B.3 (P6.5-04-v2) — لایه ۱ حقیقت: نام/موبایل مشتری خام عین منبع
  rawCustomerName       String?
  rawCustomerMobile     String?
  /// P6.5-04-e-v2 — ستون‌های سه‌لایه حقیقت (provenance؛ ARM فعلاً نسخه منتشر نمی‌کند)
  rawSourceVersion     String?
  extractedAt          DateTime?
  extractionBatchId    String?
  normalizationVersion String?

  @@index([status])
  @@index([source])
  @@index([customerMobile])
  @@index([createdAt])
  @@index([armRegisteredAt])
}

/// رویداد درخواست — «ثبت رویداد» عین خود سامانه (request-events/create):
/// نوع رویداد + تاریخ + ساعت + آگهی مرتبط (کدآگهی) + پیام
model RequestEventRecord {
  id          String   @id @default(cuid())
  requestId   String
  request     RequestRecord @relation(fields: [requestId], references: [id], onDelete: Cascade)

  /// نوع رویداد — شناسه و نام (از request-event-types خود سامانه)
  eventTypeId   String
  eventTypeName String
  /// پرچم‌های نوع رویداد — JSON {needTime,needHour,needMessage,needProperty}
  eventTypeFlagsJson  String?

  /// تاریخ رویداد (تاریخ شمسی به‌صورت رشته YYYY/MM/DD)
  date    String?
  /// ساعت رویداد (HH:mm)
  hour    String?
  /// آگهی مرتبط — کدآگهی واردشده و شناسه آرم کشفشده
  propertyCode  String?
  armPropertyId String?
  /// پیام (اختیاری)
  message   String?

  /// نتیجه ثبت در سامانه ARM — JSON
  armSyncJson  String?
  armSyncedAt  DateTime?
  /// شناسه رویداد ثبت‌شده در آرم
  armEventId   String?

  actorCode   String
  createdAt   DateTime @default(now())

  @@index([requestId])
  @@index([createdAt])
  @@index([eventTypeId])
}

/// حافظه ساخت‌یافته هر کاشی — هرگز Overwrite نمی‌شود
model AgentMemory {
  id            String   @id @default(cuid())
  tileId        String
  kind          String // INTERACTION | INSIGHT_RENDER | POLICY_CHANGE
  payload       String // JSON
  createdAt     DateTime @default(now())

  @@index([tileId, createdAt])
}

/// بازخورد کاربر روی بینش‌های هر کاشی — فقط افزودنی
model AgentFeedback {
  id         String   @id @default(cuid())
  tileId     String
  insightKey String
  insightTitle String
  rating     Int // +1 مفید | -1 غیرمفید
  comment    String?
  context    String // JSON snapshot
  createdAt  DateTime @default(now())

  @@index([tileId, createdAt])
}

/// نسخه‌های سیاست ایجنت — نسخه قبلی هرگز حذف نمی‌شود (قابلیت Rollback)
model AgentPolicyVersion {
  id          String   @id @default(cuid())
  tileId      String
  version     Int
  content     String // JSON سیاست فعال
  rationale   String // دلیل این نسخه
  active      Boolean  @default(false)
  createdAt   DateTime @default(now())
  activatedAt DateTime?

  // ---------- P2-06: متادیتای نسخه سیاست (فقط افزودنی — استفاده در PHASE 6/9) ----------
  // اصل: ستون‌های active قدیمی حذف نمی‌شوند — «دو‌راهه» تا PHASE 9.
  // در PHASE 2 فقط ساخته/برگشت داده می‌شوند؛ منطق یادگیری صفر تغییر.
  /// نسخه مدل یادگیری که این سیاست را ساخته (مثل "feedback-weighted-v1")
  modelVersion       String?
  /// نسخه مجموعه ویژگی‌های ورودی (مثل "tf-cosine-v1")
  featureVersion     String?
  /// پنجره داده آموزش (ISO 8601 duration، مثل "P90D")
  trainingWindow     String?
  /// پنجره داده ارزیابی (ISO 8601 duration)
  evaluationWindow   String?
  /// سنجه‌های ارزیابی این نسخه (JSON — precision/recall/…)
  metricsJson        String?
  /// کد پرسنلی سازنده
  createdBy           String?
  /// کد پرسنلی تأییدکننده (گردش کار PHASE 9)
  approvedBy          String?
  /// چرخه عمر نسخه: active | retired | draft | archived — دو‌راهه با active
  status              String?  @default("active")
  /// هدف بازگشت در صورت لغو این نسخه (نسخه‌ای که باید فعال شود)
  rollbackTarget      Int?

  @@unique([tileId, version])
}

/// P6519 — شاهد زندهٔ بیلد (دستور شورا: رفع دائمی لینک‌های کهنه، الزام app_meta)
/// جدول singleton: آخرین بیلدی که سرور با آن بوت شده را ثبت می‌کند.
/// instrumentation در هر بوت upsert می‌کند؛ صفر رابطه با سایر جداول (قانون حرمت داده — افزودنی خالص).
model AppMeta {
  /// همیشه "singleton" — تنها یک رکورد در کل جدول
  id         String   @id
  /// "<gitSha8>-<yyyymmdd>-<hhmm>" (production) یا "dev-<sha>-<stamp>" (dev)
  buildId    String?
  /// ISO 8601 — زمان build (یا بوت سرور در dev)
  builtAt    String?
  /// ۸ نویسهٔ کامیت گیت
  gitSha     String?
  /// development | production
  env        String?
  recordedAt DateTime @updatedAt
}

/// P6545/گام۱ (BLOCK 1.1) — پایدارسازی وضعیت کار پس‌زمینه در DB (جلسه ۰۳۰ سؤال ۹)
/// پیش از این، پیشرفت کارها فقط در حافظهٔ فرایند بود و با ری‌استارت گم می‌شد.
/// الگوی الزامی جلسه ۰۳۳: jobId, lastCompletedPage, resumedFrom, updatedAt.
model SyncJobState {
  /// شناسهٔ کار — مثل catalog-listings | catalog-requests | catalog-enrich-listings | main-sync
  jobId            String   @id
  /// خانوادهٔ کار: catalog | enrichment | sync
  jobKind          String
  /// idle | running | paused | done | failed
  status           String   @default("idle")
  /// آخرین صفحهٔ کامل-ذخیره‌شده (داده اول، سپس چک‌پوینت)
  lastCompletedPage Int     @default(0)
  /// نقطهٔ ازسرگیری (ادامه — هرگز شروع از صفر)
  resumedFrom      Int      @default(1)
  totalPages       Int      @default(0)
  /// ۰ تا ۱۰۰ — شفافیت UI
  progressPercent  Float    @default(0)
  /// جزئیات آخرین برش (JSON) — شفافیت کامل
  detailJson       String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@index([jobKind, status])
}

/// P6545/گام۱ (BLOCK 1.2) — سه گراف اصلی (جلسه ۰۰۷/۰۲۲/۰۳۰): گراف ملک، افراد، معاملات
/// ذخیرهٔ generic در DB — هر گراف: nodes + edges + traverse + findPath + query.
model GraphNode {
  id        String   @id @default(cuid())
  /// property | people | transaction
  graph     String
  /// property | person | expert | customer | transaction | request | area
  nodeType  String
  /// شناسهٔ طبیعی رکورد مرجع (propertyCode / personnelCode / tx id / mobile / areaId)
  refId     String
  label     String?
  /// ویژگی‌های گره — JSON (آدرس، متراژ، قیمت، نوع، مالک‌ها، آگهی‌ها، معاملات …)
  propsJson String?
  tenantId  String?  @default("melk-tabriz")
  syncedAt  DateTime @default(now())
  createdAt DateTime @default(now())

  @@unique([graph, nodeType, refId])
  @@index([graph, nodeType])
  @@index([nodeType, refId])
}

/// یال‌های سه گراف — ملک↔مالک · ملک↔آگهی · ملک↔معامله · فرد↔ملک · فرد↔معامله · فرد↔درخواست …
model GraphEdge {
  id        String   @id @default(cuid())
  graph     String
  fromType  String
  fromRef   String
  toType    String
  toRef     String
  /// owned_by | listed_by | located_in | involves_property | bought | sold | brokered_by | requested_for | matches
  edgeType  String
  weight    Float    @default(1)
  propsJson String?
  createdAt DateTime @default(now())

  @@unique([graph, fromType, fromRef, toType, toRef, edgeType])
  @@index([graph, edgeType])
  @@index([fromType, fromRef])
  @@index([toType, toRef])
}

/// P6545/گام۱ (BLOCK 1.4) — هشدار فرصت: تطبیق آگهی↔درخواست (جلسه ۰۳۰ سؤال ۱۰)
/// قید مطلق: صفر اجرای خودکار — فقط هشدار.
model OpportunityAlert {
  id          String   @id @default(cuid())
  /// listing_to_request | request_to_listing
  direction   String
  /// کدآگهی (PropertyRecord.propertyCode)
  listingCode String?
  /// شناسهٔ درخواست (RequestRecord.id)
  requestId   String?
  /// امتیاز تطبیق (۰ تا ۱) — آستانهٔ انتشار: ≥ ۰٫۷
  matchScore  Float
  /// دلایل تطبیق — JSON [{factor, value, weight}]
  matchReasons String
  /// new | seen | dismissed
  status      String   @default("new")
  emittedAt   DateTime @default(now())
  seenAt      DateTime?

  @@index([direction, status])
  @@index([listingCode])
  @@index([requestId])
}
```

## ۱۸٫۵ — DTOهای خالص لایهٔ Repository (متن کامل)

> عین `src/core/repositories/interfaces/dto.ts` (۸۳۰ خط) — آینهٔ ساختاری رکوردهای سامانه‌های واقعی؛ تنها منبع مجاز type برای ایجنت‌ها و تحلیل‌گرها:

```ts
/**
 * DTOهای مستقل لایه Repository — PHASE 2 (P2-01)
 * ------------------------------------------------------
 * قرارداد ساختاری داده بین ایجنت‌ها/روت‌ها و لایه دسترسی داده.
 *
 * اصول:
 *  ۱) صفر وابستگی به Prisma — این فایل هیچ importی از @prisma/client یا @/lib/db ندارد.
 *  ۲) آینه ساختاری دقیق ردیف‌های دیتابیس (عین ترتیب فیلدهای schema) —
 *     بنابراین خروجی JSON روت‌ها بایت‌به‌بایت با قبل یکسان می‌ماند
 *     (نگاشت Prisma→DTO در لایه پیاده‌سازی، بدون تغییر کلید/ترتیب).
 *  ۳) Dateها به‌صورت Date می‌مانند (serialization عین قبل توسط Response.json).
 */

// ===================== معاملات (گزارش تطابق) =====================

/** ردیف TransactionRecord — گزارش تطابق معاملات سامانه ARM */
export interface TransactionDTO {
  id: string;
  contractDate: Date;
  propertyCode: string;
  propertyCustomer: string | null;
  requestCode: string | null;
  requestCustomer: string | null;
  contractHolo: string | null;
  suggestedPropertyCount: number;
  eventsCount: number;
  syncedAt: Date;
  /** P6.5-02 (§۵.۳) — انتساب Scope؛ تجمیعی در ماتریس فعلی */
  ownerCode: string | null;
  branchId: string | null;
  /** P6.5-02 (§۱۴) — آماده‌سازی چند-مستأجری */
  tenantId: string | null;
  /** P6.5-03 — آخرین اجرای Bulk که رکورد را نوشت (محافظت جاروی sync) */
  sourceRunId: string | null;
}

/** ورودی جایگزینی/درج دسته‌ای معاملات (برای همگام‌سازی) */
export interface TransactionUpsertInput {
  id: string;
  contractDate: Date;
  propertyCode: string;
  propertyCustomer: string | null;
  requestCode: string | null;
  requestCustomer: string | null;
  contractHolo: string | null;
  suggestedPropertyCount: number;
  eventsCount: number;
  /** P6.5-04-e-v2 — سه‌لایه حقیقت: لایه ۱ خام + provenance (خط لوله Bulk پر می‌کند؛ مسیرهای v1 تهی می‌گذارند — merge non-null حفظ می‌کند) */
  rawDate?: string | null;
  /** B.3 (P6.5-04-v2) — لایه ۱ حقیقت: نام‌های خام طرفین عین منبع */
  rawPropertyCustomer?: string | null;
  rawRequestCustomer?: string | null;
  rawSourceVersion?: string | null;
  extractedAt?: Date | null;
  extractionBatchId?: string | null;
  normalizationVersion?: string | null;
}

// ===================== قراردادها (صورت وضعیت) =====================

/** ردیف ContractRecord — صورت وضعیت‌های سامانه ARM */
export interface ContractDTO {
  id: string;
  status: string;
  contractHolo: string | null;
  propertyCode: string | null;
  requestCode: string | null;
  contractType: string | null;
  creatorName: string | null;
  createdAt: Date | null;
  contractDate: Date | null;
  documentDate: Date | null;
  deliveryDate: Date | null;
  propertyTitle: string | null;
  propertyAddress: string | null;
  buyerListJson: string | null;
  sellerListJson: string | null;
  realtorListJson: string | null;
  canAddRealtor: boolean;
  /** P6.5-12 — مبالغ مالی قرارداد (از trade-overviews/info) */
  contractPrice: number | null;
  rawContractPrice: string | null;
  comisionOfContract: number | null;
  taxOfContract: number | null;
  /** P6.5-12 — شناسهٔ کسب‌وکار (کلید مشترک سامانه‌ها) */
  businessId: string | null;
  syncedAt: Date;
  /** P6.5-03 — آخرین اجرای Bulk که رکورد را نوشت (محافظت جاروی sync) */
  sourceRunId: string | null;
}

// ===================== کارشناسان و تعاملات =====================

/** ردیف ExpertRecord — فهرست کاربران/مشاوران سامانه ARM */
export interface ExpertDTO {
  id: string;
  personnelCode: string;
  fullName: string;
  mobile: string;
  role: string;
  businessTitle: string;
  creator: string | null;
  active: boolean;
  createdAt: Date;
  syncedAt: Date;
  /** P6.5-02 (§۵.۳/§۱۴) — انتساب Scope + آماده‌سازی چند-مستأجری */
  branchId: string | null;
  tenantId: string | null;
  /** P6.5-03 — آخرین اجرای Bulk که رکورد را نوشت */
  sourceRunId: string | null;
}

/** ردیف InteractionRecord — تعاملات مشاوران با یکدیگر */
export interface InteractionDTO {
  id: string;
  requestRealtorName: string;
  propertyRealtorName: string;
  count: number;
  syncedAt: Date;
  /** P6.5-03 — آخرین اجرای Bulk که رکورد را نوشت */
  sourceRunId: string | null;
}

// ===================== بازدیدها =====================

/** ردیف VisitRecord — بازدیدها و پیگیری‌ها */
export interface VisitDTO {
  id: string;
  propertyCode: string;
  requesterName: string;
  checkerName: string;
  propertyRealtorName: string;
  checkTime: Date | null;
  createdAt: Date;
  status: string;
  syncedAt: Date;
  /** P6.5-02 (§۵.۳) — انتساب Scope از checker؛ fail-closed روی تهی */
  ownerCode: string | null;
  branchId: string | null;
  /** P6.5-02 (§۱۴) — آماده‌سازی چند-مستأجری */
  tenantId: string | null;
  /** P6.5-03 — آخرین اجرای Bulk که رکورد را نوشت (محافظت جاروی sync) */
  sourceRunId: string | null;
}

// ===================== عرضه و تقاضا =====================

/** ردیف SupplyDemandRecord — گزارش عرضه و تقاضا */
export interface SupplyDemandDTO {
  id: string;
  rangeTitle: string;
  propertyCount: number;
  requestPercent: number;
  status: string;
  syncedAt: Date;
}

// ===================== بازار / دیوار =====================

/** ردیف DivarAd — آگهی دیوار (فایل) */
export interface DivarAdDTO {
  token: string;
  category: string;
  title: string;
  description: string | null;
  priceText: string | null;
  price: number | null;
  pricePerMeter: number | null;
  meterage: number | null;
  rooms: number | null;
  floor: number | null;
  buildYear: number | null;
  publishedAt: Date | null;
  bumpedAt: Date | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  locationText: string | null;
  latitude: number | null;
  longitude: number | null;
  matchedAreaId: string | null;
  matchedAreaName: string | null;
  matchedLineId: string | null;
  matchedLineName: string | null;
  personalScore: number;
  underpriceScore: number;
  locationScore: number;
  otherScore: number;
  totalScore: number;
  bucket: string;
  status: string;
  analysisJson: string | null;
  imagesJson: string | null;
  specsJson: string | null;
  changeKey: string | null;
  publisherType: string | null;
  publisherName: string | null;
  publisherAdCount: number | null;
  publisherBrandUrl: string | null;
}

/** پیش‌نمایش امتیاز آگهی فعال — عین select ایجنت فایل‌یابی */
export interface AdScoreProjection {
  bucket: string;
  personalScore: number;
  totalScore: number;
  underpriceScore: number;
  otherScore: number;
  locationScore: number;
  matchedLineName: string | null;
  matchedAreaName: string | null;
  category: string;
  publishedAt: Date | null;
  pricePerMeter: number | null;
  publisherType: string | null;
  publisherName: string | null;
}

/** نمونه قیمت بازار — عین select مسیر شاخص قیمت */
export interface AdPriceSampleProjection {
  token: string;
  title: string;
  category: string;
  pricePerMeter: number | null;
  matchedLineName: string | null;
  matchedAreaName: string | null;
  totalScore: number;
  publisherType: string | null;
}

/** ردیف MarketPriceStat — آمار قیمت بازار برای فیلتر زیرقیمت */
export interface MarketStatDTO {
  id: string;
  scopeKey: string;
  medianPerMeter: number;
  p25PerMeter: number;
  p75PerMeter: number;
  sampleCount: number;
  armPerMeter: number | null;
  updatedAt: Date;
}

/** ردیف DivarScanLog — گزارش اجرای اسکن دیوار */
export interface DivarScanLogDTO {
  id: string;
  startedAt: Date;
  durationMs: number;
  scanned: number;
  fetched: number;
  inWindow: number;
  outOfArea: number;
  autoRejected: number;
  newAds: number;
  updatedAds: number;
  source: string;
  error: string | null;
}

/** ردیف DivarSetting — تنظیمات ایجنت فایل‌یابی (singleton) */
export interface DivarSettingDTO {
  id: string;
  dataJson: string;
  locFilterInit: boolean;
  updatedAt: Date;
}

/** ردیف RefListCache — کش فهرست‌های مرجع عمومی سامانه ARM */
export interface RefListCacheDTO {
  key: string;
  dataJson: string;
  fetchedAt: Date;
}

/** شمارنده دسته‌بندی آگهی‌ها (خروجی groupBy فایل‌یابی) */
export interface BucketCount {
  hunt: number;
  follow: number;
  review: number;
}

// ===================== درخواست‌ها (مدیریت مشتریان) =====================

/** ردیف RequestRecord — فرم ۴ گامی ثبت درخواست سامانه ARM */
export interface RequestRecordDTO {
  id: string;
  source: string;
  customerName: string | null;
  customerMobile: string | null;
  armCustomerId: string | null;
  countryId: string | null;
  stateId: string | null;
  cityId: string | null;
  areaIdsJson: string | null;
  areaNamesJson: string | null;
  lineIdsJson: string | null;
  lineNamesJson: string | null;
  tradeTypeId: string | null;
  tradeTypeName: string | null;
  buildingTypeId: string | null;
  buildingTypeName: string | null;
  propertyTypeId: string | null;
  propertyTypeName: string | null;
  inputsJson: string | null;
  customerDescription: string | null;
  userPaymentMethod: string | null;
  userPaymentMethodName: string | null;
  userSeriousity: string | null;
  userSeriousityName: string | null;
  realtorDescription: string | null;
  status: string;
  armRegistrationJson: string | null;
  armRegisteredAt: Date | null;
  armRequestId: string | null;
  actorCode: string;
  createdAt: Date;
  updatedAt: Date;
  /** P6.5-02 (§۵.۳/§۱۴) — انتساب Scope + آماده‌سازی چند-مستأجری */
  branchId: string | null;
  tenantId: string | null;
  /** P6.5-03 (§۱.۲) — کد درخواست ARM — کلید طبیعی رکوردهای Bulk (source='arm') */
  requestCode: string | null;
  /** P6.5-03 — آخرین اجرای Bulk که رکورد را نوشت (محافظت جاروی sync) */
  sourceRunId: string | null;
}

/** ردیف RequestEventRecord — رویدادهای درخواست */
export interface RequestEventDTO {
  id: string;
  requestId: string;
  eventTypeId: string;
  eventTypeName: string;
  eventTypeFlagsJson: string | null;
  date: string | null;
  hour: string | null;
  propertyCode: string | null;
  armPropertyId: string | null;
  message: string | null;
  armSyncJson: string | null;
  armSyncedAt: Date | null;
  armEventId: string | null;
  actorCode: string;
  createdAt: Date;
}

/** درخواست به‌همراه رویدادهایش (عین include: { events }) */
export interface RequestRecordWithEventsDTO extends RequestRecordDTO {
  events: RequestEventDTO[];
}

// ===================== کاشی آگهی =====================

/** ردیف ListingRecord — فایل آگهی (فرم ۵ گامی) */
export interface ListingDTO {
  id: string;
  source: string;
  divarToken: string | null;
  customerName: string | null;
  customerMobile: string | null;
  armCustomerId: string | null;
  areaId: string | null;
  areaName: string | null;
  lineId: string | null;
  lineName: string | null;
  postalCode: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  tradeTypeId: string | null;
  tradeTypeName: string | null;
  propertyTypeId: string | null;
  propertyTypeName: string | null;
  buildingTypeId: string | null;
  buildingTypeName: string | null;
  changeWithJson: string | null;
  inputsJson: string | null;
  imagesJson: string | null;
  videosJson: string | null;
  documentsJson: string | null;
  priceEvaluation: string | null;
  desirabilityLevel: string | null;
  fileFinding: string | null;
  fileTypeJson: string | null;
  userSeriousness: string | null;
  sellReason: string | null;
  description: string | null;
  isLuxury: boolean;
  isVacation: boolean;
  isUrgent: boolean;
  notifyBySms: boolean;
  status: string;
  crmTransferJson: string | null;
  crmTransferredAt: Date | null;
  armPropertyId: string | null;
  instagramPostJson: string | null;
  instagramPublishedAt: Date | null;
  instagramMediaId: string | null;
  actorCode: string;
  createdAt: Date;
  updatedAt: Date;
  /** P6.5-02 (§۵.۳/§۱۴) — انتساب Scope + آماده‌سازی چند-مستأجری */
  branchId: string | null;
  tenantId: string | null;
}

/** ردیف InstagramPostLog — گزارش محتوای اینستاگرام */
export interface InstagramPostLogDTO {
  id: string;
  listingId: string;
  kind: string;
  caption: string;
  mediaJson: string;
  status: string;
  resultJson: string | null;
  publishedAt: Date | null;
  actorCode: string;
  createdAt: Date;
}

/** ردیف InstagramConnection — اتصال حساب اینستاگرام کسب‌وکار */
export interface InstagramConnectionDTO {
  id: string;
  status: string;
  igUserId: string | null;
  username: string | null;
  displayName: string | null;
  tokenEnc: string | null;
  lastCheckedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ===================== لایه ایجنت — حافظه/بازخورد/سیاست =====================

/** ردیف AgentMemory — حافظه ساخت‌یافته هر کاشی (فقط افزودنی) */
export interface AgentMemoryDTO {
  id: string;
  tileId: string;
  kind: string;
  payload: string;
  createdAt: Date;
}

/** ردیف AgentFeedback — بازخورد کاربر روی بینش‌ها (فقط افزودنی) */
export interface AgentFeedbackDTO {
  id: string;
  tileId: string;
  insightKey: string;
  insightTitle: string;
  rating: number;
  comment: string | null;
  context: string;
  createdAt: Date;
}

/** ورودی ثبت بازخورد */
export interface AgentFeedbackInput {
  tileId: string;
  insightKey: string;
  insightTitle: string;
  rating: 1 | -1;
  comment: string | null;
  context: string;
}

/** ردیف AgentPolicyVersion — نسخه سیاست ایجنت (قابلیت Rollback) */
export interface AgentPolicyVersionDTO {
  id: string;
  tileId: string;
  version: number;
  content: string;
  rationale: string;
  active: boolean;
  createdAt: Date;
  activatedAt: Date | null;
}

/** ورودی ایجاد نسخه سیاست جدید */
export interface PolicyVersionInput {
  tileId: string;
  version: number;
  content: string;
  rationale: string;
  active: boolean;
  activatedAt: Date | null;
}

// ===================== شاخص قیمت — تاریخچه (منبع پیش‌بینی) =====================

/** ردیف PriceIndexHistory — تاریخچه شاخص قیمت هر منطقه (فقط افزودنی) */
export interface PriceIndexHistoryDTO {
  id: string;
  areaName: string;
  category: string;
  medianPerMeter: number;
  p25PerMeter: number;
  p75PerMeter: number;
  minPerMeter: number;
  maxPerMeter: number;
  sampleCount: number;
  recordedAt: Date;
}

/** ورودی ثبت تاریخچه شاخص */
export interface PriceHistoryInput {
  areaName: string;
  category: string;
  medianPerMeter: number;
  p25PerMeter: number;
  p75PerMeter: number;
  minPerMeter: number;
  maxPerMeter: number;
  sampleCount: number;
}

// ===================== گزارش‌های نتیجه اقدام (Outcome) =====================

/** ردیف LookupLog — استعلام زنده استخراج اطلاعات (فقط افزودنی) */
export interface LookupLogDTO {
  id: string;
  kind: string;
  code: string;
  found: boolean;
  personName: string | null;
  personMobile: string | null;
  address: string | null;
  actorCode: string;
  errorNote: string | null;
  createdAt: Date;
}

/** ورودی ثبت استعلام */
export interface LookupLogInput {
  kind: string;
  code: string;
  found: boolean;
  personName: string | null;
  personMobile: string | null;
  address: string | null;
  actorCode: string;
  errorNote: string | null;
}

/** ردیف DivarRejectLog — سیگنال یادگیری از رد آگهی (فقط افزودنی) */
export interface DivarRejectLogDTO {
  id: string;
  token: string;
  reasons: string;
  note: string | null;
  scoreSnapshotJson: string | null;
  featureSnapshotJson: string | null;
  actorCode: string;
  createdAt: Date;
}

/** ورودی ثبت سیگنال رد */
export interface DivarRejectInput {
  token: string;
  reasons: string;
  note: string | null;
  scoreSnapshotJson: string | null;
  featureSnapshotJson: string | null;
  actorCode: string;
}

/** ردیف CommissionCalcLog — گزارش محاسبات کمیسیون (فقط افزودنی) */
export interface CommissionCalcLogDTO {
  id: string;
  contractType: string;
  inputsJson: string;
  resultJson: string;
  dealValue: number;
  vatPercent: number;
  actorCode: string;
  createdAt: Date;
}

/** ورودی ثبت محاسبه کمیسیون */
export interface CommissionCalcInput {
  contractType: string;
  inputsJson: string;
  resultJson: string;
  dealValue: number;
  vatPercent: number;
  actorCode: string;
}

// ===================== اتصال PM =====================

/** ردیف PmConnection — اتصال حساب شخصی سامانه پرسنلی */
export interface PmConnectionDTO {
  id: string;
  status: string;
  personnelCode: string | null;
  displayName: string | null;
  tokenEnc: string | null;
  refreshTokenEnc: string | null;
  lastCheckedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** ورودی upsert اتصال PM */
export interface PmConnectionUpsertInput {
  status: string;
  personnelCode: string | null;
  displayName?: string | null;
  tokenEnc?: string | null;
  refreshTokenEnc?: string | null;
  lastCheckedAt?: Date | null;
  lastError?: string | null;
}

// ===================== P6546/گام صفر — اتصال سامانه GAP (گفت‌وگوی آنلاین ملک تبریز) =====================

/** رکورد GapConnection — عین ساختار PmConnection */
export interface GapConnectionDTO {
  id: string;
  status: string;
  personnelCode: string | null;
  displayName: string | null;
  tokenEnc: string | null;
  refreshTokenEnc: string | null;
  lastCheckedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** ورودی upsert اتصال GAP */
export interface GapConnectionUpsertInput {
  status: string;
  personnelCode: string | null;
  displayName?: string | null;
  tokenEnc?: string | null;
  refreshTokenEnc?: string | null;
  lastCheckedAt?: Date | null;
  lastError?: string | null;
}

// ===================== P6.5-11 (بند ث) — صندوقچهٔ اتصال ماندگار ARM =====================

/** رکورد ArmConnection — توکن ARM ماندگار فراتر از چرخهٔ عمر نشست */
export interface ArmConnectionDTO {
  id: string;
  /** کلید بازیابی: کد پرسنلی SAM یا «master» برای ورود با کد مستر */
  ownerKey: string;
  personnelCode: string | null;
  displayName: string | null;
  userType: string | null;
  tokenEnc: string | null;
  refreshTokenEnc: string | null;
  status: string;
  lastRefreshedAt: Date | null;
  lastRestoredAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** ورودی upsert صندوقچهٔ ARM (ownerKey کلید است) */
export interface ArmConnectionUpsertInput {
  ownerKey: string;
  personnelCode?: string | null;
  displayName?: string | null;
  userType?: string | null;
  tokenEnc?: string | null;
  refreshTokenEnc?: string | null;
  status?: string;
  lastRefreshedAt?: Date | null;
  lastRestoredAt?: Date | null;
  lastError?: string | null;
}

// ===================== P6.5-11 (بند ب) — نقطهٔ ازسرگیری همگام‌سازی =====================

/** رکورد SyncCheckpoint — «ادامه از جاییکه قطع شد» */
export interface SyncCheckpointDTO {
  id: string;
  cycleId: string;
  pageSize: number;
  lastCompletedPage: number;
  totalPages: number;
  totalAtSource: number;
  phase: string;
  completedAt: Date | null;
  updatedAt: Date;
  createdAt: Date;
}

/** ورودی upsert نقطهٔ ازسرگیری */
export interface SyncCheckpointUpsertInput {
  id: string;
  cycleId?: string;
  pageSize?: number;
  lastCompletedPage?: number;
  totalPages?: number;
  totalAtSource?: number;
  phase?: string;
  completedAt?: Date | null;
}

// ===================== رجیستری‌های P6.5 (Data Readiness) =====================

/** ردیف PropertyRecord — کش آگهی‌های ARM (تاریخی + جاری)؛ قیمت = ریال (§۳.۵) */
export interface PropertyRecordDTO {
  id: string;
  propertyCode: string;
  title: string | null;
  status: string | null;
  ownerCode: string | null;
  ownerName: string | null;
  branchId: string | null;
  cityId: string | null;
  areaId: string | null;
  areaName: string | null;
  lineId: string | null;
  lineName: string | null;
  address: string | null;
  propertyTypeId: string | null;
  propertyTypeName: string | null;
  tradeTypeId: string | null;
  tradeTypeName: string | null;
  price: number | null;
  pricePerMeter: number | null;
  meterage: number | null;
  rooms: number | null;
  floor: number | null;
  buildYear: number | null;
  description: string | null;
  detailsJson: string | null;
  ownerMobile: string | null;
  tenantId: string | null;
  sourceRunId: string | null;
  syncedAt: Date;
  createdAt: Date | null;
  updatedAt: Date;
}

/** ردیف CustomerRecord — رجیستری مشتریان مشتق (خریدار/فروشنده/درخواست‌دهنده/مالک) */
export interface CustomerRecordDTO {
  id: string;
  mobile: string | null;
  personnelCode: string | null;
  fullName: string;
  rolesJson: string | null;
  sourceCountsJson: string | null;
  ownerCode: string | null;
  branchId: string | null;
  firstSeenAt: Date | null;
  lastSeenAt: Date | null;
  tenantId: string | null;
  sourceRunId: string | null;
  updatedAt: Date;
}

// ===================== درخواست‌های ملک (P2-03) =====================

/** ردیف RequestRecord — فرم ۵ گامی درخواست ملک */
export interface RequestRecordDTO {
  id: string;
  source: string;
  customerName: string | null;
  customerMobile: string | null;
  armCustomerId: string | null;
  countryId: string | null;
  stateId: string | null;
  cityId: string | null;
  areaIdsJson: string | null;
  areaNamesJson: string | null;
  lineIdsJson: string | null;
  lineNamesJson: string | null;
  tradeTypeId: string | null;
  tradeTypeName: string | null;
  buildingTypeId: string | null;
  buildingTypeName: string | null;
  propertyTypeId: string | null;
  propertyTypeName: string | null;
  inputsJson: string | null;
  customerDescription: string | null;
  userPaymentMethod: string | null;
  userPaymentMethodName: string | null;
  userSeriousity: string | null;
  userSeriousityName: string | null;
  realtorDescription: string | null;
  status: string;
  armRegistrationJson: string | null;
  armRegisteredAt: Date | null;
  armRequestId: string | null;
  actorCode: string;
  createdAt: Date;
  updatedAt: Date;
  /** P6.5-02 (§۵.۳/§۱۴) — انتساب Scope + آماده‌سازی چند-مستأجری */
  branchId: string | null;
  tenantId: string | null;
  /** P6.5-03 (§۱.۲) — کد درخواست ARM — کلید طبیعی رکوردهای Bulk (source='arm') */
  requestCode: string | null;
  /** P6.5-03 — آخرین اجرای Bulk که رکورد را نوشت (محافظت جاروی sync) */
  sourceRunId: string | null;
}

/** ردیف RequestEventRecord — رویداد درخواست (عین request-events سامانه) */
export interface RequestEventDTO {
  id: string;
  requestId: string;
  eventTypeId: string;
  eventTypeName: string;
  eventTypeFlagsJson: string | null;
  date: string | null;
  hour: string | null;
  propertyCode: string | null;
  armPropertyId: string | null;
  message: string | null;
  armSyncJson: string | null;
  armSyncedAt: Date | null;
  armEventId: string | null;
  actorCode: string;
  createdAt: Date;
}

/** رکورد درخواست با رویدادهای نزولی (عین include قدیم روت events) */
export type RequestWithEventsDTO = RequestRecordDTO & { events: RequestEventDTO[] };

/** به‌روزرسانی نتیجه همگام‌سازی آرم روی رویداد (مسیر POST events) */
export interface RequestEventArmSyncInput {
  armEventId: string | null;
  armSyncedAt: Date | null;
  armPropertyId: string | null;
  armSyncJson: string;
}
```

---

# فصل ۱۹ — سیستم همگام‌سازی (Sync System)

> **مرجع کد:** `src/lib/melk-api/**` (۳۲ فایل) — تنها لایهٔ اتصال به سامانه‌های ملک تبریز.

## ۱۹٫۱ — پنج سامانهٔ متصل

| سامانه | نقش | پایهٔ API | احراز هویت |
|---|---|---|---|
| **ARM** (آرم) | مدیریت آگهی و درخواست | `https://arus-api.melketabriz.ir/api/apm/` (+ `/api/public/`) | OTP کد پرسنلی → توکن |
| **PM** (پرسنلی) | رجیستری پرسنل/شعبه/تماس | `https://pm-api.melketabriz.ir/api/` | OTP هم‌خانواده |
| **ACC** (مالی) | تعرفه/محاسبهٔ کمیسیون | `https://fm-api.melketabriz.ir/` | توکن ARM پذیرفته می‌شود |
| **GAP** (گفت‌وگو) | پیام‌رسان سازمانی | `https://gap-api.melketabriz.ir/api/` | OTP هم‌خانواده |
| **melkPublic** (عمومی) | آگهی‌های منتشرشدهٔ عمومی | `arus-api…/api/apu/` | بدون توکن |

پوشهٔ پاسخ همه: پاکت NestJS `{ statusCode, status, data, message }`.

## ۱۹٫۲ — رجیستری کامل Endpoint ها

> عین `src/lib/melk-api/endpoints.ts` — «کشف‌شده از باندل رسمی سامانه‌ها + تست زندهٔ HTTP» (سربرگ فایل). این فایل تنها نقطهٔ تغییر در صورت تغییر API سامانه‌هاست.

```ts
/**
 * ثبت نقاط اتصال (Endpoint Registry) واقعی سامانه‌های ملک تبریز
 * ------------------------------------------------------
 * ✅ این مقادیر «کشف‌شده از خود سامانه‌های واقعی» هستند (تحلیل باندل
 *    arm.melketabriz.ir و pm.melketabriz.ir + تست زنده‌ی HTTP).
 *
 * سامانه ARM (سامانه مدیریت آگهی و درخواست — ملک تبریز):
 *   API اصلی:    https://arus-api.melketabriz.ir/api/apm/
 *   API عمومی:   https://arus-api.melketabriz.ir/api/public/
 *   احراز هویت:  GET  authentication/otp/{code}      ← ارسال پیامک
 *                POST authentication/otp/login       ← {code, otpCode}
 *                POST authentication/refresh-token   ← {refreshToken}
 *   داده‌ها:     realtor-reports/traded-count-total  ← گزارش معاملات
 *                realtor-reports/traded-count        ← شمارش معاملات
 *                realtor-reports/realtor-interactions
 *                realtors/list                       ← کارشناسان
 *
 * سامانه PM (سامانه مدیریت پرسنلی — ملک تبریز):
 *   API:         https://pm-api.melketabriz.ir/api/
 *   احراز هویت:  GET  authentication/otp/{code}
 *                POST authentication/otp/login       ← {code, otpCode}
 *                POST authentication/refreshToken
 *   داده‌ها:     public/portalInfo
 *
 * پوشه پاسخ (NestJS Envelope): { statusCode, status, data, message }
 */

/** مسیرهای نسبی — به‌همراه پایه در client ترکیب می‌شوند */
export const MELK_ENDPOINTS = {
  arm: {
    /** درخواست صدور کد پیامکی برای کد پرسنلی (کد در مسیر URL) */
    requestOtp: (personnelCode: string) => `authentication/otp/${encodeURIComponent(personnelCode)}`,
    /** تأیید کد پیامکی و دریافت توکن نشست سامانه ARM */
    verifyOtp: "authentication/otp/login",
    /** تمدید توکن سامانه ARM */
    refreshToken: "authentication/refresh-token",
    /** خروج از سامانه ARM */
    logout: "authentication/logout",
    /** تنظیمات سراسری (نیازمند توکن) */
    globalSettings: "global-settings",
    /** گزارش معاملات (صفحه‌بندی + بازه تاریخ) */
    tradedTotal: "realtor-reports/traded-count-total",
    /** شمارش معاملات (خلاصه) */
    tradedCount: "realtor-reports/traded-count",
    /** گزارش تعاملات کارشناسان — B.4-استاتیک: صفحهٔ خود سامانه این مسیر را «بدون پسوند /list»
     *  صدا می‌زند (ee("realtor-reports/realtor-interactions") بدون addToURL)؛
     *  پسوند /list در تحلیل باندل قبلی اشتباه به این خانواده تعمیم داده شده بود — عامل 404 شب ۱ */
    realtorInteractions: "realtor-reports/realtor-interactions",
    /** فهرست کارشناسان (کارشناس املاک = realtor) */
    realtorsList: "realtors/list",
    /** شمارش اعلان‌ها */
    badgeCount: "count/badge",

    // ============ آگهی (ثبت‌شده توسط کارشناس) — کشف از باندل رسمی ============
    /** جست‌وجوی آگهی با کدآگهی — پاسخ: {_id, title, relatedRealtor, ...} */
    propertiesByCode: (code: string) => `properties/info/by-code/${encodeURIComponent(code)}`,
    /** جزئیات کامل آگهی — پاسخ: {details: [{label, value, unit}], address, ...} */
    propertyDetails: (id: string) => `properties/details/${encodeURIComponent(id)}`,
    /** اطلاعات مالک آگهی — پاسخ: ساختار کاربر (mobileNumber, extraUserInfo, ...) */
    propertyOwner: (id: string) => `properties/owner/${encodeURIComponent(id)}`,
    /** فهرست آگهی‌ها (فیلتر کد، وضعیت، صفحه‌بندی) — عین خود سامانه
     *  P6.5-10 (پروب زندهٔ ۱۴۰۵/۰۶/۲۹): مسیر بدون پسوند /list روی ARM با 404
     *  رد می‌شود — مسیر واقعی عین الگوی addToURL:"list" خود سامانه: properties/list
     *  (پاکت سطح‌بالای ARM: {list, count, totalPages, page, limit} — count=۱۱۳٬۳۶۳) */
    propertiesList: "properties/list",

    // ============ درخواست (ثبت‌شده توسط کارشناس) — کشف از باندل رسمی ============
    /** فهرست درخواست‌ها (فیلتر کد، وضعیت، صفحه‌بندی) — عین خود سامانه
     *  P6.5-10 (پروب زندهٔ ۱۴۰۵/۰۶/۲۹): مسیر واقعی requests/list (بدون پسوند 404)
     *  — رفع باگ زنجیرهٔ استخراج کددرخواست کاشی استخراج اطلاعات که تاکنون 404 می‌خورد */
    requestsList: "requests/list",
    /** جزئیات کامل درخواست */
    requestDetails: (id: string) => `requests/details/${encodeURIComponent(id)}`,
    /** اطلاعات درخواست‌دهنده (مشتری) درخواست — ساختار کاربر */
    requestApplicant: (id: string) => `requests/applicant/${encodeURIComponent(id)}`,

    // ============ بازدیدها و پیگیری‌ها ============
    /** فهرست بازدیدها (بررسی‌کننده × درخواست‌دهنده × کدآگهی — addToURL: list) */
    visitsList: "visits/list",

    // ============ قراردادها و اسناد (صورت وضعیت) — کشف از باندل رسمی ============
    /** فهرست صورت وضعیت‌ها (وضعیت × صفحه‌بندی) — عین خود سامانه (addToURL: list) */
    tradeOverviewsList: "trade-overviews/list",
    /** جزئیات کامل قرارداد: تاریخ سند/قرارداد/تحویل، خریداران، فروشندگان، حق‌السهم مشاوران */
    tradeOverviewInfo: (id: string) => `trade-overviews/info/${encodeURIComponent(id)}`,
    /** تعرفه تقسیم حق‌السهم (contribution) */
    tradeOverviewsContribution: "trade-overviews/contribution",

    // ============ باشگاه مشتریان — فهرست‌های مرجع (عمومی، بدون توکن) ============
    /** شخصیت مشتریان (اجتماعی، ایرادگیر، بله‌گو و ...) */
    userCharacters: "user-characters/list",
    /** شغل مشتریان (آزاد، اپراتور، استاد دانشگاه و ...) */
    userJobs: "user-jobs/list",
    /** نقش مشتریان (خریدار، فروشنده، خریدار و فروشنده سرمایه‌گذار و ...) */
    userRoles: "user-roles/list",
    /** جدیت مشتریان (خیلی زیاد، زیاد، متوسط، کم) */
    userSeriousness: "user-seriousness/list",

    // ============ شاخص قیمت روز مناطق (عمومی، بدون توکن) ============
    /** فهرست شاخص‌های قیمت روز (نوع معامله × کاربری × نوع ملک × شهر) */
    currentPricesList: "configs/current-prices/list",
    /** جزئیات مشخصات فنی یک شاخص */
    currentPriceDetails: (id: string) => `configs/current-prices/info/${encodeURIComponent(id)}/details`,
    /** مناطق پوشش‌داده‌شده توسط یک شاخص */
    currentPriceAreas: (id: string) => `configs/current-prices/info/${encodeURIComponent(id)}/areas`,

    // ============ کسب‌وکار و شعبه (توکن‌دار) ============
    /** اطلاعات کسب‌وکار/شعبه خود کاربر */
    ownBusiness: "businesses/info/own",

    // ============ P6.5-12 — کارگزاری‌های صادره (صورت‌وضعیتِ نمایندگی) ============
    /** فهرست کارگزاری‌ها — عین تب «لیست کارگزاری ها» صفحهٔ ویرایش آگهی خود سامانه
     *  (کشف از باندل SPA: N("special-properties",{addToURL:["list"],params:{property}})
     *  — شاهد پروب زندهٔ ۱۴۰۵/۰۷/۰۱: ۷۷ رکورد با realtor/creator/details/payPercent) */
    specialPropertiesList: "special-properties/list",
    /** جزئیات کامل کارگزاری — منبع «چاپ کارگزاری صادر شده» خود سامانه (PDF تولیدی) */
    specialPropertyInfo: (id: string) => `special-properties/info/${encodeURIComponent(id)}`,

    // ============ بازیابی کاربر با شماره موبایل ============
    /** استعلام کاربر/مشتری با شماره موبایل */
    userByMobile: (mobile: string) => `users/info/mobile-number/${encodeURIComponent(mobile)}`,
  },
  armPublic: {
    /** مقادیر شمارشی فارسی (بدون توکن) */
    enums: "statics/enums-persian",
  },
  armReports: {
    /** گزارش عرضه و تقاضا (بازه × تعداد آگهی × درصد درخواست × وضعیت) */
    supplyDemand: "realtor-reports/supply-demand",
  },
  pm: {
    /** اطلاعات پورتال (عمومی) */
    portalInfo: "public/portalInfo",
    /** درخواست صدور کد پیامکی سامانه پرسنلی */
    requestOtp: (personnelCode: string) => `authentication/otp/${encodeURIComponent(personnelCode)}`,
    /** تأیید کد و ورود به سامانه پرسنلی */
    verifyOtp: "authentication/otp/login",
    /** تمدید توکن سامانه پرسنلی */
    refreshToken: "authentication/refreshToken",
    // ============ P6.5-12 — رجیستری پرسنل (کشف از باندل SPA سامانه PM) ============
    /** فهرست پرسنل — شامل code (کد پرسنلی!) + mobileNumber + role + activationStatus
     *  (شاهد پروب زندهٔ ۱۴۰۵/۰۷/۰۱: ۱۴۲ پرسنل؛ _id همان _id مشترک با ARM — تطبیق ۱۰۰٪) */
    realtorsList: "realtors/list",
    /** اطلاعات پرسنلی کامل — استخدام/شعبه/نقش (addToURL: [id]) */
    realtorPersonnelInfo: (id: string) => `realtors/info/personnelInfo/${encodeURIComponent(id)}`,
    /** اطلاعات تماس کامل (addToURL: [id]) */
    realtorContactInfo: (id: string) => `realtors/info/contactInfo/${encodeURIComponent(id)}`,
    /** مدارک بارگذاری‌شدهٔ پرسنل — فایل‌ها روی cdn.obizim.ir (addToURL: [id]) */
    realtorUploadedDocuments: (id: string) => `realtors/info/uploadedDocuments/${encodeURIComponent(id)}`,
  },
  /** سامانه مالی (حسابداری) ملک تبریز — کشف از globalSettings.platformsBaseUrl.acc */
  acc: {
    /** پیکربندی تعرفه کمیسیون (شهر × نوع قرارداد × ورودی‌ها + نرخ‌نامه اتحادیه) — عمومی */
    commissionConfigList: "apm/commission/configList",
    /** محاسبه کمیسیون: POST {cityId}/{contractType} */
    commissionCalculate: (cityId: string, contractType: string) =>
      `apm/commission/${encodeURIComponent(cityId)}/${encodeURIComponent(contractType)}`,
    // ============ P6.5-12 — داشبورد مالی (کشف از باندل SPA سامانه fm) ============
    /** فعال‌ترین کارشناسان بر اساس شمار صورت‌وضعیت‌ها (کل کسب‌وکار — نه فقط حساب خود کاربر)
     *  پاسخ: [{tradeOverviewsCount, realtorId, realtorFullName, realtorImage}]
     *  (شاهد پروب زندهٔ ۱۴۰۵/۰۷/۰۱: توکن ARM پذیرفته می‌شود؛ نیازمند query=business) */
    bestRealtor: "dashboard/bestRealtor",
  },

  // ============ P6546/گام صفر — سامانه GAP (سامانه گفت‌وگوی آنلاین ملک تبریز) ============
  /** کشف از باندل سامانه‌های ملک تبریز (gap.melketabriz.ir ← gap-api.melketabriz.ir/api/)
   *  سرور Express زنده است؛ احراز هویت از الگوی خانوادهٔ ملک تبریز (OTP) پیاده شده و
   *  پایهٔ آدرس از طریق MELK_GAP_API_BASE قابل تنظیم است. */
  gap: {
    /** درخواست صدور کد پیامکی سامانه گفت‌وگو — الگوی خانوادهٔ ملک تبریز */
    requestOtp: (personnelCode: string) => `authentication/otp/${encodeURIComponent(personnelCode)}`,
    /** تأیید کد پیامکی و ورود به سامانه GAP */
    verifyOtp: "authentication/otp/login",
    /** تمدید توکن سامانه GAP */
    refreshToken: "authentication/refresh-token",
  },

  // ============ P6546/گام صفر — سامانه عمومی ملک تبریز (melketabriz.com) ============
  /** کشف زندهٔ P6546 (شاهد: download/p6546/systems-discovery-*.json):
   *  پایهٔ arus-api.melketabriz.ir/api/apu/ — همان سرور ARM با بخش عمومی apu که
   *  سامانهٔ عمومی melketabriz.com از آن می‌خواند. همهٔ مسیرهای زیر «بدون توکن» پاسخ می‌دهند:
   *  · properties/list        → ۲۰۰ (count=۳٬۶۷۹ آگهی منتشرشدهٔ عمومی + رکورد غنی)
   *  · properties/info/by-code/{code} → ۲۰۰ (details[] برچسب‌دار + inputs + area/line + ...)
   *  · realtors/info/by-code/{code}   → ۲۰۰/۴۰۴ (اطلاعات عمومی کارشناس) */
  melkPublic: {
    /** فهرست آگهی‌های منتشرشدهٔ عمومی (صفحه‌بندی: page, limit) — بدون توکن */
    propertiesList: "properties/list",
    /** جزئیات کامل عمومی یک آگهی با کدملک — بدون توکن
     *  پاسخ: { inputs, details[{label,value,unit}], area, line, listOfRealtors,
     *          customerDescriptionList, fileScore, rateObj, changeWith, isPublished, ... } */
    propertyInfoByCode: (code: string | number) => `properties/info/by-code/${encodeURIComponent(String(code))}`,
    /** اطلاعات عمومی کارشناس با کد پرسنلی — بدون توکن */
    realtorInfoByCode: (code: string | number) => `realtors/info/by-code/${encodeURIComponent(String(code))}`,
  },
} as const;
```

## ۱۹٫۳ — معماری همگام‌سازی

### ۱۹٫۳٫۱ — دو حالت sync
- `legacy` (پیش‌فرض فعلی): پاک‌سازی کامل + درج اتمیک (`deleteMany+createMany`) برای جداول کش ساده.
- `incremental` (P2-04): upsert بر کلید طبیعی + **نقطهٔ ازسرگیری** + **نامهٔ مرده** (`SyncDeadLetter`) برای رکوردهای شکست‌خورده. انتخاب با `MELK_SYNC_MODE`.

### ۱۹٫۳٫۲ — سیستم چک‌پوینت (Checkpoint)
- جدول `SyncCheckpoint` با کلید (source, kind) — وضعیت هر برش: صفحهٔ آخر، بازهٔ آخر، شمار fetched/totalAtSource، updatedAt.
- **منطق resumedFrom:** هر برش جدید از `lastCompletedPage + 1` شروع می‌شود؛ برشِ ناتمام (خطای وسط برش) از همان صفحه ازسرگیری می‌شود — «هیچ داده‌ای از ابتدا شروع نمی‌شود».
- پاسخ هر sync: `{ fetched, totalAtSource, remaining, checkpoint }` — UI از `remaining=0` برای «تکمیل» استفاده می‌کند.

### ۱۹٫۳٫۳ — دیمن کاتالوگ (Background Jobs)
- `src/lib/melk-api/catalog-daemon.ts` (۳۱۴ خط) — حلقهٔ درون‌فرایندی که از `instrumentation.ts` با سرور بالا می‌آید:
  - برش‌های کوچک کاتالوگ آگهی/درخواست (لایهٔ ۱ فهرست) + برش غنی‌سازی (لایهٔ ۲ owner/details/applicant) + برش پرسنل PM (personnelInfo → contactInfo → uploadedDocuments).
  - **برش «تکمیل ستون‌های ناقص»** (P6549): انتخاب rowIds هدفمند (موبایل متقاضی، آدرس و…) مستقل از pending، round-robin با `updatedAt`.
  - توکن از آخرین نشست زندهٔ دارای توکن (`ArmConnection` singleton پس از P6546) — هرگز توکن مشترک بدون مالک.
  - تاب‌آوری: خطای برش = ثبت در SyncJobState + ادامهٔ تیک بعد؛ apiSync تاب‌آور ۳تلاشی برای خطاهای گذرا.
- **الگوی double-fork یتیم‌ساز برای دیمن‌های شل:** `( setsid nohup cmd </dev/null & )` → PPID=1 → بقا بین فراخوانی‌ها (درس حادثهٔ مرگ دیمن‌ها — P6547-cont).

### ۱۹٫۳٫۴ — خط لولهٔ غنی‌سازی (Enrichment Pipeline)
1. برش فهرست (`properties/list` / `requests/list`) → رکوردهای خام + `extractionBatchId`.
2. صف غنی‌سازی بر اساس pending → فراخوانی `properties/owner` + `properties/details` (آگهی) یا `requests/applicant` + `requests/details` (درخواست) — نرخ محدود، برش‌های ~۵۰۰تایی.
3. به‌روزرسانی رکورد از طریق Repository (`smart-update.ts` — بدون بازنویسی کامل ردیف).
4. ثبت شمارنده‌های پوشش (M7) و شاهد در `SyncJobState`.
5. حلقهٔ UI (P6527): پس از هر برش فقط شمارنده‌ها وصله می‌شوند؛ بارگذاری کامل فقط پس از برش آخر.

### ۱۹٫۳٫۵ — بک‌فیل آدرس (Address Backfill)
الگوی کشف‌شده در P6549: ریشه‌یابی ساختار PM → کشف endpoint `realtors/info/contactInfo/{id}` → یک‌بارهٔ هدفمند روی کل جمعیت (۱۴۲ پرسنل) → ذخیرهٔ فیلد `address` در `PmPersonnelRecord` → ستون زندهٔ M4. همین الگو برای هر فیلد غایب آینده: (۱) کشف زندهٔ endpoint، (۲) بک‌فیل هدفمند، (۳) ستون/فیلتر/پوشش زنده، (۴) برش دیمن برای مابقی.

### ۱۹٫۳٫۶ — حلقهٔ شعبه (Branch Resolution)
`src/lib/branches.ts` — زنجیرهٔ سه‌مرحله‌ای: **PM → ARM → دستی**:
1. شعبهٔ رسمی پرسنل از PM (`businesses`).
2. اگر غایب: شعبهٔ کسب‌وکار ثبت‌کنندهٔ آگهی از ARM (`businesses/info/own`).
3. اگر غایب: نگاشت دستی نگهداری‌شده (فایل/جدول مرجع) — نمایش «-» تا زمان تکمیل.

### ۱۹٫۳٫۷ — قانون دادهٔ مقدس
۱. **بکاپ پیش از هر تغییر:** `VACUUM INTO backups/pre-*.db` (اسکریپت آماده: `scripts/p6527-vacuum-backup.ts`).
۲. **شمارش پیش/پس:** `upload/.survival/expected-counts.json` — مرجع راستی‌آزمایی بازیابی.
۳. **صفر حذف:** پاک‌سازی فقط با آرشیو (`archivedAt`)؛ حذف کاشی = حذف نما نه داده (`bootstrap.ts:20-22`).
۴. **ریست اتصال** (خطرناک‌ترین عمل): بکاپ خودکار `pre-reset-*.db` + ثبت نام فایل در AuditLog (AGENTS.md §۶).

---

## ۱۹٫۴ — متن کامل دیمن کاتالوگ (`catalog-daemon.ts`)

> عین `src/lib/melk-api/catalog-daemon.ts` (۳۱۴ خط) — قلب استمرار استخراج/درج:

```ts
/**
 * دیمن پایدارساز بروزرسانی — P6530/گام ۶ + P6546/گام پنجم-پ-۴ و گام ششم-۲
 * ---------------------------------------------------------------------------
 * «برای پایداری و استمرار استخراج اطلاعات در بخش بروزرسانی فهرست، دیمن پایداری
 * بروزرسانی را طراحی و پیاده سازی و اجرا کن» — الگوی درون‌فرایندی مغز (فاز ۹).
 *
 * هر تیک (پیش‌فرض ۳ دقیقه؛ MELK_CATALOG_DAEMON_INTERVAL_MINUTES):
 *   ۱) برش محدود کاتالوگ آگهی‌ها + درخواست‌ها (checkpointدار) + غنی‌سازی برشی
 *   ۲) P6546: برش غنی‌سازی صورت‌وضعیت‌های معاملات (tx-info — نوع/مبلغ/طرفین)
 *   ۳) P6546: برش غنی‌سازی استخدام پرسنل PM (personnelInfo — تاریخ استخدام/نقش)
 *   ۴) P6546: هر ۲۰ تیک (~ساعتی) — چرخهٔ کامل سامانهٔ عمومی (melketabriz.com/apu):
 *      یافتن کدهای ملکِ غایب از فهرست آگهی و افزودنشان + غنی‌سازی جزئیات عمومی
 *   ۵) P6546: خنک‌ساز تطبیقی — پس از ۳ شکست پیاپی سمت مبدأ، یک تیک استراحت
 *      (خطاهای گذرای 502/504 هرگز دیمن را نمی‌کشند؛ تیک بعدی از همان نقطه).
 *   · ازسرگیری از آخرین صفحهٔ کامل (checkpoint) + گارد پوشش ۹۰٪ — خوددرمانی.
 *   · هم‌پوشانی ممنوع: قفل درون‌فرایندی.
 *   · خطا: هرگز بوت/درخواست را نمی‌شکند؛ در وضعیت دیمن گزارش می‌شود.
 *
 * فعال‌سازی: پیش‌فرض روشن (MELK_CATALOG_DAEMON=disabled برای خاموشی)؛
 * شاهد وضعیت: /api/intelligence/status → daemon.catalog
 */

import type { PrismaClient } from "@prisma/client";
import { syncArmListingsCatalog, syncArmRequestsCatalog, enrichArmListings, enrichArmRequests } from "./arm-catalog";
import { sessionToArmTokens } from "@/lib/auth/session";
import { logEvent } from "@/lib/logger";
// P6545/گام۱ — افزودنی: وضعیت کار پایدار در DB (BLOCK 1.1) + رویدادهای فرصت (BLOCK 1.4)
import { JobStateService, JOB_IDS } from "./job-state";
import { emitEvent } from "@/lib/intelligence/blackboard";
// P6546/گام پنجم-پ-۴ و گام ششم-۲ — پایدارساز بروزرسانی جامع
import { enrichTransactionsInfo } from "./tx-info-enrichment";
import { getPmSyncToken, syncPmPersonnelInfo } from "./pm-acc-sync";
import { syncMelkPublicCatalog } from "./melk-public";
// P6547/گام دوم — همگام‌سازی ساعتی فهرست‌های مرجع انواع ARM (شناسه→نام)
import { syncTypeRegistries } from "./type-registry";

/** فاصلهٔ پیش‌فرض تیک‌ها — دقیقه */
const DEFAULT_INTERVAL_MINUTES = 3;
/** سقف صفحات فهرست در هر تیک (کار کوچک و سریع) */
const PAGES_PER_TICK = 2;
/** سقف ردیف غنی‌سازی هر موجودیت در هر تیک */
const ENRICH_ROWS_PER_TICK = 25;
/** P6549 — برش تکمیل ستون‌های ناقص M2 در هر تیک (غنی‌سازی هدفمند) */
const COMPLETION_ROWS_PER_TICK = 60;
/** P6546 — سقف ردیف غنی‌سازی صورت‌وضعیت معاملات در هر تیک */
const TX_INFO_ROWS_PER_TICK = 10;
/** P6546 — سقف پرسنل PM (استخدام) در هر تیک */
const PM_INFO_ROWS_PER_TICK = 5;
/** P6546 — هر چند تیک، یک چرخهٔ کامل سامانهٔ عمومی (۳ دقیقه × ۲۰ ≈ ساعتی) */
const PUBLIC_EVERY_N_TICKS = 20;
/** P6546 — خنک‌ساز تطبیقی: پس از این تعداد شکست پیاپی، یک تیک استراحت */
const CONSECUTIVE_FAIL_COOLDOWN = 3;

export interface CatalogDaemonStatus {
  enabled: boolean;
  running: boolean;
  lastTickAt: number | null;
  lastSuccessAt: number | null;
  lastError: string | null;
  ticks: number;
  /** آخرین نتیجهٔ برش‌ها (برای شفافیت UI) */
  lastResult: {
    listingsPages: number;
    requestsPages: number;
    listingsEnriched: number;
    requestsEnriched: number;
    /** P6546 — برش‌های پایدارساز */
    txInfoEnriched?: number;
    pmInfoEnriched?: number;
    melkPublicNewCodes?: number;
    /** P6547 — تعداد رجیستری‌های مرجع همگام‌شده در این تیک */
    typeRegistriesSynced?: number;
    cooldownSkip?: boolean;
  } | null;
}

interface DaemonGlobal {
  __melkCatalogDaemon?: {
    started: boolean;
    lock: boolean;
    status: CatalogDaemonStatus;
    /** P6546 — شمار شکست‌های پیاپی برای خنک‌ساز تطبیقی */
    consecutiveFails: number;
  };
}

const g = globalThis as unknown as DaemonGlobal;

function state() {
  if (!g.__melkCatalogDaemon) {
    g.__melkCatalogDaemon = {
      started: false,
      lock: false,
      status: {
        enabled: true,
        running: false,
        lastTickAt: null,
        lastSuccessAt: null,
        lastError: null,
        ticks: 0,
        lastResult: null,
      },
      consecutiveFails: 0,
    };
  }
  return g.__melkCatalogDaemon;
}

/** وضعیت فعلی دیمن (برای endpoint شفافیت) */
export function catalogDaemonStatus(): CatalogDaemonStatus {
  return { ...state().status };
}

/** تیک واحد دیمن — قابل فراخوانی مستقیم در تست */
export async function catalogDaemonTick(db: PrismaClient): Promise<CatalogDaemonStatus> {
  const s = state();
  if (s.lock) {
    // تیک قبلی هنوز کار می‌کند — رد (هم‌پوشانی ممنوع)
    return { ...s.status };
  }
  s.lock = true;
  s.status.running = true;
  s.status.lastTickAt = Date.now();
  s.status.ticks += 1;
  const result = { listingsPages: 0, requestsPages: 0, listingsEnriched: 0, requestsEnriched: 0, txInfoEnriched: 0, pmInfoEnriched: 0, melkPublicNewCodes: 0, typeRegistriesSynced: 0, cooldownSkip: false };
  // P6545/BLOCK 1.1 — وضعیت کار در DB (پایدار در برابر ری‌استارت)
  const jobs = new JobStateService(db);
  try {
    // P6546/گام پنجم-پ-۴ — خنک‌ساز تطبیقی: پس از شکست‌های پیاپی، یک تیک نفس‌کشیدن
    if (s.consecutiveFails >= CONSECUTIVE_FAIL_COOLDOWN) {
      s.consecutiveFails = 0;
      result.cooldownSkip = true;
      s.status.lastResult = result;
      s.status.lastSuccessAt = Date.now();
      logEvent({
        level: "info",
        category: "sync",
        operation: "update-stabilizer-cooldown",
        status: "ok",
        detail: { message: "خنک‌ساز تطبیقی: یک تیک استراحت پس از شکست‌های پیاپی سمت مبدأ" },
      });
      return { ...s.status };
    }
    // نشست زندهٔ دارای توکن ARM (اخیرترین)
    const live = await db.session.findFirst({
      where: { revoked: false, expiresAt: { gt: new Date() }, armTokenEnc: { not: null } },
      orderBy: { lastSeenAt: "desc" },
    });
    if (live) {
      const armTokens = sessionToArmTokens(live);
      if (armTokens?.accessToken) {
        // برش محدود فهرست آگهی‌ها + درخواست‌ها (هر دو checkpointدار — ازسرگیری خودکار)
        try {
          const lres = await syncArmListingsCatalog(armTokens.accessToken, { maxPages: PAGES_PER_TICK });
          result.listingsPages = lres.pages;
          await jobs.upsert({
            jobId: JOB_IDS.catalogListings,
            jobKind: "catalog",
            status: lres.checkpoint?.phase === "complete" ? "done" : "running",
            lastCompletedPage: lres.checkpoint?.lastCompletedPage ?? 0,
            totalPages: lres.checkpoint?.totalPages ?? 0,
            detail: { pages: lres.pages, created: lres.created, updated: lres.updated, resumedFromPage: lres.resumedFromPage, cycleId: lres.cycleId },
          });
          // P6545/BLOCK 1.4 — رویداد فرصت برای آگهی‌های تازه (صفر اجرای خودکار)
          if (lres.created > 0) await emitEvent("listing.created", { created: lres.created, pages: lres.pages, cycleId: lres.cycleId });
        } catch (e) {
          s.status.lastError = (e as { code?: string })?.code ?? "LISTINGS_SLICE_FAILED";
          s.consecutiveFails += 1;
          await jobs.upsert({ jobId: JOB_IDS.catalogListings, jobKind: "catalog", status: "failed", detail: { error: s.status.lastError } }).catch(() => {});
        }
        try {
          const rres = await syncArmRequestsCatalog(armTokens.accessToken, { maxPages: PAGES_PER_TICK });
          result.requestsPages = rres.pages;
          await jobs.upsert({
            jobId: JOB_IDS.catalogRequests,
            jobKind: "catalog",
            status: rres.checkpoint?.phase === "complete" ? "done" : "running",
            lastCompletedPage: rres.checkpoint?.lastCompletedPage ?? 0,
            totalPages: rres.checkpoint?.totalPages ?? 0,
            detail: { pages: rres.pages, created: rres.created, updated: rres.updated, resumedFromPage: rres.resumedFromPage, cycleId: rres.cycleId },
          });
          if (rres.created > 0) await emitEvent("request.created", { created: rres.created, pages: rres.pages, cycleId: rres.cycleId });
        } catch (e) {
          s.status.lastError = (e as { code?: string })?.code ?? "REQUESTS_SLICE_FAILED";
          s.consecutiveFails += 1;
          await jobs.upsert({ jobId: JOB_IDS.catalogRequests, jobKind: "catalog", status: "failed", detail: { error: s.status.lastError } }).catch(() => {});
        }
        // برش غنی‌سازی (تماس مالک/متقاضی + مناطق + قیمت + دسته‌بندی)
        try {
          const le = await enrichArmListings(armTokens.accessToken, { maxRows: ENRICH_ROWS_PER_TICK });
          result.listingsEnriched = le.enriched;
        } catch (e) {
          s.status.lastError = (e as { code?: string })?.code ?? "ENRICH_LISTINGS_FAILED";
        }
        try {
          const re = await enrichArmRequests(armTokens.accessToken, { maxRows: ENRICH_ROWS_PER_TICK });
          result.requestsEnriched = re.enriched;
        } catch (e) {
          s.status.lastError = (e as { code?: string })?.code ?? "ENRICH_REQUESTS_FAILED";
        }
        // P6549 — برش «تکمیل ستون‌های ناقص M2» (نکته ۳ استمرار): ردیف‌های غنی‌شدهٔ قبلی که
        // موبایل متقاضی / دسته‌بندی / نوع ملک / بازهٔ قیمت ندارند، هدفمند re-enrich می‌شوند
        // (rowIds از فیلتر pending عبور می‌کند — رفع ریشهٔ ۸٫۹٪ ماندن موبایل متقاضی).
        try {
          const incomplete = await db.requestRecord.findMany({
            where: {
              source: "arm",
              customerMobile: null,
              OR: [
                { tradeTypeName: null },
                { buildingTypeName: null },
                { priceFrom: null },
                { rawCustomerMobile: null },
              ],
            },
            orderBy: { updatedAt: "asc" }, // round-robin: تلاش‌شده‌ها به انتهای صف می‌روند
            take: COMPLETION_ROWS_PER_TICK,
            select: { id: true },
          });
          if (incomplete.length > 0) {
            const ce = await enrichArmRequests(armTokens.accessToken, {
              maxRows: COMPLETION_ROWS_PER_TICK,
              rowIds: incomplete.map((r) => r.id),
            });
            result.requestsEnriched += ce.enriched;
          }
        } catch {
          s.status.lastError = "M2_COMPLETION_SLICE_FAILED"; // نرم — تیک بعدی ادامه می‌دهد
        }
        // P6546/گام سوم + پ-۴ — برش غنی‌سازی صورت‌وضعیت‌های معاملات (نوع/مبلغ/طرفین)
        try {
          const tx = await enrichTransactionsInfo(armTokens.accessToken, { maxRows: TX_INFO_ROWS_PER_TICK, throttleMs: 400 });
          result.txInfoEnriched = tx.enriched;
        } catch {
          s.status.lastError = "TX_INFO_SLICE_FAILED"; // نرم — تیک بعدی ادامه می‌دهد
        }
      }
    }
    // P6546/گام چهارم — برش استخدام پرسنل PM (توکن ماندگار PM؛ مستقل از نشست)
    try {
      const pmToken = await getPmSyncToken();
      if (pmToken) {
        const pm = await syncPmPersonnelInfo(pmToken, { maxRows: PM_INFO_ROWS_PER_TICK });
        result.pmInfoEnriched = pm.enriched;
      }
    } catch {
      s.status.lastError = "PM_INFO_SLICE_FAILED"; // نرم
    }
    // P6547/گام دوم — چرخهٔ ساعتی فهرست‌های مرجع انواع ARM (tradeType/buildingType/propertyType/…)
    if (s.status.ticks % PUBLIC_EVERY_N_TICKS === 0 && live) {
      try {
        const armTokensForRegistries = sessionToArmTokens(live);
        if (armTokensForRegistries?.accessToken) {
          const reg = await syncTypeRegistries(armTokensForRegistries.accessToken);
          result.typeRegistriesSynced = reg.synced.length;
        }
      } catch {
        s.status.lastError = "TYPE_REGISTRIES_SYNC_FAILED"; // نرم — چرخهٔ بعدی
      }
    }
    // P6546/گام صفر-۱ — چرخهٔ ساعتی سامانهٔ عمومی: یافتن کدهای غایب + افزودن (بدون توکن)
    if (s.status.ticks % PUBLIC_EVERY_N_TICKS === 0) {
      try {
        const pub = await syncMelkPublicCatalog({ maxPages: 40, enrichDetails: true });
        result.melkPublicNewCodes = pub.newCodes.length;
        if (pub.newCodes.length > 0) {
          await emitEvent("listing.created", { created: pub.newCodes.length, source: "melk-public", cycleId: `apu-${Date.now()}` });
        }
      } catch {
        s.status.lastError = "MELK_PUBLIC_CYCLE_FAILED"; // نرم — چرخهٔ ساعتی بعدی
      }
    }
    s.status.lastResult = result;
    s.status.lastSuccessAt = Date.now();
    if (!s.status.lastError) s.consecutiveFails = 0;
  } catch (err) {
    s.status.lastError = (err as Error)?.message?.slice(0, 120) ?? "UNKNOWN";
    logEvent({
      level: "warn",
      category: "sync",
      operation: "catalog-daemon-tick",
      status: "fail",
      errorCode: "DAEMON_TICK_FAILED",
      detail: { error: s.status.lastError },
    });
  } finally {
    s.lock = false;
    s.status.running = false;
  }
  return { ...s.status };
}

/** راه‌اندازی دیمن — یک‌بار در عمر پروسه (از instrumentation) */
export function startCatalogDaemon(db: PrismaClient): void {
  const s = state();
  if (s.started) return;
  if (process.env.MELK_CATALOG_DAEMON === "disabled") {
    s.status.enabled = false;
    s.started = true;
    return;
  }
  s.started = true;
  const minutes = Number(process.env.MELK_CATALOG_DAEMON_INTERVAL_MINUTES ?? String(DEFAULT_INTERVAL_MINUTES));
  const intervalMs = (Number.isFinite(minutes) && minutes >= 1 ? minutes : DEFAULT_INTERVAL_MINUTES) * 60 * 1000;
  // اجرای اولیه پس از ۶۰ ثانیه (پس از آماده‌شدن کامل سرور) و سپس دوره‌ای
  setTimeout(() => void catalogDaemonTick(db), 60_000);
  setInterval(() => void catalogDaemonTick(db), intervalMs);
  logEvent({
    category: "sync",
    operation: "catalog-daemon-start",
    status: "ok",
    detail: { intervalMinutes: Number.isFinite(minutes) ? minutes : DEFAULT_INTERVAL_MINUTES, inProcess: true },
  });
}
```

---

# فصل ۲۰ — احراز هویت و امنیت

## ۲۰٫۱ — سه مسیر ورود

1. **کارشناس:** کد پرسنلی → `GET authentication/otp/{code}` (پیامک واقعی از ARM) → تأیید ۶رقمی → نشست محلی + توکن ARM رمزنگاری‌شده در نشست.
2. **مالک (کد مدیر):** `MASTER_ACCESS_CODE` (۸ رقم؛ **بدون مقدار در هیچ فایلی**) — مقایسهٔ زمان-ثابت ضد Timing Attack → نقش OWNER کامل (شامل Rollback سیاست).
3. **جلسهٔ تازه‌ساز:** نشست منقضی → refresh token خودکار (اگر توکن ARM زنده).

## ۲۰٫۲ — سازوکار نشست/توکن

- توکن نشست: **رندوم ۳۲بایتی**، در DB فقط **SHA-256 هش** (`Session.tokenHash`)، TTL پیش‌فرض ۱۲ ساعت (`SESSION_TTL_HOURS`).
- سمت کلاینت: توکن **AES-GCM رمزنگاری‌شده با کلید دستگاه در IndexedDB** (`secure-storage.ts`) — هرگز متن ساده.
- خروج خودکار کلاینت در انقضا/۴۰۱؛ ابطال سرور با `revoked/revokedReason`.

## ۲۰٫۳ — Vault (AES-256-GCM)

- `src/lib/auth/crypto.ts` — رمزنگاری/رمزگشایی AES-256-GCM با کلید `MELK_TOKEN_KEY` (۳۲بایتی hex؛ **مقدار فقط متغیر محیطی**؛ نمونه‌ساز dev: `scripts/dev-secrets.ts`).
- توکن‌های ARM/PM/GAP در `Session.armTokenEnc` و جداول `*Connection` همه رمزنگاری‌شده‌اند.
- **چرخش کلید:** `scripts/rotate-encryption-key.ts` + پرچم `ROTATION_PENDING=true` در startup (`instrumentation.ts:73-95`) — بازرمزنگاری همهٔ اسرار بدون قطعه خدمات.
- **fail-fast:** در production نبود `MASTER_ACCESS_CODE` یا `MELK_TOKEN_KEY` = عدم بوت (`assertProductionSecrets()`).

## ۲۰٫۴ — محدودسازی نرخ (Rate Limiting)

`src/lib/auth/rate-limiter.ts`:
- ۳ درخواست پیامک / ۱۰ دقیقه per کد پرسنلی.
- ۵ تلاش تأیید / ۱۵ دقیقه + قفل خودکار progressive.
- مسیر master-login با شمارندهٔ جدا و تأخیر صعودی.

## ۲۰٫۵ — ConsultantScope

`src/lib/access/scope.ts` + `src/core/repositories/tenant.ts`:
- `OWNER`: همهٔ داده‌ها · `BRANCH`: دادهٔ شعبهٔ خودش · `CONSULTANT`: دادهٔ خودش.
- فیلتر دامنه در **سطح Repository** اعمال می‌شود (نه در UI/روت) — گارد `tests/phase65-scope-audit.test.ts`.
- `branchId` نشست از PM businesses پر می‌شود (P6.5-02).

## ۲۰٫۶ — حسابرسی (AuditLog)

- دروازهٔ یگانه: `src/lib/audit.ts` — هر رخداد: `{ actorCode, action, target, detail, ip, userAgent, at }`.
- رخدادهای اجباری: ورودها، ابطال، sync ها، ریست، Rollback، چرخش کلید، بازیابی خودکار.
- **گارد ایمنی لاگ:** `scripts/audit-log-safety.sh` — هیچ لاگی نباید secret/توکن خام داشته باشد.

---

## ۲۰٫۷ — متن کامل رمزنگاری Vault (`crypto.ts`)

> عین `src/lib/auth/crypto.ts` (۱۰۶ خط):

```ts
/**
 * زیرساخت رمزنگاری احراز هویت (سمت سرور)
 * ------------------------------------------------------
 * اصول:
 * 1) توکن نشست فقط به‌صورت «هش SHA-256» ذخیره می‌شود — سرقت دیتابیس ≠ سرقت توکن.
 * 2) کد ورود مدیر (Master Code) با مقایسه زمان-ثابت بررسی می‌شود تا
 *    حملات Timing Attack ممکن نباشد.
 * 3) تولید همه مقادیر تصادفی با crypto ایمن (نه Math.random).
 * 4) توکن‌های سامانه ARM (دریافت‌شده از arus-api.melketabriz.ir) با
 *    AES-256-GCM رمزنگاری می‌شوند — کلید از متغیر محیطی MELK_TOKEN_KEY.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "crypto";

/** تولید توکن نشست با ۳۲ بایت آنتروپی */
export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

/** هش امن توکن برای ذخیره‌سازی در پایگاه داده */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** مقایسه زمان-ثابت رشته‌ها (ضد Timing Attack) */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

// ==========================================================================
// رمزنگاری توکن‌های ARM (AES-256-GCM)
// ==========================================================================

/**
 * راز رمزنگاری — HOTFIX-01 / SEC-2
 * الزام: MELK_TOKEN_KEY مستقل (نه کد مدیر، نه fallback سورس‌نشسته).
 * اگر تعریف نشده باشد null برمی‌گرداند تا فراخواننده fail-fast کند؛
 * در محیط production اعتبارسنجی بوت (assertProductionSecrets) مسدود می‌کند.
 */
export function melkTokenSecret(): string | null {
  return process.env.MELK_TOKEN_KEY?.trim() || null;
}

function armKey(): Buffer {
  const secret = melkTokenSecret();
  if (!secret) {
    // Fail-fast بدون fallback: فراخواننده باید خطای شفاف بدهد.
    throw new Error(
      "[crypto:fail-fast] MELK_TOKEN_KEY تنظیم نشده است — رمزنگاری/رمزگشایی توکن‌ها ممکن نیست (SEC-2). " +
        "برای محیط توسعه: scripts/dev-secrets.ts یا .env.local؛ برای production: متغیر محیطی سرور."
    );
  }
  // کلید ۳۲ بایتی پایدار از راز (بدون ذخیره راز خام)
  return createHash("sha256").update(`arm-token-enc:${secret}`, "utf8").digest();
}

/** رمزنگاری متن با AES-256-GCM — خروجی: base64(iv + tag + ciphertext) */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", armKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

/** رمزگشایی خروجی encryptSecret — در صورت نامعتبربودن null برمی‌گرداند */
export function decryptSecret(payload: string | null | undefined): string | null {
  if (!payload) return null;
  try {
    const buf = Buffer.from(payload, "base64");
    if (buf.length < 29) return null; // 12 iv + 16 tag + حداقل 1 بایت
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", armKey(), iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    return dec.toString("utf8");
  } catch {
    return null;
  }
}

// ==========================================================================
// اعتبارسنجی ساختارها
// ==========================================================================

/** اعتبارسنجی ساختار کد پرسنلی: رقمی بین ۶ تا ۱۲ رقم */
export function isValidPersonnelCodeFormat(code: string): boolean {
  return /^\d{6,12}$/.test(code.trim());
}

/**
 * اعتبارسنجی ساختار کد پیامکی سامانه ARM: ۴ رقم
 * (کشف واقعی: فیلد ورود کد تأیید در arm.melketabriz.ir با numInputs:4 است)
 */
export function isValidOtpFormat(otp: string): boolean {
  return /^\d{4}$/.test(otp.trim());
}

/** اعتبارسنجی ساختار کد ورود مدیر: ۸ رقم */
export function isValidMasterCodeFormat(code: string): boolean {
  return /^\d{8}$/.test(code.trim());
}
```

---

# فصل ۲۱ — API Endpoints (۶۱ روت)

> **قواعد عمومی:** همهٔ روت‌ها زیر `/api/*` (الگوی BFF) · احراز هویت با هدر نشست (جز version/health/auth-otp) · خطاها پاکت یکسان `{error, code?}` · روت‌های سنگین فهرست، پاسخ gzip >۶۴KB (`compressed-json.ts`).

## ۲۱٫۱ — احراز هویت و نشست (۴)

| مسیر | متد | ورودی | خروجی | دسترسی |
|---|---|---|---|---|
| `/api/auth/request-otp` | POST | `personnelCode` | `{sent:true}` | عمومی (rate-limited) |
| `/api/auth/verify-otp` | POST | `code, otp` | نشست + توکن رمزشده | عمومی |
| `/api/auth/master-login` | POST | `masterCode` | نشست OWNER | عمومی (زمان-ثابت) |
| `/api/auth/session` | GET/DELETE | — | وضعیت نشست / خروج | نشست‌دار |

## ۲۱٫۲ — دادهٔ CRM (۱۲)

| مسیر | متد | خروجی | فایل |
|---|---|---|---|
| `/api/crm/arm-catalog/listings` | GET | فهرست M1 (۱۶ ستون، سقف ۲۵k، gzip) | `crm/arm-catalog/listings/route.ts` |
| `/api/crm/arm-catalog/requests` | GET | فهرست M2 (۱۳ ستون) | `…/requests/route.ts` |
| `/api/crm/arm-catalog/sync` | POST | برش checkpointدار آگهی/درخواست | `…/sync/route.ts` |
| `/api/crm/transactions` | GET | فهرست M3 | `crm/transactions/route.ts` |
| `/api/crm/transactions/sync` | POST | sync معاملات + tx-info | `…/sync/route.ts` |
| `/api/crm/contracts` | GET | قراردادها/اسناد | `crm/contracts/route.ts` |
| `/api/crm/experts` | GET | فهرست M4 (۱۲ ستون) | `crm/experts/route.ts` |
| `/api/crm/interactions` | GET | تعاملات مشاوران | `crm/interactions/route.ts` |
| `/api/crm/customer-club` | GET | دادهٔ باشگاه (آرشیو) | `crm/customer-club/route.ts` |
| `/api/crm/branches` | GET | شعب (PM→ARM→دستی) | `crm/branches/route.ts` |
| `/api/crm/finance` | GET | خلاصهٔ مالی | `crm/finance/route.ts` |
| `/api/crm/finance/commission` | POST | محاسبهٔ کمیسیون (ACC) | `…/commission/route.ts` |
| `/api/crm/meta` | GET | متادیتای عمومی (وضعیت‌ها/نقش‌ها) | `crm/meta/route.ts` |
| `/api/crm/data-freshness` | GET | تازگی هر منبع | `…/data-freshness/route.ts` |

## ۲۱٫۳ — ایجنت و هوشمندی (۶)

| مسیر | متد | خروجی |
|---|---|---|
| `/api/agent/[tileId]/insight` | GET | بینش‌های وزن‌خورده |
| `/api/agent/[tileId]/feedback` | POST | ثبت بازخورد append-only |
| `/api/agent/[tileId]/stats` | GET | آمار حافظه/بازخورد |
| `/api/agent/[tileId]/policy` | GET/POST | نسخه‌های سیاست / Rollback (OWNER) |
| `/api/intelligence/status` | GET | وضعیت دیمن مغز + Tierها |
| `/api/intelligence/blackboard` | GET | ورودی‌های Blackboard (M8) |

## ۲۱٫۴ — همگام‌سازی و اتصال (۱۳)

| مسیر | متد | نقش |
|---|---|---|
| `/api/sync` | POST | sync هدفمند یک منبع |
| `/api/sync/all` | POST | sync همه (Tier-aware) |
| `/api/sync/jobs` | GET | وضعیت دیمن/کارها (SyncJobState) |
| `/api/melk-public/sync` | POST | sync سامانهٔ عمومی |
| `/api/arm/connection` | GET/POST | وضعیت/برقراری ARM |
| `/api/pm/connection` | GET/POST | وضعیت/برقراری PM |
| `/api/gap/connection` | GET/POST | وضعیت/برقراری GAP |
| `/api/connection/status` | GET | وضعیت تجمیعی همهٔ سامانه‌ها |
| `/api/connection/reset` | POST | ریست اتصال (با بکاپ خودکار) |

## ۲۱٫۵ — آگهی/درخواست ملکا + دیوار + اینستاگرام (۱۲)

| مسیر | متد | نقش |
|---|---|---|
| `/api/listings` | GET/POST | فهرست/ایجاد آگهی ملکا |
| `/api/listings/[id]` | GET/PATCH/DELETE | جزئیات/ویرایش (آرشیو) |
| `/api/listings/[id]/transfer-crm` | POST | انتقال به CRM (پل ARM) |
| `/api/listings/[id]/instagram` | POST | انتشار اینستاگرام |
| `/api/requests` | GET/POST | درخواست‌های ملکا |
| `/api/requests/[id]` | GET/PATCH | جزئیات/ویرایش |
| `/api/requests/[id]/events` | GET/POST | رویدادهای درخواست |
| `/api/requests/[id]/register` | POST | ثبت در ARM |
| `/api/requests/meta/form` | GET | متادیتای فرم درخواست |
| `/api/divar/scan` \| `/api/divar/ads` \| `/api/divar/ads/[token]` \| `…/register` \| `…/reject` \| `/api/divar/locations` \| `/api/divar/settings` \| `/api/divar/connection` | — | خانوادهٔ فایل‌یابی دیوار |
| `/api/instagram/connection` | GET/POST | اتصال اینستاگرام |

## ۲۱٫۶ — تحلیل و پشتیبانی (۱۴)

| مسیر | متد | نقش |
|---|---|---|
| `/api/coverage` | GET | حسابرسی پوشش ستون‌ها (M7) |
| `/api/graphs` | GET | سه گراف (`?name=`) |
| `/api/matching` | GET/POST | تطبیق هوشمند (M5) |
| `/api/market-index` | GET | شاخص بازار (M6) |
| `/api/opportunity-alerts` | GET | هشدار فرصت‌ها |
| `/api/indicators` | GET | شاخص‌های ترکیبی |
| `/api/users/lookup` | GET | استعلام کاربر با موبایل |
| `/api/health` | GET | سلامت سرور/DB/دیمن‌ها |
| `/api/version` | GET | شاهد نسخه (بدون لاگین) |

> جمع روت‌های فهرست‌شده در این فصل با تمام زیرمسیرها = **۶۱ فایل route.ts** (شمارش `find src/app/api -name route.ts`).

---
---

# بخش پنجم — زیرساخت و پایداری

---

# فصل ۲۲ — تست‌ها و گاردها

## ۲۲٫۱ — مجموعهٔ تست‌ها

- **۷۸ فایل تست** در `tests/` (~۱٬۹۱۹ فراخوانی `test()`) — اجرای سبز پیاپی: **۱۸۹۴/۱۸۹۴ ×۲** (شمار آزمون‌های مؤثر پس از skipهای شرطی).
- **رانر:** `bun test` با happy-dom؛ پایگاه تست مجزا `db/test.db` و کلید رمز آزمایشی — از package.json:14: `DATABASE_URL=file:/home/z/my-project/db/test.db MELK_TOKEN_KEY=test-only-key-not-a-real-secret bun test tests/`.
- **قاعدهٔ دو-سبز پیاپی:** هر پرونده فقط با دو اجرای کامل سبزِ پشت‌سرهم بسته می‌شود (`AGENTS.md` §۳).
- **همراه همیشه:** `bunx tsc --noEmit` صفر خطا + `bun run lint` صفر خطا.

## ۲۲٫۲ — خانواده‌های تست (نام‌گذاری پرونده‌محور)

| خانواده | نمونه فایل‌ها | قلمرو |
|---|---|---|
| فازهای ساخت | `phase1-*` … `phase9-*` | هر فاز یک فایل (لایه‌ها، رجیستری، DTO، policy) |
| پرونده‌های عملیاتی | `p65xx-*.test.ts` | هر پروندهٔ تحویل، تست شاهد خودش |
| حادثه‌ها | `hotfix01-secrets` … `hotfix06-prod-logs` | رگرسیون ریشه‌یابی‌شدهٔ هر حادثه |
| قوانین ابدی | `p6526-*` (قانون فهرست) · `p6549-luxury-law` (قانون ۰۳۵-B) | تستِ خودِ قانون |
| ایجنت‌های هوشمند | `divar-agent.intelligent`, `request-agent.intelligent` | رفتار یادگیری |
| مرزبندی | `phase1-layer-boundaries` | ممنوعیت‌های import |

## ۲۲٫۳ — گاردهای `--strict` (شل + تست)

| گارد | نقش | وضعیت صادقانه |
|---|---|---|
| `scripts/audit-repository-boundary.sh --strict` | ایجنت/روت بدون `db.*` مستقیم | PASS |
| `scripts/audit-intelligence-boundary.sh --strict` | هستهٔ هوشمندی بدون import از UI | PASS |
| `scripts/audit-feature-visibility.sh --strict` | ویژگی پنهان‌نشده پشت پرچم مرده | PASS |
| `scripts/audit-log-safety.sh` | لاگ بدون secret خام | PASS |
| `agents-strict` (روت‌ها) | روت بدون فراخوانی مستقیم Prisma | بدهی تاریخی مستند (۳۱ فراخوانی/۲ فایل — از P6526؛ سهم پرونده‌های اخیر صفر) |
| `scripts/audit-graph-integrity.sh` | یال/گره یتیم ندارد | PASS |
| `scripts/audit-job-state.sh` / `audit-opportunity-alerts.sh` / `audit-phase0-revision.sh` | سلامت دیمن/هشدار/بازنگری | PASS |
| `scripts/regression-guard.sh` | اجرای ترکیبی سریع پیش از کامیت | PASS |

## ۲۲٫۴ — نحوهٔ اجرای استاندارد (پایان هر جلسه)

```bash
bun test tests/                 # بار اول — همه سبز
bun test tests/                 # بار دوم — سبز پیاپی
bunx tsc --noEmit               # صفر خطا
bun run lint                    # صفر خطا
bash scripts/audit-repository-boundary.sh --strict
bash scripts/audit-intelligence-boundary.sh --strict
bash scripts/audit-log-safety.sh
```

---

# فصل ۲۳ — پیکربندی (Configuration)

## ۲۳٫۱ — متن کامل `.env.example`

```bash
# =============================================================================
# نمونه متغیرهای محیطی — ملک تبریز (HOTFIX-01)
# -----------------------------------------------------------------------------
# این فایل را به ‎.env.local (توسعه) یا متغیرهای محیطی سرور (تولید) منتقل کنید.
# ⚠️ از PHASE 0.5 به بعد هیچ fallback سورس‌نشسته‌ای وجود ندارد:
#    در production نبودِ هر یک از رازهای اجباری = عدم بوت سرور (fail-fast).
# =============================================================================

# --- پایگاه داده (اجباری) ----------------------------------------------------
# SQLite فعلی — در PHASE 12 به PostgreSQL مهاجرت می‌شود
DATABASE_URL="file:/home/z/my-project/db/custom.db"

# --- رازهای اجباری production (در dev هم برای جریان کامل ورود لازم‌اند) --------
# کد ورود مدیر (مالک) — ۸ رقم. مقدار واقعی فقط در محیط امن؛ هرگز commit نمی‌شود.
# MASTER_ACCESS_CODE=

# کلید رمزنگاری توکن‌ها (AES-256-GCM) — مستقل از کد مدیر.
# تولید نمونه: openssl rand -hex 32
# برای محیط توسعه می‌توانید scripts/dev-secrets.ts را اجرا کنید.
# MELK_TOKEN_KEY=

# (اختیاری) کلید جداگانه اعتبارنامه دیوار — اگر خالی باشد MELK_TOKEN_KEY استفاده می‌شود
# DIVAR_TOKEN_KEY=

# --- چرخش کلید (فقط حین اجرای scripts/rotate-encryption-key.ts یا startup) ----
# ROTATION_PENDING=true
# MELK_TOKEN_KEY_OLD=<کلید قدیم>

# --- تنظیمات اتصال سامانه‌های ملک تبریز (پیش‌فرض‌ها امن و کشف‌شده‌اند) --------
# MELK_ARM_FRONT_URL=https://arm.melketabriz.ir
# MELK_PM_FRONT_URL=https://pm.melketabriz.ir
# MELK_ARM_API_BASE=https://arus-api.melketabriz.ir/api/apm/
# MELK_ARM_PUBLIC_API_BASE=https://arus-api.melketabriz.ir/api/public/
# MELK_PM_API_BASE=https://pm-api.melketabriz.ir/api/
# MELK_ACC_API_BASE=https://fm-api.melketabriz.ir/
# MELK_API_TIMEOUT_MS=25000
# MELK_API_MAX_RETRIES=2
# SESSION_TTL_HOURS=12
# MELK_SYNC_INTERVAL_MINUTES=5

# --- حالت همگام‌سازی CRM (P2-04) — پیش‌فرض legacy تا PHASE 4 --------
# legacy      = رفتار فعلی: پاک‌سازی کامل + درج اتمیک (deleteMany+createMany)
# incremental = upsert بر کلید طبیعی + نقطه ازسرگیری + نامه مرده (SyncDeadLetter)
# MELK_SYNC_MODE=legacy
```

## ۲۳٫۲ — فهرست متغیرها با توضیح

| متغیر | الزام | توضیح |
|---|---|---|
| `DATABASE_URL` | اجباری | `file:` مسیر SQLite (تولید: `db/custom.db`؛ تست: `db/test.db`) |
| `MASTER_ACCESS_CODE` | اجباری در production | کد ۸رقمی ورود مالک — هرگز commit نمی‌شود |
| `MELK_TOKEN_KEY` | اجباری در production | کلید ۳۲بایتی hex رمزنگاری AES-256-GCM (`openssl rand -hex 32`) |
| `DIVAR_TOKEN_KEY` | اختیاری | کلید جداگانهٔ Vault دیوار (پیش‌فرض: همان MELK_TOKEN_KEY) |
| `ROTATION_PENDING` + `MELK_TOKEN_KEY_OLD` | فقط حین چرخش | فعال‌سازی بازرمزنگاری اسرار در startup |
| `MELK_ARM_FRONT_URL` / `MELK_ARM_API_BASE` / `MELK_ARM_PUBLIC_API_BASE` | اختیاری (پیش‌فرض کشف‌شده) | پایه‌های سامانهٔ ARM |
| `MELK_PM_FRONT_URL` / `MELK_PM_API_BASE` | اختیاری | پایه‌های سامانهٔ PM |
| `MELK_ACC_API_BASE` | اختیاری | پایهٔ سامانهٔ مالی |
| `MELK_GAP_API_BASE` | اختیاری | پایهٔ سامانهٔ گفت‌وگو |
| `MELK_API_TIMEOUT_MS` / `MELK_API_MAX_RETRIES` | اختیاری | ۲۵٬۰۰۰ / ۲ پیش‌فرض |
| `SESSION_TTL_HOURS` | اختیاری | ۱۲ پیش‌فرض |
| `MELK_SYNC_INTERVAL_MINUTES` | اختیاری | ۵ پیش‌فرض (حداقل ۲) |
| `MELK_SYNC_MODE` | اختیاری | `legacy` \| `incremental` |
| `MELK_BACKGROUND_SYNC` | اختیاری | `enabled` برای حلقهٔ پس‌زمینهٔ پیشینی (پیش‌فرض خاموش — HOTFIX-02) |
| `MELK_INTELLIGENCE_DAEMON` | اختیاری | `disabled` خاموش‌کردن دیمن مغز |
| `MELK_AUTO_RECOVERY` | اختیاری | `disabled` خاموش‌کردن قلاب بازیابی بوت (P6548) |

## ۲۳٫۳ — Feature Flags و پلتفرم

- **env جایگزین پلتفرم:** فرایند دیپلوی پلتفرم `.env*` را می‌زداید → `env.platform.json` ریشه به‌عنوان fallback در بوت اعمال می‌شود (`src/lib/platform-env.ts` + `instrumentation.ts:22-50`) — فقط کلیدهای غایب پر می‌شوند.
- **Tier System** پرچم‌محور نیست (داده‌محور است — فصل ۱۲٫۴) اما رفتار sync/دیمن به Tier فعال مدل حساس است (برش‌های کوچک‌تر در Tier پایین).

---

# فصل ۲۴ — پایداری و بازیابی

> مرجع کامل: `docs/RECOVERY-POLICY.md` (سیاست رسمی پس از حادثهٔ سوم).

## ۲۴٫۱ — چهار لایهٔ دفاعی

| لایه | سازوکار | محل | دورهٔ تازگی |
|---|---|---|---|
| ۱ | **بستهٔ بقا** (بستهٔ کامل: repo.bundle + DB + worklog + env + شواهد + MANIFEST.md5 + CHAIN.txt) | `upload/.survival/<PXXXX>-<date>/` | پایان هر پرونده |
| ۲ | **آینهٔ GitHub** — شاخهٔ یتیم `survival/code` = اسنپ‌شات کامل کد (بدون DB — قانون ۰۳۵-A) هر ۶ ساعت | `github.com/nemsey/melka-backup-private` | ۶ ساعت (دیمن آینه) |
| ۳ | **repo.tar خودتازه** — اسنپ‌شات سازگار-DB برای بوت پلتفرم (`scripts/refresh-sync-tar.sh` با VACUUM INTO اتمیک) | `/home/sync/repo.tar` | پس از هر کار بزرگ |
| ۴ | **دیمن بازیابی خودکار** + قلاب بوت ۲۰ثانیه‌ای (تشخیص چهارسنجه‌ای: مهر زنده ↔ HEAD ↔ آینه ↔ شمارش DB) | `scripts/recovery/auto-recovery.sh` + `instrumentation.ts:114-152` | هر بوت + هر ۶ ساعت |

## ۲۴٫۲ — ساختار بستهٔ بقا

```
upload/.survival/P65XX-YYYYMMDD/
├── repo.bundle        # باندل کامل git (هر دو شاخه)
├── custom.db          # دیتابیس VACUUM-شده (قانون دادهٔ مقدس)
├── worklog.md         # سند کار کامل
├── AGENTS.md · package.json · schema.prisma · bun.lock   # هویت پروژه
├── env.platform.json · env.txt   # پیکربندی بدون رازهای مطلق
├── EVENTS.md          # رویدادهای صادقانهٔ جلسه
├── MANIFEST.md5       # اثر انگشت همهٔ فایل‌ها
├── CHAIN.txt          # زنجیرهٔ هش بسته‌ها (chainIndex + previousChainMd5)
└── evidence-*/        # شواهد بصری/تستی پرونده
```

## ۲۴٫۳ — زنجیرهٔ هش بسته‌ها

هر بسته `CHAIN.txt` دارد: `chainIndex: n` + `previousChainMd5: <md5 فایل CHAIN بستهٔ قبل>`. زنجیرهٔ فعلی تا chainIndex=۸ (P6549) پیوسته و راستی‌آزمایی‌شده است. هر گسست = هشدر بازیابی.

## ۲۴٫۴ — دیمن‌های زنده (چهارگانه)

1. **دیمن پایدارساز (کاتالوگ)** — درون‌فرایندی با سرور (`catalog-daemon.ts`).
2. **دیمن مغز** — حلقهٔ یادگیری (`lib/intelligence/daemon.ts`).
3. **دیمن آینهٔ GitHub** — ۶ساعته، per-ref، double-fork، گارد PID هوشمند (`scripts/mirror/mirror-daemon.sh` + `re-arm.sh`).
4. **دیمن بازیابی خودکار** — ۶ساعته + بوت (`scripts/recovery/auto-recovery.sh`).

**الگوی بقا دیمن‌ها:** `( setsid nohup cmd </dev/null & )` → PPID=1 — درس حادثهٔ مرگ دیمن‌ها (P6547-cont).

## ۲۴٫۵ — نقشهٔ وقایع (رویدادهای صادقانه)

حادثه‌های چهارگانهٔ بازگشت-از-اسنپ‌شات-کهنه (خانوادهٔ «repo.tar کهنه») مستند و **ریشه‌ای درمان** شده‌اند: repo.tar خودتازه (لایه ۳) + بازیابی خودکار (لایه ۴) + بهداخت git (حذف DB از ایندکس؛ `.gitignore` روی `upload/backups/db`) — «حادثهٔ پنجم از این خانواده از مسیر اسنپ‌شات کهنه دیگر ممکن نیست». محدودیت صادقانه باقی‌مانده در `RECOVERY-POLICY.md §۵`.

## ۲۴٫۶ — خط لولهٔ انتشار پلتفرم

- انتشار = فراخوانی ابزار **Complete** → پلتفرم `.zscripts/build.sh` را اجرا می‌کند (`bun run build` → standalone → بسته‌بندی) و روی Alibaba FC مستقر می‌شود.
- preview = کانتینر زنده (پورت ۳۰۰۰ از Caddy)؛ publish = اسنپ‌شات لحظهٔ Complete.
- گارد تازگی: `scripts/verify-deploy-freshness.sh <URL>` — buildId زنده باید = git HEAD.

---

# فصل ۲۵ — قوانین ابدی و راهبری

## ۲۵٫۱ — ده قانون ابدی GLM

۱. هیچ داده‌ای حذف نمی‌شود (قانون دادهٔ مقدس).
۲. هیچ تغییری بدون شاهد زندهٔ قابل‌راستی‌آزمایی «انجام‌شده» نیست.
۳. مرز لایه‌ها با گارد، نه با توافق شفاهی، حفظ می‌شود.
۴. اسکیما فقط افزودنی می‌شود؛ پیش از تغییر بکاپ گرم.
۵. رازها فقط در متغیر محیطی/Vault — هرگز در کد/لاگ/گیت.
۶. هیچ رکورد ساختگی وارد تولید نمی‌شود (اتصال همیشه واقعی).
۷. تست‌ها دو-سبز پیاپی؛ پرونده با گارد قرمز بسته نمی‌شود.
۸. مهر نسخهٔ زنده (سه مسیر شاهد) باید با HEAD یکی باشد.
۹. گزارش‌ها صادقانه‌اند: خطا و محدودیت با همان تفصیل موفقیت.
۱۰. کار پس از هر گام بزرگ ذخیره/کامیت می‌شود — قبل از اتمام ظرفیت.

## ۲۵٫۲ — قانون تثبیت ۲٫۰ (۱۲ بُعد الف تا م) — چکیده

الف) وارسی آغاز جلسه · ب) تثبیت پله‌ای (کامیت‌های شماره‌دار) · ج) بستهٔ بقا با زنجیرهٔ هش · د) مهر نسخهٔ زنده · هـ) رویدادهای صادقانه · و) پیوستگی جلسه · ز) شمارش داده پیش/پس · ح) شواهد بصری · ط) تست دو-سبز · ی) گارد مرزبندی سبز · ک) آینهٔ برون‌پلتفرمی · ل) راستی‌آزمایی آینه · **م) جدول لینک‌های زندهٔ اجباری در پایان هر گزارش**:

```
| # | لینک               | وضعیت      | مهر نسخه        |
| ۱ | preview (زنده)     | ✓/✗        | [BUILD_ID]      |
| ۲ | publish (uptodate) | ✓/⏳/✗     | [BUILD_ID یا —] |
```

قواعد بند م: لینک خراب → دلیل دقیق + کد خطا؛ صفر ارجاع کلامی؛ صفر گزارش بدون این جدول.

## ۲۵٫۳ — قانون دادهٔ مقدس

بکاپ پیش از هر تغییر (`VACUUM INTO`) · شمارش پیش/پس (`expected-counts.json`) · صفر حذف (آرشیو) · دادهٔ حذف کاشی‌ها ماندگار · DB از گیت خارج (۱۲۰MB→۴۵MB — P6549) · بسته‌های بقا در `upload/` (ذخیره‌ساز پایدار) · بازنویسی تاریخچهٔ git فقط با مجوز صریح مالک.

## ۲۵٫۴ — قانون Tier

هیچ مدل/سیاست از Tier خود فراتر نمی‌رود؛ قفل‌های ابدی `auto_execute=false` و `requires_council=true` برای طبقهٔ CRITICAL؛ پیشرفت Tier مستقل per-model با شاهد Brier.

## ۲۵٫۵ — قانون لینک

هر پرونده با جدول لینک‌های زنده (بند م) بسته می‌شود؛ گارد تازگی publish؛ BUILD_ID فقط از `/api/version` (ممنوعیت BUILD_ID دستی/روایتی).

## ۲۵٫۶ — قوانین شورا (سلسلهٔ اسناد)

| سند | موضوع | وضعیت |
|---|---|---|
| ملکا-شورا-۱۴۰۵-۰۳۱ | قانون تثبیت ۱۱بُعدی (پایه) | لازم‌الاجرا |
| ۰۳۴ | بازیابی اضطراری حادثهٔ سوم + Tier 4 | اجراشده |
| ۰۳۵-A | تثبیت ۲٫۰ (۱۲ بُعد + بند م + بهداشت گیت) | اجراشده |
| ۰۳۵-B | ظاهر فاخر ۱٫۰ (پالت ۱۳×۵ + PWA + اجزای اجباری) | اجراشده |
| ۰۳۶ | دستور جامع غنی‌سازی M1-M4 | اجراشده (P6549) |
| ۰۳۷ | بستهٔ انتقال کامل (این سند) | در اجرا |

## ۲۵٫۷ — راهبری آینده (چکیده)

- **مجوزهای ویژهٔ مالک:** بازنویسی تاریخچهٔ گیت (LFS) · پیشرفت Tier به T4 · تغییر قوانین ابدی.
- **شورا (ف۱):** مرجع تفسیر قوانین؛ تصمیم‌های CRITICAL از صف M8.
- **حلقهٔ بازخورد:** هر حادثه → سند ریشه‌یابی → درمان ریشه‌ای → تست رگرسیون + بند قانونی جدید در صورت لزوم (الگوی اثبات‌شدهٔ حادثه‌های ۱ تا ۴).

## ۲۵٫۸ — سند قواعد الزامی عامل‌ها (متن کامل AGENTS.md)

> عین `AGENTS.md` — قواعد غیرقابل مذاکرهٔ هر عامل/جلسهٔ آینده:

```markdown
# AGENTS.md — قواعد الزامی برای هر عامل (GLM/میگریشن آینده) در پروژهٔ ملک تبریز

> این فایل توسط دستور شورا (P6519 — «رفع دائمی مشکل لینک‌های Preview/Publish کهنه»، ۱۴۰۵/۰۷/۰۲) الزامی شده است.
> قواعد این فایل **غیرقابل مذاکره** هستند. هر جلسه/عاملی که پروژه را تغییر می‌دهد باید آن‌ها را اجرا کند.

---

## ۱. قانون طلایی انتشار

> **«هیچ پرونده‌ای بسته نمی‌شود مگر BUILD_ID لینک publish با git HEAD یکی باشد.»**

اصل حاکم (پروتکل جلسات): «تغییر بدون شاهد زنده = تغییر نکرده».
اگر مالک روی لینک رسمی نسخهٔ جدید را نبیند، تمام شواهد DOM/curl/VLM داخل جلسه بی‌ارزش‌اند.

## ۲. سازوکار انتشار در این پلتفرم (خلاصهٔ مستند)

- **خط لولهٔ انتشار = فراخوانی ابزار Complete است.** پلتفرم پس از Complete، `.zscripts/build.sh` را روی همین ریپو اجرا می‌کند (`bun run build` → standalone → بسته‌بندی) و روی Alibaba FC مستقر می‌کند.
- **فراموشی Complete = snapshot عمومی کهنه می‌ماند** (سابقهٔ مستند در `docs/diagnosis-preview-publish-stale.md`، مورد ۳).
- لینک preview به کانتینر زنده (پورت ۳۰۰۰ از طریق Caddy) اشاره می‌کند؛ لینک publish به snapshot لحظهٔ Complete.
- ثبت/تازه‌سازی نام دامنهٔ publish فقط از مودال UI مالک انجام می‌شود.
- مستندات کامل: `docs/diagnosis-preview-publish-stale.md` + `docs/decision-preview-publish.md`

## ۳. پروتکل پایانِ جلسه (الزامی — به همین ترتیب)

1. **کامیت**: تمام تغییرات به git کامیت شوند (پیام کامیت طبق عرف: `feat/fix/docs(PXXXX): ...`).
2. **تست‌ها**: `bun test tests/` سبز ×۲ پیاپی + `bunx tsc --noEmit` صفر خطای جدید.
3. **بیلد**: `bun run build` سبز — BUILD_ID خودکار `<gitSha8>-<yyyymmdd>-<hhmm>` ساخته می‌شود (بدون هیچ اقدام دستی)؛ مقدار را ثبت کنید.
4. **گارد تازگی**: برای هر لینک عمومیِ در دسترس (publish مالک):
   `scripts/verify-deploy-freshness.sh https://<name>-d.space-z.ai`
   - خروجی باید PASS باشد (buildId زنده = git HEAD).
   - اگر لینک در دسترس نیست یا کهنه است: **صادقانه گزارش شود** — ادعای انتشار بدون شاهد ممنوع.
5. **انتشار**: ابزار **Complete** فراخوانده شود (این همان دکمهٔ publish پلتفرم است).
6. **worklog**: در پایان ورودی worklog، فیلد `published_build_id` ثبت شود (BUILD_ID گزارش‌شده توسط گارد یا بیلد نهایی).

## ۴. شاهد زندهٔ نسخه — سه مسیر همیشه در دسترس

هر بیلد از این سه مسیر نسخهٔ خودش را «فریاد می‌زند» (هر سه باید یک مقدار بدهند):

| مسیر | روش | نیاز به لاگین |
|---|---|---|
| Endpoint شاهد | `GET /api/version` → `{buildId, builtAt, gitSha, env, source}` | ❌ |
| متاتگ HTML | `curl -s <URL>/ | grep app-build-id` | ❌ |
| فوتر UI | «نسخهٔ زندهٔ سامانه: …» روی صفحهٔ خانهٔ داشبورد | ✅ |

قرارداد پایدار: کلیدهای `buildId/builtAt/gitSha/env` در `/api/version` جزء قرارداد گارد هستند؛ تغییر نام آن‌ها = تغییر قرارداد = باید در همین فایل ثبت شود.

## ۵. ممنوعیت‌ها

- ❌ **BUILD_ID دستی/روایتی**: از این پس ثبت «BUILD_ID آماده Publish» بدون شاهد endpoint ممنوع — BUILD_ID خودکار است و از `/api/version` خوانده می‌شود.
- ❌ **ادعای انتشار بدون Complete**: تغییر کد بدون فراخوانی Complete روی دامنهٔ عمومی دیده نمی‌شود.
- ❌ **بستن پرونده با گارد قرمز**: اگر `verify-deploy-freshness.sh` fail داد، پرونده باز می‌ماند و وضعیت با پروتکل «Blocker → Alternative → Decision» به شورا/مالک گزارش می‌شود.
- ❌ **حذف/تغییر مخرب داده** (قانون حرمت اطلاعات): تغییرات اسکیما فقط افزودنی؛ قبل از هر تغییر DB بکاپ گرم `VACUUM INTO`.

## ۶. قانون همیشگی فهرست‌ها (P6525 — ۱۴۰۵/۰۷/۰۵ · بازطراحی تست‌ها: P6526 — ۱۴۰۵/۰۷/۰۶)

> هر فهرست اپلیکیشن (ایجادشده و قابل‌ایجاد در آینده) باید مطابق قانون فهرست باشد —
> با «فهرست معاملات» (M3) به‌عنوان نمونهٔ عالی.

| # | قانون | منبع اجرا (کد) | گارد (تست) |
|---|---|---|---|
| ۱ | تک‌صفحه‌ای — بدون صفحه‌بندی | صفحات فهرست (rows.map) | p6526 §۶-۲ |
| ۲ | اسکرول سریع — ظرف اسکرول + `cv-row` | `ui/table.tsx` (max-h-[32rem] + cv-row در TableRow) | p6526 §۶-۱ |
| ۳ | عنوان فهرست (سرستون‌ها) ثابت در اسکرول | `ui/table.tsx` (TableHeader sticky) | p6526 §۶-۱ |
| ۴ | تمام ردیف‌ها بدون هیچ محدودیتی (سقف ۲۵٬۰۰۰ = فقط گارد ایمنی سرور) | روت‌های فهرست (پیش‌فرض ۲۵٬۰۰۰) | p6526 §۶-۴ |
| ۵ | وسط‌چین — سرستون‌ها و سلول‌ها | `ui/table.tsx` (text-center) | p6526 §۶-۱ |
| + | فونت یکدست سلول‌ها: `text-xs` | `ui/table.tsx` | p6526 §۶-۱ |

- **منبع قانون = پریمیتیوهای `src/components/ui/table.tsx`.** فهرست جدید = همان پریمیتیوها؛ لغو قانون با className صریح (text-right و مانند آن) در فهرست‌ها ممنوع و گارد آن می‌گیرد.
- **رندر پنجره‌ای فهرست‌های بزرگ (P6527 — بند ۲ و ۴ در عمل):** هر فهرست به‌جای `<TableBody>` از `<TableBodyVirtual rows rowKey>` استفاده می‌کند — تا ۲۰۰ ردیف عین رفتار قبل؛ بزرگ‌تر: هندسهٔ اسکرول عین کل فهرست (تمام ردیف‌ها با یک اسکرول) اما فقط ردیف‌های قابل‌دیدن + دو فاصله‌گذار در DOM (~۴۰ ردیف). محاسبات از منبع یگانهٔ `src/lib/virtual-window.ts`. ریشه: M1 با ۱۱٬۳۹۸ ردیف یکجا، مرورگر موبایل را فریز/کرش می‌کرد («لینک preview کار نمی‌کند» در اندروید). گارد: p6527 §۱-§۳.
- **انتقال فشردهٔ روت‌های سنگین (P6527):** روت‌های M1/M2/M3 پاسخ را با `compressedJson` (gzip وقتی کلاینت می‌پذیرد؛ آستانه ۶۴KB) برمی‌گردانند — M1 از ۵٫۹MB به ~۰٫۷MB. بدون `accept-encoding` پاسخ عین `Response.json` می‌ماند (سازگاری تست‌ها). گارد: p6527 §۴.
- **حلقهٔ غنی‌سازی خودکار (P6527):** پس از هر برش فقط شمارنده‌ها از پاسخ همان برش وصله می‌شوند؛ بارگذاری کامل فقط پس از برش آخر (remaining=0) — هرگز بار تکراری چند‌مگابایتی بعد از هر برش. گارد: p6527 §۵.
- **شبکهٔ ایمنی «ریست اتصال» (P6527 — درس حادثهٔ ۱۴۰۵/۰۷/۰۴):** `clearCrmCacheTables` پیش از پاک‌سازیِ غیرخالی خودکار `VACUUM INTO backups/pre-reset-<زمان>.db` می‌سازد (بهترین-تلاش) و نام فایل را در پاسخ روت و حسابرسی برمی‌گرداند — ریست توکن‌مرده هرگز بیشتر داده را بدون مسیر بازیابی نمی‌گیرد. گارد: p6527 §۶.
- **قانون یکسان‌سازی ورودی فیلترها:** نگاشت ارقام فارسی/عربی/لاتین و حروف ي/ی، ك/ک **فقط** از `src/lib/normalize-input.ts` (منبع یگانه). هر نگاشت درون‌خطیِ رشته‌ایِ ارقام در مسیر فیلتر ممنوع — گارد p6526 §۸-۴ هر رشتهٔ ده‌رقمیِ غیرمرتب در src را قرمز می‌کند (ریشه: باگ تاریخی ۴/۵ — «۰۱۲۳۵۴۶۷۸۹»).
- **ستون مناطق فهرست درخواست‌ها (P6526/ب):** رکوردهای چندمنطقه‌ای (بیش از ۳) با «فایل مناطق» نمایش داده می‌شوند (چیپ شمارنده + دیالوگ سند شماره‌دار) — گارد p6526 §۷.
- **سوئیت تست کاشی‌های M1/M2/M3 (P6526/پ):** `tests/p6526-m123-agents-insights-filters-lists.test.ts` — ایجنت‌ها (§۱) · بینش‌ها (§۲) · فیلتر سه فهرست (§۳-§۵) · قانون فهرست (§۶) · فایل مناطق (§۷) · یکسان‌سازی (§۸) · PWA (§۹). **تست‌های عملکرد موبایل P6527:** `tests/p6527-mobile-list-performance.test.ts` — پنجره‌یابی (§۱) · پریمیتیو (§۲) · اتخاذ ۱۰ فهرست (§۳) · gzip (§۴) · حلقهٔ غنی‌سازی (§۵) · ایمنی ریست (§۶).

## ۷. بازیابی پس از ریست کانتینر

کانتینر در هر بوت: `/start.sh` → `.zscripts/dev.sh` (بازگردانی env + سوپروایزر خودترمیم سرور dev روی :3000). ریپو از `/home/sync/repo.tar` بازیابی می‌شود — پس **هر تغییر مهم باید کامیت شود** تا از ریست زنده بماند. پس از ریست، گارد تازگی (بند ۳-۴) وضعیت لینک عمومی را دوباره می‌سنجد.
```

---

# پیوست ۱ — سیاست بازیابی (متن کامل)

```markdown
# سیاست بازیابی ملکا (RECOVERY-POLICY) — Tier 4

**پرونده:** P6548-recovery · مصوب بر پایهٔ دستور اضطراری ملکا-شورا-۱۴۰۵-۰۳۴ (حادثهٔ سوم — ۱۳ مهر ۱۴۰۵)
**وضعیت:** لازم‌الاجرا · جایگزین‌کنندهٔ هر رویهٔ قبلی بازیابی

---

## ۱) قانون بنیادین

> **اسنپ‌شات پلتفرم (`/home/sync/repo.tar`) خارج از چرخهٔ بقا است.**

- به آن اتکا نمی‌کنیم، مرجع نمی‌دانیم، بر آن حساب بازیابی نمی‌کنیم.
- شواهد حادثه‌های دوم (۱۱ مهر) و سوم (۱۳ مهر): پلتفرم پس از ری‌استارت محیط، محیط را از اسنپ‌شاتی **کهنه** (۲۹ سپتامبر ۲۲:۲۸) بازیابی کرد در حالی که کارِ ۱ تا ۳ اکتبر هرگز در آن نبود.
- تنها چیزهایی که از ریست عبور می‌کنند: **پوشهٔ `upload/`** (ذخیره‌ساز ابری پایدار ossfs — بسته‌های بقا + اعتبارنامهٔ آینه + لاگ‌ها) و دانشِ این سند.

## ۲) منابع بازیابی معتبر (به ترتیب اولویت)

| # | منبع | محتوا | کی استفاده شود |
|---|------|-------|----------------|
| ۱ | بستهٔ بقا `upload/.survival/P<پرونده>-<تاریخ>/` | `repo.bundle` (کد+تاریخچه) + `custom.db` (داده) + `worklog.md` + `env` + مانیفست md5 | همیشه — نخستین انتخاب؛ تازه‌ترین بسته = مرجع |
| ۲ | آینهٔ GitHub `survival/code` | درخت کامل کد منهای فایل‌های >99MB (db در بسته‌هاست) — زنجیرهٔ اسنپ‌شات ۶ساعته | برای بازسازی کامیت‌های **پس از** آخرین بسته |
| ۳ | کامیت محلی `.git` | تاریخچهٔ کامل محلی | فقط وقتی محیط سالم است و صرفاً سرور ری‌استارت شده |

**شاخهٔ `main` آینه به‌دلیل GH001 (عبور `db/custom.db` از سقف ۱۰۰MB گیت‌هاب در کامیت‌های b92d3f7 به بعد) بلوک است و تا مجوز صریح مالک برای LFS/بازسازی، عامل بقا `survival/code` است.**

## ۳) درخت تصمیم بازیابی (عین تجربهٔ اثبات‌شدهٔ ۱۳ مهر — ۳۵ ثانیه)

```
۱) تشخیص (بدون حدس، فقط شاهد):
   - HEAD مخزن؟  مهر /api/version؟  شمارش DB؟  تاریخ repo.tar؟
۲) اگر .git سالم و HEAD == آخرین وضعیت ⇒ فقط ری‌استارت سرور dev
۳) اگر .git عقب‌تر از آینه/بسته (حادثهٔ بازگشت) ⇒
   الف) git fetch <بستهٔ تازه>/repo.bundle main  →  merge --ff-only
   ب) fetch آینه survival/code → diff اسنپ‌شاتِ متناظرِ HEAD به اسنپ‌شات سرشاخه → git apply --index → کامیت «بازسازی»
   ج) جایگزینی کامل db/custom.db از بسته (md5 از MANIFEST)
   د) bunx prisma generate → پاکسازی .next → ری‌استارت سرور (الگوی double-fork)
۴) اگر .git کاملاً خراب ⇒ git clone از repo.bundle بستهٔ تازه → ادامه از (ب)
```

**اجرای یک‌خطی:** `bash scripts/recovery-034/restore.sh`
**وارسی بدون اقدام:** `bash scripts/recovery/auto-recovery.sh check` (با `DRY_RUN=1`)

## ۴) لایه‌های دفاعی Tier 4 (فعال)

| لایه | ابزار | دوره |
|------|-------|------|
| بستهٔ بقا + زنجیرهٔ هش | هر پروندهٔ بزرگ → `upload/.survival/` (بندهای ج/ح/ک قانون ۰۳۱) | هر جلسه |
| آینهٔ برون‌پلتفرمی | `scripts/mirror/mirror-daemon.sh` — پوش `survival/code` | ۶ ساعت |
| وارسی مستقل + بازیابی خودکار | `scripts/recovery/auto-recovery.sh daemon` — تشخیص بازگشت (مهر ↔ HEAD ↔ آینه ↔ شمارش DB) و بازیابی | ۶ ساعت |
| قلاب بوت | `src/instrumentation.ts` بخش ۴ — ۲۰ ثانیه پس از هر بوت سرور، وارسی detached | هر بوت |
| شمارش‌های معتبر پایدار | `upload/.survival/expected-counts.json` — افت >۲۰٪ = بازگشت داده | هر چرخهٔ سالم |

**سنجه‌های تشخیص بازگشت (هر رخداد = هشدار؛ ترکیب رخداد ۲+۳ یا ۳+۵ = بازیابی خودکار):**
1. مهر `/api/version` ≠ HEAD محلی
2. درخت محلی ≠ اسنپ‌شات آینه **و** تاریخ منبع آینه > تاریخ HEAD + ۱ ساعت
3. شمارش آگهی/درخواست DB < ۸۰٪ آخرین وضعیت معتبر پایدار
4. HEAD محلی فاقد منبعِ تازه‌ترین اسنپ‌شات آینه

## ۵) محدودیت صادقانه

- قلاب بوت فقط در کدِ **≥ P6548** وجود دارد. اگر پلتفرم از اسنپ‌شات قدیمی‌تر بازیابی کند، قلاب در آن کد نیست ⇒ **وارسی آغاز جلسه (بند و قانون ۰۳۱) همچنان خط اول دفاع است** — هر جلسه پیش از هر کار: HEAD، مهر، شمارش DB، بستهٔ بقا، دیمن‌ها.
- دیمن‌ها فرایند‌اند و با مرگ کانتینر می‌میرند؛ آنچه واقعاً از ریست عبور می‌کند `upload/` (بسته‌ها، اعتبارنامه، لاگ‌ها، شمارش‌های معتبر) و آینهٔ GitHub است.
- پنجرهٔ اتلاف داده با دیمن ۶ساعته حداکثر ۶ ساعت است؛ دادهٔ ARM (منبع حقیقت) با دیمن پایدارساز از چک‌پوینت‌ها دوباره همگام می‌شود (اثبات‌شده در بازیابی ۱۳ مهر: آگهی‌ها ظرف دقیقه‌ها از ۱۴٬۴۰۵ به ۱۴٬۴۰۹+ رسیدند).

## ۶) پس از هر بازیابی (چک‌لیست)

1. جدول راستی‌آزمایی ۱۲ بندی (مهر=HEAD، شمارش‌ها، تست×۲، tsc، eslint، ۴ کاشی، مغز، دیمن‌ها)
2. بستهٔ بقای تازه + به‌روزرسانی زنجیرهٔ هش (chainIndex+1)
3. پوش `survival/code` + ثبت در push-log
4. مهر نسخه + سه شاهد (API + متا + فوتر) + اسکرین‌شات
5. ثبت کامل حادثه در نقشهٔ وقایع (زمان تشخیص/علت/روش/مدت/درس‌ها)
```

---
---

# پیوست ۲ — کاتالوگ کامل تست‌ها (۷۸ فایل)

> هر پروژهٔ تحویل تست شاهد خودش را با همان نام پرونده حمل می‌کند — الگوی «تست = سند اجرایی». اجرا: `bun test tests/` (پایگاه تست مجزا + کلید آزمایشی از `package.json:14`).

| گروه | فایل‌ها | قلمرو |
|---|---|---|
| هستهٔ ایجنت | `agent`, `analyzers`, `phase2-base-agent`, `phase2-agents` | BaseLearningAgent، ایزوله‌سازی، تحلیل‌گرهای خالص |
| ایجنت‌های هوشمند | `divar-agent.intelligent`, `request-agent.intelligent` | رفتار یادگیری چندمرحله‌ای |
| فاز ۱ | `phase1-datasource`, `phase1-domain-move`, `phase1-kpicard`, `phase1-layer-boundaries`, `phase1-regression`, `phase1-step-report`, `phase1-use-tile-data` | لایه‌ها، مرزبندی، KPI، DTO |
| فاز ۲ | `phase2-logger`, `phase2-policy-meta`, `phase2-repositories`, `phase2-routes`, `phase2-sync` | رجیستری‌ها، BFF، sync |
| فاز ۳ | `phase3-skeleton` | قراردادهای ۱۱ موتور (interface خالص) |
| فاز ۴ | `phase4-engines` | بدنهٔ Context/Memory |
| فاز ۵ | `phase5-retrieval` | بازیابی هیبریدی |
| فاز ۶ | `phase6-features`, `phase6-prediction`, `phase6-visibility` | Feature/Prediction/نمایش |
| فاز ۶٫۵ | `phase65-arm-connection`, `phase65-b3-coverage10k`, `phase65-b3-three-layer`, `phase65-bulk-import`, `phase65-normalize`, `phase65-scope-audit`, `phase65-sync-bugfix` | اتصال ARM، bulk، نرمال‌سازی، ConsultantScope |
| فاز ۷-۹ | `phase7-outcome-safety-action`, `phase8-evaluation-learning-decision`, `phase9-wiring-brain-daemon` | پیامد/ایمنی/اقدام، ارزیابی-یادگیری-تصمیم، سیم‌کشی مغز |
| رجیستری/کاشی | `tile-registry`, `management-dashboard`, `new-tiles`, `new-tiles-2`, `listing`, `request`, `divar`, `melk-api`, `crypto`, `format` | هر کاشی/ماژول |
| معماری و رنگ P6530 | `p6530-architecture-guards`, `p6530-color-system`, `p6530-m1-arm-listing`, `p6530-m2-arm-request`, `p6530-m3-transactions`, `p6530-m4-experts`, `p6530-settings-order` | گاردهای معماری + نظام رنگ + چهار کاشی M |
| مغز P6537 | `p6537-p7-core` … `p6537-p11-core`, `p6537-integration` | پهنه‌های P7-P11 (تصمیم/ارزیابی/سیاست/تشخیص/ترمیم) |
| پرونده‌های تحویل | `p6504i-owner-role`, `p6509-owner-unlimited`, `p6511-merge-resume`, `p6512-cross-sync`, `p6519-deploy-freshness`, `p6527-mobile-list-performance`, `p6545-step1-infra`, `p6545-step2-tiles`, `p6545-step3-brain`, `p6546-six-steps`, `p6547-six-steps`, `p6549-coverage-columns`, `p6549-luxury-law` | هر پروندهٔ تحویل، تست شاهد خودش |
| حادثه‌ها (رگرسیون) | `hotfix01-secrets` … `hotfix06-prod-logs` | درس‌آموختهٔ هر حادثه |
| پلتفرم | `platform-env-fallback`, `night2-sync-summary` | env جایگزین، خلاصهٔ شبانه |

---

# پیوست ۳ — کاتالوگ اسناد `docs/` (۲۸ سند)

| سند | موضوع |
|---|---|
| `ARCHITECTURE.md` | معماری کامل و لایه‌های تخصصی (مرجع اصلی فصل ۳) |
| `API-INTEGRATION.md` | قرارداد کامل API سامانه‌های ملک تبریز |
| `ARM-PM-RECONNAISSANCE.md` | شناسایی اولیهٔ ساختار دو سامانه |
| `BUILD-ANDROID.md` | بسته‌بندی Capacitor اندروید |
| `INTELLIGENCE-CORE-SOUL.md` | روح و فلسفهٔ هستهٔ هوشمندی |
| `METADATA-CONTRACT.md` | قرارداد متادیتا |
| `P7-SOUL.md` … `P11-SOUL.md` | روح پهنه‌های P7 تا P11 (تصمیم تا ترمیم) |
| `P6537-CLOSURE.md` | بستنج پروندهٔ P6537 |
| `P6546-ENDPOINT-MAP.md` | نقشهٔ کامل endpoint های کشف‌شده |
| `PHASE-3-DESIGN.md` … `PHASE-6.5-DESIGN.md` | طراحی هر فاز ساخت |
| `PREDICTION-BASELINE.md`, `PREDICTION-CONTRACT.md` | خط پایه و قرارداد پیش‌بینی |
| `RECON-NIGHT1-RUNBOOK.md` | رونمای شناسایی شب اول |
| `RECOVERY-POLICY.md` | سیاست رسمی بازیابی (پیوست ۱ این سند) |
| `TODO_P1-05.md` | کارهای باقی‌ماندهٔ فاز ۱ |
| `decision-preview-publish.md` (+v2), `diagnosis-preview-publish-stale.md` (+v2), `publish-permanent-fix-p6526.md` | تشخیص و تصمیم مسائل انتشار |

---

# پیوست ۴ — واژه‌نامهٔ بازسازی (فارسی ↔ شناسهٔ کد)

> برای آنکه تسک تازه هیچ‌گاه بین «نام فارسی» و «identifier» سرگردان نشود.

| فارسی | شناسه | جا |
|---|---|---|
| ملکا | Melka (نام محصول) | `public/manifest.json` |
| سامانهٔ آرم (مدیریت آگهی و درخواست) | ARM | `src/lib/melk-api/endpoints.ts → arm` |
| سامانهٔ پرسنلی | PM | `endpoints.ts → pm` |
| سامانهٔ مالی (حسابداری) | ACC | `endpoints.ts → acc` |
| سامانهٔ گفت‌وگو | GAP | `endpoints.ts → gap` |
| سامانهٔ عمومی | melkPublic | `endpoints.ts → melkPublic` |
| کاشی | Tile | `src/core/tiles/tile-contract.ts` |
| ظرف داشبورد مدیریتی | management-dashboard (container) | `tile-registry.ts → listChildren` |
| ایجنت یادگیرنده | BaseLearningAgent | `src/core/agent/base-agent.ts` |
| بینش | InsightCard | `base-agent.ts` |
| دامنهٔ بینش | insightDomains | تعریف هر کاشی |
| سیاست نسخه‌دار | AgentPolicyVersion | `prisma/schema.prisma` |
| حافظهٔ ایجنت | AgentMemory | همان |
| تختهٔ سیاه | Blackboard | `src/lib/intelligence/blackboard.ts` |
| حلقهٔ سرنوشت | core-cycle / outcome-loop | `src/lib/intelligence/` |
| دیمن مغز | intelligence daemon | `lib/intelligence/daemon.ts` |
| دیمن کاتالوگ/پایدارساز | catalog daemon | `lib/melk-api/catalog-daemon.ts` |
| نقطهٔ ازسرگیری | checkpoint (SyncCheckpoint) | `prisma/schema.prisma` |
| نامهٔ مرده | SyncDeadLetter | همان |
| غنی‌سازی | enrichment (tx-enrichment/expert-enrichment) | `src/lib/melk-api/` |
| فایل مناطق | AreasFileCell | `tiles/arm-request/` |
| شعبه | branch (branches.ts) | `src/lib/branches.ts` |
| دامنهٔ دسترسی | accessScope / ConsultantScope | `src/lib/access/scope.ts` |
| خودتشخیصی | P10 (p10-core) | `src/core/intelligence/p10-core.ts` |
| خودترمیمی | P11 (p11-core) | `src/core/intelligence/p11-core.ts` |
| مهر نسخه / شاهد بیلد | build witness | `src/lib/build-witness.ts` |
| گارد تازگی | verify-deploy-freshness.sh | `scripts/` |
| بستهٔ بقا | survival package | `upload/.survival/` |
| زنجیرهٔ هش بسته‌ها | CHAIN.txt (chainIndex) | هر بستهٔ بقا |
| قانون دادهٔ مقدس | Data Sacredness Law | فصل ۲۵٫۳ |
| قانون تثبیت ۲٫۰ | Stabilization Law 2.0 (۰۳۵-A) | فصل ۲۵٫۲ |
| قانون ظاهر فاخر | Luxury Law (۰۳۵-B) | فصل ۹ |
| وضعیت‌های آگهی | LISTING_STATES | `src/lib/listing-status.ts` |
| وضعیت‌های درخواست | REQUEST_STATES | `src/lib/request-status.ts` |
| تقویم هجری شمسی | jalali | `src/lib/jalali.ts` |
| فارسی‌سازی اعداد | faNumber/faPrice | `src/lib/format.ts` |
| رندر پنجره‌ای | virtual window (TableBodyVirtual) | `src/lib/virtual-window.ts` |
| یکسان‌سازی ورودی | normalize-input | `src/lib/normalize-input.ts` |
| پالت ۱۳×۵ | palette13 | `src/lib/palette13.json` |
| کارگر شتاب‌دهنده | accelerate worker (m2-worker) | `scripts/p6549/` |
| بازگشت سیاست | policy rollback | `/api/agent/[tileId]/policy` |

---

# پیوست ۵ — چک‌لیست بازسازی سریع (برای تسک تازه)

۱. `bun install` → سبز.
۲. `.env.example` را به `.env.local` کپی و `MASTER_ACCESS_CODE` + `MELK_TOKEN_KEY` (و در تولید `DATABASE_URL`) مقدار دهید.
۳. `bun run db:generate && bun run db:push` — اسکیمای ۳۹ مدل ساخته می‌شود (بدون داده).
۴. `bunx tsc --noEmit` → صفر خطا · `bun run test` → سبز (پایگاه تست خودکار).
۵. `bun run dev` → ورود با کد مدیر → خانهٔ پنج‌کاشی‌ای.
۶. `bun run build` → BUILD_ID خودکار `<sha>-<date>-<time>`.
۷. اتصال سامانه‌ها: تنظیمات عمومی → اتصال ملک تبریز (ورود با کد پرسنلی واقعی → OTP → توکن در Vault) → دیمن کاتالوگ خودکار داده می‌کشد.
۸. برای جزئیات هر گام: همین سند + `REBUILD-LETTER.md`.

---

# پیوست ۶ — کتابخانه‌های عرضی یکتا (متن کامل)

> پنج فایل کوچک اما «منبع یگانه» — هر تغییر رفتار فارسی/زمانی/پنجره‌ای فقط از همین‌ها:

## پیوست ۶٫۱ — تقویم هجری شمسی (`src/lib/jalali.ts` — ۳۰۲ خط)

```ts
/**
 * تقویم هجری شمسی (جلالی) — هسته مشترک کل اپلیکیشن
 * ------------------------------------------------------
 * تمام محاسبات، قالب‌بندی و اجزای تقویم شمسی از این ماژول استفاده
 * می‌کنند (تک‌منبع حقیقت). این ماژول «خالص» است: هیچ وابستگی به
 * سرور یا کلاینت ندارد و در هر دو محیط قابل استفاده است.
 *
 * الگوریتم تبدیل: روش استاندارد جلالی↔میلادی (کیک‌جبر دوطرفه).
 * مبنای زمانی: زمان محلی کاربر برای نمایش، و UTC برای ISO.
 */

// ===================== نام‌ها =====================

/** نام ماه‌های هجری شمسی */
export const JALALI_MONTHS = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
] as const;

/** نام روزهای هفته — شنبه اولین روز هفته ایرانی است */
export const JALALI_WEEKDAYS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"] as const;

/** حروف اختصاری روزهای هفته برای سربرگ تقویم */
export const JALALI_WEEKDAYS_SHORT = ["ش", "ی", "د", "س", "چ", "پ", "ج"] as const;

// ===================== تبدیل تاریخ =====================

/** میلادی → جلالی (سال، ماه، روز) */
export function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = gy <= 1600 ? 0 : 979;
  gy -= gy <= 1600 ? 621 : 1600;
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    365 * gy +
    Math.floor((gy2 + 3) / 4) -
    Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400) -
    80 +
    gd +
    g_d_m[gm - 1];
  jy += 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return [jy, jm, jd];
}

/** جلالی → میلادی (سال، ماه، روز) */
export function jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number] {
  let gy = jy <= 979 ? 621 : 1600;
  jy -= jy <= 979 ? 0 : 979;
  let days =
    365 * jy +
    Math.floor(jy / 33) * 8 +
    Math.floor(((jy % 33) + 3) / 4) +
    78 +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  gy += 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const sal_a = [
    0,
    31,
    (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  let gm = 0;
  while (gm < 13 && gd > sal_a[gm]) {
    gd -= sal_a[gm];
    gm++;
  }
  return [gy, gm, gd];
}

/** سال کبیسه جلالی است؟ (برای طول اسفند) */
export function isJalaliLeap(jy: number): boolean {
  // الگوریتم ۳۳ ساله با باقیمانده‌های کبیسه ۱، ۵، ۹، ۱۳، ۱۷، ۲۲، ۲۶، ۳۰
  const r = jy % 33;
  return [1, 5, 9, 13, 17, 22, 26, 30].includes(r);
}

/** طول ماه جلالی (۳۱ برای ۶ ماه اول، ۳۰ برای ۵ ماه بعد، ۲۹/۳۰ اسفند) */
export function jalaliMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isJalaliLeap(jy) ? 30 : 29;
}

// ===================== انواع کمکی =====================

/** تاریخ جلالی به‌همراه روز هفته (۰ = شنبه) */
export interface JalaliDate {
  jy: number;
  jm: number;
  jd: number;
  /** ۰ = شنبه … ۶ = جمعه */
  weekday: number;
}

/** تبدیل Date به JalaliDate (بر پایه زمان محلی) */
export function dateToJalali(d: Date): JalaliDate {
  const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  // getDay(): ۰=یکشنبه…۶=شنبه → نگاشت به ۰=شنبه…۶=جمعه
  const weekday = (d.getDay() + 1) % 7;
  return { jy, jm, jd, weekday };
}

/** ساخت Date میلادی از مختصات جلالی (بدون ساعت — زمان محلی) */
export function jalaliToDate(jy: number, jm: number, jd: number): Date {
  const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd);
  return new Date(gy, gm - 1, gd, 12, 0, 0, 0);
}

/** تاریخ امروز به جلالی */
export function todayJalali(): JalaliDate {
  return dateToJalali(new Date());
}

// ===================== قالب‌بندی =====================

const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

/** تبدیل ارقام لاتین به فارسی */
export function faDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

/** تبدیل ارقام فارسی/عربی به لاتین (برای ورودی کاربر) */
export function enDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

/** دو رقمی با صفر پیشوند */
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** برچسب ماه جلالی از ISO/Date: «شهریور ۱۴۰۵» */
export function faJalaliMonthLabel(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "—";
  return jalaliMonthLabelOf(d);
}

/** جلالی خوانا: «۲۱ شهریور ۱۴۰۵» */
export function formatJalaliLong(j: JalaliDate): string {
  return `${faDigits(j.jd)} ${JALALI_MONTHS[j.jm - 1]} ${faDigits(j.jy)}`;
}

/** جلالی کوتاه: «۱۴۰۵/۰۶/۲۱» */
export function formatJalaliShort(j: JalaliDate): string {
  return faDigits(`${j.jy}/${pad2(j.jm)}/${pad2(j.jd)}`);
}

/** جلالی کوتاه با ساعت: «۱۴۰۵/۰۶/۲۱ — ۱۴:۳۰» */
export function formatJalaliShortDateTime(d: Date): string {
  const j = dateToJalali(d);
  return `${formatJalaliShort(j)} — ${faDigits(pad2(d.getHours()))}:${faDigits(pad2(d.getMinutes()))}`;
}

/** جلالی خوانا + ساعت: «۲۱ شهریور ۱۴۰۵ — ساعت ۱۴:۳۰» */
export function formatJalaliLongDateTime(d: Date): string {
  const j = dateToJalali(d);
  return `${formatJalaliLong(j)} — ساعت ${faDigits(pad2(d.getHours()))}:${faDigits(pad2(d.getMinutes()))}`;
}

/** ISO/Date → رشته جلالی «YYYY/MM/DD» برای پارامترهای API سامانه ملک تبریز */
export function isoToJalaliString(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "";
  const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return `${jy}/${pad2(jm)}/${pad2(jd)}`;
}

/**
 * تاریخ ورودی سامانه (جلالی «YYYY/MM/DD» یا ISO) → Date میلادی (زمان محلی ظهر)
 * ارقام فارسی/عربی هم پذیرفته می‌شوند.
 */
export function anyDateStringToDate(input: unknown): Date | null {
  if (input === null || input === undefined) return null;
  let s = String(input).trim();
  if (!s) return null;
  s = s
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  s = s.replace(/[-.]/g, "/");

  if (/\d{4}-\d{2}-\d{2}T/.test(String(input))) {
    const d = new Date(String(input));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const parts = s.split("/").map((p) => Number(p));
  if (parts.length < 3 || parts.some((p) => !Number.isFinite(p))) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const [y, m, dd] = parts;
  if (y > 1300 && y < 1600) {
    // جلالی
    return jalaliToDate(y, m, dd);
  }
  return new Date(y, m - 1, dd, 12, 0, 0, 0);
}

/** برچسب ماه جلالی از تاریخ ISO: «شهریور ۱۴۰۵» */
export function jalaliMonthLabelOf(d: Date): string {
  const j = dateToJalali(d);
  return `${JALALI_MONTHS[j.jm - 1]} ${faDigits(j.jy)}`;
}

// ===================== تقویم ماهانه (برای کامپوننت انتخاب تاریخ) =====================

export interface JalaliMonthCell {
  jd: number;
  /** ۰ = شنبه … ۶ = جمعه */
  weekday: number;
  /** در ماه نمایشی جاری نیست (روز ماه قبل/بعد) */
  inMonth: boolean;
  /** تاریخ میلادی متناظر برای مقایسه */
  date: Date;
  /** امروز است؟ */
  isToday: boolean;
}

/** سلول‌های نمایشی یک ماه جلالی (۴۲ سلول = ۶ هفته؛ شروع از شنبه) */
export function buildJalaliMonthGrid(jy: number, jm: number): JalaliMonthCell[] {
  const today = todayJalali();
  const firstDate = jalaliToDate(jy, jm, 1);
  // ستون شروع: ۰=شنبه
  const startOffset = (firstDate.getDay() + 1) % 7;
  const cells: JalaliMonthCell[] = [];
  const len = jalaliMonthLength(jy, jm);
  // روزهای ماه قبل برای پرکردن هفته اول
  const prevMonth = jm === 1 ? { jy: jy - 1, jm: 12 } : { jy, jm: jm - 1 };
  const prevLen = jalaliMonthLength(prevMonth.jy, prevMonth.jm);
  for (let i = startOffset - 1; i >= 0; i--) {
    const jd = prevLen - i;
    const date = jalaliToDate(prevMonth.jy, prevMonth.jm, jd);
    cells.push({ jd, weekday: cells.length % 7, inMonth: false, date, isToday: false });
  }
  // روزهای ماه جاری
  for (let jd = 1; jd <= len; jd++) {
    const date = jalaliToDate(jy, jm, jd);
    cells.push({
      jd,
      weekday: cells.length % 7,
      inMonth: true,
      date,
      isToday: today.jy === jy && today.jm === jm && today.jd === jd,
    });
  }
  // روزهای ماه بعد تا تکمیل ۶ هفته
  const nextMonth = jm === 12 ? { jy: jy + 1, jm: 1 } : { jy, jm: jm + 1 };
  let nextJd = 1;
  while (cells.length < 42) {
    const date = jalaliToDate(nextMonth.jy, nextMonth.jm, nextJd);
    cells.push({ jd: nextJd, weekday: cells.length % 7, inMonth: false, date, isToday: false });
    nextJd += 1;
  }
  return cells;
}
```

## پیوست ۶٫۲ — یکسان‌سازی ورودی (`src/lib/normalize-input.ts` — ۷۲ خط)

```ts
/**
 * قانون یکسان‌سازی ورودی (P6525 — دستور مالک ۱۴۰۵/۰۷/۰۵)
 * =========================================================
 * ریشهٔ ایجاد: باگ تاریخی ۴/۵ — چهار فایل رشتهٔ «۰۱۲۳۵۴۶۷۸۹» را با جابه‌جاییِ
 * ۴ و ۵ داشتند (indexOf → ۵↦4 و ۴↦5)؛ جست‌وجوی «۵۹۱۵» به «4915» ترجمه می‌شد
 * و صفر نتیجه می‌داد. شاهد زندهٔ پیش از رفع: کد ۵۹۲۵۲ با ارقام فارسی = ۰ ردیف،
 * با ارقام لاتین = ۱ ردیف.
 *
 * قانون این ماژول (برای همیشه — منبع یگانه):
 *   ۱. نتیجهٔ نگاشت ارقام فارسی (۰-۹)، عربی (٠-٩) و لاتین (0-9) همیشه یکسان است.
 *   ۲. حروف عربی/فارسی هم‌ارز (ي↔ی، ك↔ک) یکسان دیده می‌شوند (بررسی نکتهٔ مالک).
 *   ۳. هیچ نگاشت مبتنی بر «رشتهٔ ترتیبی + indexOf» خارج از این فایل مجاز نیست —
 *      گارد تست P6525 هر رشتهٔ ده‌رقمی غیرترتیبی در src را قرمز می‌کند.
 */

/** ارقام فارسی به ترتیب مقدار — هرگز ترتیب را تغییر ندهید؛ گارد تست مراقب است */
const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
/** ارقام عربی به ترتیب مقدار — هرگز ترتیب را تغییر ندهید؛ گارد تست مراقب است */
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** نگاشت یک رقم فارسی/عربی به لاتین — بر پایهٔ موقعیت در رشتهٔ مرتب */
const FA_TO_LATIN = new Map<string, string>(
  Array.from(FA_DIGITS, (ch, i) => [ch, String(i)] as const).concat(
    Array.from(AR_DIGITS, (ch, i) => [ch, String(i)] as const)
  )
);

/** نگاشت حروف عربی → هم‌ارز فارسی (نکتهٔ ۲ مالک — ی/ي و ک/ك) */
const AR_TO_FA_LETTERS: ReadonlyMap<string, string> = new Map([
  ["\u064A", "\u06CC"], // ي (Arabic yeh) → ی (Farsi yeh)
  ["\u0643", "\u06A9"], // ك (Arabic kaf) → ک (Farsi keh)
]);

/**
 * ارقام فارسی/عربی → لاتین (بقیهٔ نویسه‌ها دست‌نخورده).
 * ورودی تهی → رشتهٔ خالی. deterministic و بدون وابستگی.
 */
export function normalizeFaDigits(input: string | null | undefined): string {
  if (!input) return "";
  let out = "";
  for (const ch of input) {
    const latin = FA_TO_LATIN.get(ch);
    out += latin ?? ch;
  }
  return out;
}

/**
 * حروف عربی → هم‌ارز فارسی (ي→ی، ك→ک).
 * برای فیلترهای نام: کاربر هر دو شکل را تایپ می‌کند و نتیجه باید یکسان باشد.
 */
export function normalizeFaLetters(input: string | null | undefined): string {
  if (!input) return "";
  let out = "";
  for (const ch of input) {
    out += AR_TO_FA_LETTERS.get(ch) ?? ch;
  }
  return out;
}

/**
 * نرمال‌سازی کامل ورودی فیلترهای فهرست‌ها (قانون P6525):
 *   ارقام → لاتین + حروف عربی → فارسی + نیم‌فاصله → فاصله + فشرده‌سازی فاصله‌ها + trim.
 * این تابع جای هر نگاشت درون‌خطی ارقام/حروف در مسیر فیلتر را گرفته است.
 */
export function normalizeFilterInput(input: string | null | undefined): string {
  if (!input) return "";
  return normalizeFaLetters(normalizeFaDigits(input))
    .replace(/\u200C/g, " ") // نیم‌فاصله → فاصله (هم‌ارزی فرم‌های DB و کاربر)
    .replace(/\s+/g, " ")
    .trim();
}
```

## پیوست ۶٫۳ — فارسی‌سازی نمایش (`src/lib/format.ts` — ۱۰۴ خط)

```ts
/**
 * قالب‌بندی فارسی — اعداد، مبالغ، تاریخ (هجری شمسی)
 * ------------------------------------------------------
 * تمام نمایش عددی اپلیکیشن با ارقام فارسی است (تک‌زبانه: فارسی).
 * تمام تاریخ‌ها با تقویم هجری شمسی (جلالی) نمایش داده می‌شوند؛
 * محاسبات تقویم در «src/lib/jalali.ts» (تک‌منبع حقیقت) انجام می‌شود.
 */

import { dateToJalali, enDigits, faDigits, formatJalaliLong, formatJalaliLongDateTime, formatJalaliShort, formatJalaliShortDateTime } from "./jalali";

export { enDigits, faDigits };

/** تاریخ شمسی خوانا از ISO/Date: «۲۱ شهریور ۱۴۰۵» */
export function faDate(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "—";
  return formatJalaliLong(dateToJalali(d));
}

/** تاریخ شمسی کوتاه: «۱۴۰۵/۰۶/۲۱» — مناسب جدول‌ها */
export function faJalaliShort(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "—";
  return formatJalaliShort(dateToJalali(d));
}

/** تاریخ + ساعت شمسی خوانا: «۲۱ شهریور ۱۴۰۵ — ساعت ۱۴:۳۰» */
export function faDateTime(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "—";
  return formatJalaliLongDateTime(d);
}

/** تاریخ + ساعت شمسی فشرده: «۱۴۰۵/۰۶/۲۱ — ۱۴:۳۰» */
export function faJalaliShortDateTime(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "—";
  return formatJalaliShortDateTime(d);
}

/** برچسب ماه شمسی از کلید ماه جلالی «yyyy-mm»: «شهریور ۱۴۰۵» */
export function faMonthLabel(jalaliMonthKey: string): string {
  const [y, m] = jalaliMonthKey.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return jalaliMonthKey;
  return `${["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"][m - 1]} ${faDigits(y)}`;
}

// ===================== اعداد و مبالغ =====================

const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

function faDigitsLocal(input: string | number): string {
  return String(input).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

/** مبلغ تومانی خوانا: ۲٫۵ میلیارد تومان */
export function faToman(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const faDec = (s: string) => faDigitsLocal(s).replace(".", "٫");
  if (n >= 1_000_000_000_000) return `${faDec((n / 1_000_000_000_000).toFixed(1))} همت`;
  if (n >= 1_000_000_000) return `${faDec((n / 1_000_000_000).toFixed(1).replace(/\.0$/, ""))} میلیارد تومان`;
  if (n >= 1_000_000) return `${faNumber(Math.round(n / 1_000_000))} میلیون تومان`;
  return `${faNumber(n)} تومان`;
}

/** عدد با جداکننده هزارگان فارسی
 *  P6.5-12 (نکتهٔ ۱ دستور مالک): جداکننده در کل اپ «،» است — عین نمونهٔ دستور:
 *  ۲۰۰،۰۰۰،۰۰۰،۰۰۰ تومان */
export function faNumber(n: number): string {
  return faDigitsLocal(Math.round(n).toLocaleString("en-US")).replace(/,/g, "،");
}

/** P6.5-12 — مبلغ با تمام ارقام و جداکنندهٔ «،»: «۱۹،۳۰۰،۰۰۰،۰۰۰ تومان»
 *  (بدون خلاصه‌سازی میلیارد/میلیون — عین نمونهٔ دستور مالک) */
export function faAmountFull(n: number | null | undefined, unit = " تومان"): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${faNumber(n)}${unit}`;
}

/** درصد فارسی */
export function faPercent(n: number): string {
  return `${faDigitsLocal(n.toLocaleString("en-US"))}٪`;
}

// ===================== فاصله زمانی نسبی =====================

/** فاصله زمانی نسبی فارسی: «امروز»، «۱۲ روز پیش» */
export function faRelative(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "امروز";
  if (days < 30) return `${faDigitsLocal(days)} روز پیش`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${faDigitsLocal(months)} ماه پیش`;
  return `${faDigitsLocal(Math.floor(months / 12))} سال پیش`;
}

/** مبلغ تومانی دقیق با جداکننده هزارگان: «۶٬۷۵۰٬۰۰۰ تومان» — مناسب قبض کمیسیون */
export function faTomanExact(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${faNumber(n)} تومان`;
}
```

## پیوست ۶٫۴ — ریاضیات رندر پنجره‌ای (`src/lib/virtual-window.ts` — ۱۰۵ خط)

```ts
/* ============================================================================
 * P6527 — پنجره‌یابی فهرست‌های بزرگ (منطق خالص — بدون DOM)
 * ============================================================================
 * ریشه‌یابی «preview در موبایل کار نمی‌کند»: کاشی M1 (۱۱٬۳۹۸ ردیف) و M2 (۷٬۳۱۴ ردیف)
 * همهٔ ردیف‌ها را همزمان در DOM می‌ساختند؛ مرورگر موبایل (اندروید) هنگام باز شدن
 * کاشی فریز/کرش می‌شد (شاهد زنده: کرش تکرارشدنی Chrome هدلس در همین کانتینر).
 *
 * راه‌حل وفادار به «قانون همیشگی فهرست‌ها» (AGENTS.md §۶):
 *   فهرست همچنان تک‌صفحه‌ای است — تمام ردیف‌ها با یک اسکرول در دسترس‌اند،
 *   ارتفاع کل (اسکرول‌بار) عین تعداد کل ردیف‌هاست، فقط «رندر» پنجره‌ای می‌شود:
 *   در هر لحظه ~۴۰ ردیفِ قابل‌دیدن + دو فاصله‌گذار (spacer) در DOM هست.
 *   ⇒ بارگذاری فوری + اسکرول سریع در هر اندازهٔ فهرست (قانون بندهای ۲ و ۴).
 *
 * این ماژول «منبع یگانهٔ» محاسبات پنجره است تا تست‌پذیر باشد (بدون jsdom).
 */

/** سقف رندر ساده: فهرست‌های تا این اندازه بدون پنجره‌یابی، عیناً رندر می‌شوند */
export const PLAIN_RENDER_MAX = 200;

/** ارتفاع تخمینی پیش‌فرض هر ردیف تا پیش از اندازه‌گیری (px) */
export const DEFAULT_ROW_HEIGHT = 44;

/** ردیف‌های اضافی بالا/پایین پنجرهٔ دید تا اسکرول سریع بدون چشمک باشد */
export const OVERSCAN_ROWS = 8;

/** ارتفاع دید پیش‌فرض تا پیش از اندازه‌گیری ظرف (px) — حدس محافظه‌کارانهٔ موبایل/دسکتاپ */
export const DEFAULT_VIEWPORT_HEIGHT = 640;

export interface VirtualWindow {
  /** نخستین اندیس رندرشده (شامل overscan) */
  start: number;
 /** یکی پس از آخرین اندیس رندرشده (شامل overscan) */
  end: number;
  /** ارتفاع فاصله‌گذار بالای پنجره (px) */
  topPad: number;
  /** ارتفاع فاصله‌گذار پایین پنجره (px) */
  bottomPad: number;
  /** ارتفاع کل فهرست = مجموع ارتفاع همهٔ ردیف‌ها (px) — عین هندسهٔ اسکرول‌بار */
  totalHeight: number;
}

/**
 * محاسبهٔ پنجرهٔ رندر — همهٔ ارتفاع‌ها از آرایهٔ اندازه‌گیری‌شده؛
 * خانه‌های تهی/نا معتبر = DEFAULT_ROW_HEIGHT.
 */
export function computeVirtualWindow(params: {
  count: number;
  scrollTop: number;
  viewportHeight: number;
  heights?: ArrayLike<number | undefined>;
  defaultRowHeight?: number;
  overscan?: number;
}): VirtualWindow {
  const { count, heights } = params;
  const defaultRowHeight = params.defaultRowHeight ?? DEFAULT_ROW_HEIGHT;
  const overscan = params.overscan ?? OVERSCAN_ROWS;
  // تا پیش از اندازه‌گیری ظرف، دیدِ حدسی (پس از mount بلافاصله تصحیح می‌شود)
  const viewportHeight = params.viewportHeight > 0 ? params.viewportHeight : DEFAULT_VIEWPORT_HEIGHT;
  const scrollTop = Math.max(0, params.scrollTop);

  const heightOf = (i: number): number => {
    const h = heights?.[i];
    return typeof h === "number" && h > 0 ? h : defaultRowHeight;
  };

  // جبههٔ تجمعی: prefix[i] = مجموع ارتفاع ردیف‌های ۰..i-1
  const prefix = new Array<number>(count + 1);
  prefix[0] = 0;
  for (let i = 0; i < count; i += 1) prefix[i + 1] = prefix[i] + heightOf(i);
  const totalHeight = prefix[count];

  if (count === 0) {
    return { start: 0, end: 0, topPad: 0, bottomPad: 0, totalHeight: 0 };
  }

  // نخستین ردیفی که کف آن در محدودهٔ دید است (جست‌وجوی دودویی روی prefix)
  // پیش‌فرض = آخرین ردیف (اگر اسکرول از انتهای فهرست گذشته باشد — دفاعی)
  let start = count - 1;
  let lo = 0;
  let hi = count - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (prefix[mid + 1] <= scrollTop) lo = mid + 1;
    else {
      start = mid;
      hi = mid - 1;
    }
  }
  // آخرین ردیفی که سقف آن هنوز در دید است
  let end = start;
  const viewBottom = scrollTop + viewportHeight;
  while (end < count && prefix[end] < viewBottom) end += 1;

  // overscan با ترتیب کلاه‌برداری‌ناپذیر (clamp)
  const startFinal = Math.max(0, start - overscan);
  const endFinal = Math.min(count, end + overscan);

  return {
    start: startFinal,
    end: endFinal,
    topPad: prefix[startFinal],
    bottomPad: Math.max(0, totalHeight - prefix[endFinal]),
    totalHeight,
  };
}
```

## پیوست ۶٫۵ — حلقهٔ شعبه (`src/lib/branches.ts` — ۱۱۴ خط)

```ts
/**
 * رجیستری شعب ملک تبریز — P6530 / گام ۱ (دستور مالک ۱۴۰۵/۰۷/۹ — نکته ۲)
 * ---------------------------------------------------------------------------
 * ملک تبریز دارای چهار شعبه است (عین دستور مالک):
 *   ارتش · باغلارباغی · ملکی تبریزی · هتل مرمر
 *
 * ستون «شعبه» در فهرست‌های M1/M2/M4 = محل فعالیت کارشناس در شعب ملک تبریز.
 *
 * زنجیرهٔ تفکیک شعبه هر کارشناس (به‌ترتیب اعتبار):
 *   ۱) نقشهٔ دستی مالک — AppMeta کلید «expert-branch-map» (JSON: {نام کارشناس: شعبه})
 *      — قابل ویرایش توسط مالک بدون تغییر کد (شاهد: روت /api/crm/branches)
 *   ۲) دادهٔ سامانه‌های ARM/PM — businessId.title کارشناس اگر با نام یکی از شعب
 *      منطبق باشد (شاهد فعلی DB: «شعبه مرکزی» و «ملک تبریز» = نام شعبه نیستند)
 *   ۳) خروجی نهایی وقتی هیچ منبعی شعبه را نداده: «تعیین نشده» — نمایش صادقانه؛
 *      با اتصال تازهٔ ARM/PM و ارائهٔ دادهٔ شعبه در سامانه‌ها، خودکار پر می‌شود
 *
 * این ماژول صفر وابستگی به DB دارد (خالص — قابل تست)؛ خواندن نقشهٔ مالک در
 * لایهٔ روت انجام می‌شود و به‌عنوان override پاس داده می‌شود.
 */

/** چهار شعبهٔ ملک تبریز — عین نکته ۲ دستور مالک */
export const TABRIZ_BRANCHES: readonly string[] = ["ارتش", "باغلارباغی", "ملکی تبریزی", "هتل مرمر"] as const;

/** برچسب حالت «شعبه تعیین نشده» — نمایش صادقانه تا ارائهٔ داده توسط سامانه‌ها */
export const BRANCH_UNSET = "تعیین نشده";

/** نرمال‌سازی متن برای مقایسهٔ نام شعبه (نیم‌فاصله/فاصله + ارقام + ي/ك) */
export function normalizeBranchText(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/\u200c/g, " ")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u06F0-\u06F9\u0660-\u0669]/g, (d) =>
      String("۰۱۲۳۴۵۶۷۸۹".indexOf(d) >= 0 ? "۰۱۲۳۴۵۶۷۸۹".indexOf(d) : Number(d.charCodeAt(0) - 0x0660))
    )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * آیا businessId.title سامانه‌های ARM/PM نام یکی از شعب ملک تبریز است؟
 * شاهد DB: مقدار فعلی همهٔ رکوردها «شعبه مرکزی» (ARM) یا «ملک تبریز» (PM) است —
 * اینها نام شعبه نیستند؛ اما اگر سامانه در آینده نام واقعی شعبه را ارائه کند،
 * همین‌جا شناسایی و استفاده می‌شود (صفر نگاشت اختراعی).
 */
export function matchTabrizBranch(businessTitle: string | null | undefined): string | null {
  const t = normalizeBranchText(businessTitle);
  if (!t) return null;
  for (const b of TABRIZ_BRANCHES) {
    if (normalizeBranchText(b) === t) return b;
  }
  return null;
}

/**
 * تفکیک شعبهٔ یک کارشناس — زنجیرهٔ کامل (خالص و قابل تست).
 * P6547/گام یک-۵ و گام چهارم-۱ — «اطلاعات ستون شعبه از سامانه pm استخراج گردد»:
 *   شعبهٔ PM (branchId.title از realtors/info/personnelInfo — کشف زندهٔ ۱۴۰۵/۰۷/۱۲)
 *   منبع اصلی شد و در صدر زنجیره نشست.
 * @param expertName نام کارشناس (کلید تطبیق پرسنل PM + نقشهٔ مالک)
 * @param pmBranchMap نقشهٔ نام→شعبه از رجیستری پرسنل PM (branchTitle — منبع اصلی)
 * @param ownerMap نقشهٔ دستی مالک (اختیاری — مکمل برای پرسنلِ فاقد شعبه در PM)
 * @param systemBusinessTitle businessId.title از ARM/PM (اختیاری)
 */
export function resolveExpertBranch(
  expertName: string | null | undefined,
  ownerMap?: Record<string, string> | null,
  systemBusinessTitle?: string | null,
  pmBranchMap?: Record<string, string> | null
): { branch: string; source: "pm" | "owner-map" | "system" | "unset" } {
  if (expertName) {
    // ۰) P6547 — سامانهٔ PM: منبع اصلی ستون شعبه (عین دستور مالک)
    if (pmBranchMap) {
      const direct = pmBranchMap[expertName];
      if (direct && TABRIZ_BRANCHES.includes(direct)) return { branch: direct, source: "pm" };
      const norm = normalizeBranchText(expertName);
      for (const [k, v] of Object.entries(pmBranchMap)) {
        if (normalizeBranchText(k) === norm && TABRIZ_BRANCHES.includes(v)) {
          return { branch: v, source: "pm" };
        }
      }
    }
    // ۱) نقشهٔ مالک — مکمل (پرسنلی که PM شعبه‌اش را نداده)
    if (ownerMap) {
      const direct = ownerMap[expertName];
      if (direct && TABRIZ_BRANCHES.includes(direct)) return { branch: direct, source: "owner-map" };
      // جست‌وجوی نرمال‌شده (ي/ك/نیم‌فاصله)
      const norm = normalizeBranchText(expertName);
      for (const [k, v] of Object.entries(ownerMap)) {
        if (normalizeBranchText(k) === norm && TABRIZ_BRANCHES.includes(v)) {
          return { branch: v, source: "owner-map" };
        }
      }
    }
  }
  // ۲) دادهٔ سامانه — فقط اگر واقعاً نام شعبه باشد
  const fromSystem = matchTabrizBranch(systemBusinessTitle);
  if (fromSystem) return { branch: fromSystem, source: "system" };
  // ۳) تعیین نشده
  return { branch: BRANCH_UNSET, source: "unset" };
}

/** اعتبارسنجی نقشهٔ مالک — مقادیر غیرمجاز حذف می‌شوند (گارد ورودی روت) */
export function sanitizeOwnerBranchMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof k === "string" && k.trim() !== "" && typeof v === "string" && TABRIZ_BRANCHES.includes(v)) {
      out[k.trim()] = v;
    }
  }
  return out;
}
```

## پیوست ۶٫۶ — دامنهٔ دسترسی مشاور (`src/lib/access/scope.ts` — ۱۶۰ خط)

```ts
/**
 * Helper مرکزی دامنهٔ دسترسی — P6.5-04-i (دستور چهارفازی مالک، فاز ۱)
 * ---------------------------------------------------------------------------
 * تک‌نقطهٔ تصمیم «چه کسی چه داده‌ای می‌بیند» — هر ۷ موجودیت داده از همین‌جا
 * دامنهٔ خود را می‌گیرند. هیچ مسیر خواندنی حق نوشتن فیلتر دامنه به‌صورت
 * دست‌نویس را ندارد (گارد ساختاری: scripts/audit-scope-usage.ts).
 *
 * قانون مالک (اعلامیهٔ ۵ §۱.۱۲ — «دادهٔ خودِ مالک»):
 *   نشست مالک (role=OWNER یا accessScope=OWNER) ⇒ صفر فیلتر دامنه روی
 *   «همهٔ» موجودیت‌ها — ۱۰۰٪ داده، صفر محدودیت کاشی (zero expert scope
 *   filtering, zero tile limits) — فقط شاهد owner.read در AuditLog.
 *
 * قانون مشاور (ماتریس §۵.۳ سند طراحی P6.5-02 — مصوب شورا، دست‌نخورده):
 *   · موجودیت‌های شخصی (listing / request / customer / visit):
 *     فقط ردیف‌های منتسب به خودش (actorCode/ownerCode)؛ شعبه برای BRANCH؛
 *     fail-closed روی کد تهی.
 *   · موجودیت‌های تجمیعی/سراسری (transaction / expert / contract /
 *     interaction / supply-demand / property): همهٔ دامنه‌ها همهٔ ردیف‌ها
 *     را می‌بینند (عین خود سامانه — گزارش‌های دپارتمانی).
 *
 * ✅ این فایل خالص است: صفر Prisma/db — خروجی فقط «بند دامنه» است؛
 *    نگاشت بند به ستون واقعی بر عهدهٔ لایهٔ مصرف‌کننده (store/repo) با
 *    قرارداد ثابت این فایل (ownerCode برای visit، actorCode برای بقیه).
 */

import {
  personalScopeClause,
  scopeFromSession,
  type AccessScope,
  type ScopeClause,
  type ScopeFilter,
} from "@/core/repositories";

// ===================== موجودیت‌های تحت دامنه =====================

/** موجودیت‌های دادهٔ تحت حاکمیت helper (۷ موجودیت دستور + مشتری/عرضه‌تقاضا از §۵.۳ + کاتالوگ‌های ARM از P6.5-10) */
export type ScopeEntity =
  | "transaction"
  | "expert"
  | "contract"
  | "interaction"
  | "visit"
  | "listing"
  | "request"
  | "customer"
  | "supply-demand"
  | "property"
  | "arm-request";

/**
 * ماتریس §۵.۳ (P6.5-02 — مصوب): شخصی در برابر تجمیعی.
 * شخصی: مشاور فقط خودش؛ مالک همه.
 * تجمیعی/سراسری: همهٔ دامنه‌ها همهٔ ردیف‌ها (گزارش دپارتمانی).
 */
const PERSONAL_ENTITIES: ReadonlySet<ScopeEntity> = new Set(["listing", "request", "customer", "visit"]);
const AGGREGATE_ENTITIES: ReadonlySet<ScopeEntity> = new Set([
  "transaction",
  "expert",
  "contract",
  "interaction",
  "supply-demand",
  "property",
  // P6.5-10 — کاتالوگ درخواست‌های ARM (کاشی «درخواست‌های ملک تبریز»):
  // عین property تجمیعی است — گزارش دپارتمانی عین خود سامانه؛ مالک همه را
  // بدون فیلتر می‌بیند (قانون مالک) و مشاوران گزارش سراسری می‌بینند (§۵.۳)
  "arm-request",
]);

/** ستون انتساب هر موجودیت شخصی (قرارداد §۵.۳) */
export const PERSONAL_SCOPE_COLUMN: Record<string, "actorCode" | "ownerCode"> = {
  listing: "actorCode",
  request: "actorCode",
  customer: "actorCode",
  visit: "ownerCode",
};

// ===================== شکل نشست =====================

/** شکل ساختاری نشست برای حل دامنه — SessionContext اپ و ردیف Prisma Session هر دو ارضا می‌کنند */
export interface AccessSession {
  personnelCode: string;
  /** نقش احراز هویت v1: OWNER (ورود مدیر/کد مدیر) | CONSULTANT (OTP) */
  role?: string | null;
  /** دامنهٔ داده (§۵.۱): OWNER | BRANCH | CONSULTANT */
  accessScope?: string | null;
  branchId?: string | null;
}

// ===================== نتیجهٔ دامنه =====================

/** خروجی helper برای یک موجودیت */
export interface EntityAccess<E extends ScopeEntity = ScopeEntity> {
  /** بند دامنه — ALL یعنی صفر فیلتر */
  clause: ScopeClause;
  /** فیلتر کامل برای AuditLog */
  filter: ScopeFilter;
  /** true = خواننده مالک است ⇒ شاهد owner.read (الزام دستور فاز ۱) */
  isOwnerRead: boolean;
  /** نام موجودیت (برای AuditLog) */
  entity: E;
}

/** آیا نشست مالک است؟ (role=OWNER یا accessScope=OWNER — دفاع دو-لایه) */
export function isOwnerSession(session: AccessSession): boolean {
  if (session.role === "OWNER") return true;
  return session.accessScope === "OWNER";
}

/**
 * حل دامنهٔ یک موجودیت برای یک نشست — تنها نقطهٔ ورود مسیرهای خواندن.
 * مالک ⇒ همیشه ALL (صفر فیلتر) روی همهٔ موجودیت‌ها.
 * مشاور ⇒ شخصی‌ها بند §۵.۳، تجمیعی‌ها ALL.
 */
export function resolveEntityAccess<E extends ScopeEntity>(session: AccessSession, entity: E): EntityAccess<E> {
  const filter = scopeFromSession(session);
  if (isOwnerSession(session)) {
    return { clause: { kind: "ALL" }, filter, isOwnerRead: true, entity };
  }
  if (AGGREGATE_ENTITIES.has(entity)) {
    return { clause: { kind: "ALL" }, filter, isOwnerRead: false, entity };
  }
  return { clause: personalScopeClause(filter), filter, isOwnerRead: false, entity };
}

/**
 * شرط دامنهٔ نوع-دار برای موجودیت‌های شخصی — ستون از قرارداد PERSONAL_SCOPE_COLUMN:
 * visit ⇒ ownerCode · بقیهٔ شخصی‌ها ⇒ actorCode · BRANCH ⇒ branchId.
 * undefined = بدون فیلتر (ALL) · null = DENY_ALL (fail-closed — هیچ ردیفی).
 */
export type PersonalWhere<E extends ScopeEntity> =
  E extends "visit"
    ? { ownerCode?: string; branchId?: string } | null | undefined
    : { actorCode?: string; branchId?: string } | null | undefined;

export function personalScopeWhere<E extends ScopeEntity>(access: EntityAccess<E>): PersonalWhere<E> {
  if (access.clause.kind === "ALL") return undefined as PersonalWhere<E>;
  if (access.clause.kind === "DENY_ALL") return null as PersonalWhere<E>;
  if (access.clause.kind === "BRANCH") return { branchId: access.clause.branchId } as PersonalWhere<E>;
  const column = PERSONAL_SCOPE_COLUMN[access.entity] ?? "actorCode";
  return { [column]: access.clause.code } as PersonalWhere<E>;
}

/** دامنهٔ متن رفع ابهام برای AuditLog (بدون داده حساس) */
export function describeAccess(access: EntityAccess): string {
  const base = `entity=${access.entity}; scope=${access.filter.accessScope}; clause=${access.clause.kind}`;
  if (access.isOwnerRead) return `${base}; ownerRead=true`;
  return base;
}

/**
 * مسیر ورود مالک برای شاهد owner.read (الزام فاز ۱):
 * personnelCode="OWNER" ⇒ ورود با کد مدیر (manager-code)؛
 * کد پرسنلی واقعی خود مالک (MANAGER_CODE) ⇒ ورود OTP از مسیر کارشناسان (expert-login).
 */
export function ownerLoginPath(session: AccessSession): "manager-code" | "expert-login" {
  return session.personnelCode === "OWNER" ? "manager-code" : "expert-login";
}

// re-export برای راحتی مصرف‌کننده‌ها (تک نقطهٔ import دامنه)
export type { AccessScope, ScopeClause, ScopeFilter };
```

---
---

# پیوست پایانی — شناسنامهٔ سند

| مورد | مقدار |
|---|---|
| نام سند | MELKA-SKELETON-COMPLETE-v1.0.md |
| شمار خطوط | 8,730 |
| شمار فصل‌ها | ۲۵ (۵ بخش) |
| فایل‌های کد جاسازی‌شدهٔ عینی | package.json, next.config.ts, tsconfig.json, src/core/tiles/tile-contract.ts, public/manifest.json, src/lib/palette13.json, DESIGN-SYSTEM.md, src/lib/intelligence/daemon.ts, src/core/agent/base-agent.ts, src/core/intelligence/p10-core.ts, src/core/intelligence/p11-core.ts, src/core/graphs/graph-service.ts, prisma/schema.prisma, src/core/repositories/interfaces/dto.ts, src/lib/melk-api/endpoints.ts, src/lib/melk-api/catalog-daemon.ts, src/lib/auth/crypto.ts, .env.example, AGENTS.md, docs/RECOVERY-POLICY.md, src/lib/jalali.ts, src/lib/normalize-input.ts, src/lib/format.ts, src/lib/virtual-window.ts, src/lib/branches.ts, src/lib/access/scope.ts |
| تاریخ مونتاژ | 2026-10-04 09:00 |
| پروندهٔ سازنده | P6550-skeleton-v2 (دستور ملکا-شورا-۱۴۰۵-۰۳۷) |
| قید | صفر داده، صفر توکن، صفر رمز |

**md5 سند:** (در MANIFEST.md5 بستهٔ سورس و بستهٔ بقا ثبت می‌شود)

> این سند به‌همراه `melka-source-v1.0-<date>.tar.gz` و `REBUILD-LETTER.md`، سه‌گانهٔ «بستهٔ انتقال کامل ملکا» را می‌سازد.
