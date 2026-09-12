# مستند معماری — داشبورد هوشمند چندعامله ملک تبریز

**مالک و برنامه‌نویس و طراح: سید نعمت اله سیدی**

این سند تصمیمات معماری، لایه‌های تخصصی، ساختار کامل پوشه/فایل و مسئولیت هر بخش را مستند می‌کند تا هر پنج نقش مرجع (معمار ارشد، مهندس اندروید، مهندس سیستم‌های چندعامله، مهندس امنیت، متخصص یکپارچه‌سازی API) بتوانند مستقلاً آن را بازبینی کنند.

---

## ۱) نمای کلی

```
┌──────────────────────────────────────────────────────────────┐
│  کلاینت (PWA — وب/اندروید/تبلت، فارسی RTL)                    │
│  SPA تک‌صفحه‌ای: ورود → خانه کاشی‌ای → صفحه کاشی               │
│  توکن رمزنگاری‌شده AES-GCM در کلاینت                          │
└───────────────┬──────────────────────────────────────────────┘
                │  فقط مسیرهای نسبی /api/* (BFF)
┌───────────────▼──────────────────────────────────────────────┐
│  لایه BFF (Next.js API Routes)                                │
│  auth │ crm │ agent │ connection │ health                     │
│  محدودسازی نرخ، نگهبان نشست، حسابرسی                          │
├──────────────┬───────────────────────┬───────────────────────┤
│  لایه ایجنت   │  لایه داده (Prisma)   │  لایه melk-api         │
│  یادگیرنده    │  کش CRM + حافظه       │  Provider (Mock/Real)  │
│  هر کاشی      │  Append-only          │  → arm.melketabriz.ir  │
│  مستقل        │  نسخه‌بندی سیاست      │  → pm.melketabriz.ir   │
└──────────────┴───────────────────────┴───────────────────────┘
```

**الگوی BFF (Backend-for-Frontend)** — تصمیم معمار ارشد: کلاینت هرگز مستقیماً به سامانه ملک تبریز وصل نمی‌شود. مزایا: (۱) توکن سامانه فقط سمت سرور می‌ماند، (۲) CORS مدیریت‌شده، (۳) با تغییر API سامانه ملک تبریز فقط لایه `src/lib/melk-api/` ویرایش می‌شود — این دقیقاً همان «لایه انتزاعی» الزامی سند طرح است.

## ۲) لایه‌های تخصصی

### ۲.۱) هسته کاشی/پلاگین (الزام ۵.۳ سند طرح)

قرارداد «کاشی بودن» در `src/core/tiles/tile-contract.ts`:

| فیلد | مسئولیت |
|---|---|
| `id` | شناسه پایدار — کلید ذخیره تنظیمات و ایزوله‌سازی ایجنت |
| `version` | نسخه ماژول کاشی |
| `title / tagline / description` | هویت کسب‌وکاری |
| `icon / accent` | هویت بصری |
| `component` | کامپوننت صفحه داخلی (props تزریقی هسته) |
| `settings[]` | **تنظیمات اختصاصی همان کاشی** (در Drawer همان صفحه — نه تنظیمات سراسری) |
| `agent` | اتصال ایجنت هوشمند (یا null برای کاشی تنظیمات) |
| `minRole` | کنترل دسترسی نقش (فقط OWNER) |

`TileRegistry` (`tile-registry.ts`) ثبت/حذف/فهرست‌بندی پویا را انجام می‌دهد با: اعتبارسنجی تعارض شناسه، فیلتر نقش، ترتیب نمایش. **افزودن کاشی جدید = ساخت یک ماژول در `core/tiles/tiles/<id>/` که `defineTile()` را صدا می‌زند + یک خط import در `bootstrap.ts`.** حذف = حذف همان خط. هیچ تغییری در هسته لازم نیست. این دقیقاً معماری پلاگین الزامی است و تست‌های `tests/tile-registry.test.ts` آن را تضمین می‌کنند.

### ۲.۲) لایه ایجنت هوشمند (بخش ۶ سند طرح)

`BaseLearningAgent` (`src/core/agent/base-agent.ts`) — سازوکار یادگیری واقعی و سه‌محرکه:

1. **حافظه Append-only**: جدول‌های `AgentMemory` و `AgentFeedback` — هرگز Update/Delete نیستند؛ هر رخداد یک ردیف جدید است (قابلیت حسابرسی کامل).
2. **بازیابی RAG اختصاصی کاشی**: `termVector` + `cosineSimilarity` روی متن بازخوردها و خاطرات؛ بینش جدید با خاطرات مشابه مقایسه می‌شود — بازخورد مثبتِ مشابه = تقویت وزن، منفی = تضعیف (در `renderInsights` اعمال می‌شود).
3. **سیاست نسخه‌بندی‌شده**: جدول `AgentPolicyVersion`. قاعده به‌روزرسانی: پس از حداقل ۵ بازخورد، اگر امتیاز یک دسته |score| ≥ ۲ باشد، وزن آن `+0.15×score` (مهار در بازه ۰٫۳–۱٫۸) تغییر می‌کند و **نسخه جدید** ساخته می‌شود؛ نسخه‌های قبلی حفظ و Rollback (فقط OWNER) ممکن است.

**ایزوله‌سازی**: کلید هر عمليات حافظه `tileId` است؛ تست «ایزوله‌سازی ایجنت‌ها» در `tests/agent.test.ts` اثبات می‌کند بازخورد ایجنت الف روی آمار ایجنت ب اثری ندارد.

**ایجنت‌های تخصصی**:
- `TransactionAgent` (کاشی معاملات): ۶ دسته بینش — TREND (روند ماهانه + رشد)، VOLUME، TOP_EXPERTS، DISTRICT، ANOMALY (z-score ≥ ۱٫۸)، CONVERSION (نرخ تبدیل درخواست→معامله).
- `ExpertAgent` (کاشی کارشناسان): ۵ دسته — RANKING، ACTIVITY (راکدان ۹۰ روزه)، SEGMENT (پیشتاز/پایدار/کم‌فعالیت/راکد)، RISK (افت شدید نسبت به روند شخصی)، CAPACITY (شاخص تمرکز درآمد ۵ نفر برتر).

تحلیل‌گرها توابع خالص در `analyzers.ts` هستند (بدون I/O) → کاملاً تست‌پذیر.

### ۲.۳) لایه امنیت (بخش ۴ سند طرح)

| جزء | فایل | تصمیم کلیدی |
|---|---|---|
| رمزنگاری | `lib/auth/crypto.ts` | توکن ۳۲ بایت؛ ذخیره هش SHA-256؛ `safeEqual` زمان-ثابت برای کد مدیر |
| محدودساز نرخ | `lib/auth/rate-limiter.ts` | پنجره لغزان مبتنی بر DB؛ قفل ۱۵ دقیقه‌ای پس از ۵ شکست |
| نشست | `lib/auth/session.ts` | عمر ۱۲ ساعت، چرخش توکن در Refresh، ابطال در Logout/Reset |
| ذخیره کلاینت | `lib/auth/secure-storage.ts` | AES-GCM با کلید دستگاه در IndexedDB (وب) — مسیر ارتقا به Keystore اندروید مستند شده |
| نگهبان | `lib/auth/guard.ts` | استخراج Bearer + پاسخ خطای استاندارد |
| حسابرسی | `AuditLog` | ورود/خروج/شکست/ریست — append-only |

### ۲.۴) لایه یکپارچه‌سازی API

`src/lib/melk-api/` — تنها نقطه وابسته به سامانه خارجی:

- `config.ts`: همه متغیرهای محیطی (MELK_API_MODE، آدرس‌ها، Timeout، کد مدیر...)
- `endpoints.ts`: رجیستری Endpoint (فرض مستند — ببینید API-INTEGRATION.md)
- `client.ts`: HTTP با AbortController timeout، retry نمایی، نرمال‌سازی خطا
- `mock-data.ts`: داده واقع‌نمای تبریز با RNG دانه‌دار (deterministic برای تست)
- `provider.ts`: قرارداد `MelkProvider` + پیاده‌سازی Mock/Real + کارخانه Singleton
- `sync.ts`: کش/همگام‌سازی داده CRM در Prisma (`ensureSeeded` / `resyncAll` / `resetCrmCache`)

استراتژی داده: **Extract-and-Cache** — فیلترهای سنگین و تحلیل ایجنت روی SQLite محلی اجرا می‌شوند تا بار روی سامانه ملک تبریز حداقل و سرعت داشبورد حداکثر باشد؛ دکمه «ریست اتصال» کش را پاک و مجدداً همگام می‌کند.

### ۲.۵) لایه کلاینت (مهندس اندروید)

- `page.tsx`: ماشین وضعیت SPA (`boot → auth → otp → home ⇄ tile`) — بدون route اضافه، سازگار با نصب PWA/WebView.
- `lib/client/store.ts`: Zustand + persist (فقط تنظیمات کاشی‌ها ماندگار؛ توکن جدا و رمزنگاری‌شده).
- `lib/client/api.ts`: تزریق خودکار Bearer، خروج خودکار در 401.
- PWA: `public/manifest.json` (RTL فارسی، آیکون‌های any/maskable) + `public/sw.js` (استاتیک cache-first، API همیشه شبکه) + `SwRegister`.
- ریسپانسیو: mobile-first؛ شبکه کاشی ۱/۲/۳ ستونه؛ هدف‌های لمسی ≥ ۴۴px؛ `viewport-fit=cover`.
- برای اندروید بومی: `capacitor.config.ts` آماده است — راهنمای کامل در BUILD-ANDROID.md.

## ۳) ساختار کامل پوشه/فایل

```
melk-tabriz-dashboard/
├── README.md
├── docs/
│   ├── ARCHITECTURE.md          # همین سند
│   ├── API-INTEGRATION.md        # اتصال به arm/pm.melketabriz.ir
│   └── BUILD-ANDROID.md          # Capacitor + TWA
├── capacitor.config.ts           # پیکربندی بسته‌بندی اندروید
├── prisma/schema.prisma          # شمای داده (۸ مدل)
├── public/
│   ├── manifest.json             # PWA
│   ├── sw.js                     # Service Worker
│   ├── fonts/                    # وزیرمتن محلی (۷ فایل woff2)
│   └── icons/                    # آیکون‌های PWA (any + maskable)
├── src/
│   ├── app/
│   │   ├── layout.tsx            # RTL + تم + متا
│   │   ├── page.tsx              # پوسته SPA
│   │   ├── globals.css           # پالت زمرد/کهربایی + فونت + RTL
│   │   └── api/
│   │       ├── auth/request-otp/route.ts
│   │       ├── auth/verify-otp/route.ts
│   │       ├── auth/master-login/route.ts
│   │       ├── auth/session/route.ts        # GET/PATCH/DELETE
│   │       ├── crm/transactions/route.ts
│   │       ├── crm/experts/route.ts
│   │       ├── crm/meta/route.ts
│   │       ├── agent/[tileId]/insight/route.ts
│   │       ├── agent/[tileId]/feedback/route.ts
│   │       ├── agent/[tileId]/stats/route.ts
│   │       ├── agent/[tileId]/policy/route.ts   # GET + POST rollback
│   │       ├── connection/status/route.ts
│   │       ├── connection/reset/route.ts
│   │       └── health/route.ts
│   ├── core/
│   │   ├── tiles/
│   │   │   ├── tile-contract.ts  # قرارداد کاشی + defineTile
│   │   │   ├── tile-registry.ts  # رجیستری پلاگین
│   │   │   ├── bootstrap.ts      # تنها نقطه import کاشی‌ها
│   │   │   └── tiles/
│   │   │       ├── transactions/ (index.ts + TransactionsPage.tsx)
│   │   │       ├── experts/      (index.ts + ExpertsPage.tsx)
│   │   │       └── settings/     (index.ts + SettingsPage.tsx)
│   │   └── agent/
│   │       ├── base-agent.ts     # BaseLearningAgent + RAG-lite
│   │       ├── analyzers.ts      # تحلیل‌گرهای خالص
│   │       ├── policy.ts         # انواع سیاست
│   │       ├── transaction-agent.ts
│   │       ├── expert-agent.ts
│   │       └── index.ts          # رجیستری ایجنت
│   ├── lib/
│   │   ├── melk-api/ (config, types, endpoints, client, mock-data, provider, sync, index)
│   │   ├── auth/     (crypto, rate-limiter, session, secure-storage, guard)
│   │   ├── client/   (api, store)
│   │   ├── format.ts # فارسی‌سازی
│   │   └── db.ts     # Prisma singleton
│   └── components/app/
│       ├── AuthScreen.tsx        # مرحله ۱ ورود + مسیر مدیر
│       ├── OtpScreen.tsx         # مرحله ۲ + شمارش معکوس
│       ├── DashboardHome.tsx     # شبکه کاشی‌ها
│       ├── AppHeader.tsx         # برندینگ/تم/حساب
│       ├── TileShell.tsx         # قاب کاشی + Drawer تنظیمات اختصاصی
│       ├── AgentPanel.tsx        # بینش‌ها + بازخورد + Rollback
│       └── SwRegister.tsx
└── tests/
    ├── crypto.test.ts            # ۱۱ تست امنیتی
    ├── format.test.ts            # فارسی‌سازی
    ├── tile-registry.test.ts     # معماری پلاگین
    ├── analyzers.test.ts         # تحلیل‌گرها + داده شبیه‌ساز
    ├── melk-api.test.ts          # فلوی احراز هویت + فیلترها
    └── agent.test.ts             # چرخه کامل یادگیری
```

## ۴) شمای داده (Prisma)

| مدل | نقش | ویژگی کلیدی |
|---|---|---|
| Session | نشست‌ها | tokenHash یکتا (SHA-256)، revoked/reason |
| OtpAttempt | محدودسازی نرخ | ایندکس (personnelCode, kind, createdAt) |
| AuditLog | حسابرسی | append-only |
| TransactionRecord | کش معاملات | ایندکس تاریخ/کارشناس/آگهی |
| ExpertRecord | کش کارشناسان | personnelCode یکتا |
| AgentMemory | حافظه ایجنت | append-only، ایندکس (tileId, createdAt) |
| AgentFeedback | بازخورد | append-only، زمینه JSON (domain + نقش کاربر) |
| AgentPolicyVersion | سیاست نسخه‌دار | یکتای (tileId, version)، active + activatedAt |

## ۵) جریان‌های کلیدی

**ورود کارشناس**: `POST /api/auth/request-otp` (محدودیت ۳/۱۰د) → SMS → `POST /api/auth/verify-otp` (محدودیت ۵/۱۵د + قفل) → صدور Session (هش ذخیره) → کلاینت توکن را AES-GCM ذخیره و به home می‌رود. هر درخواست بعدی Bearer + اعتبارسنجی DB + به‌روزرسانی lastSeenAt.

**ورود مدیر**: `POST /api/auth/master-login` → مقایسه زمان-ثابت با `MASTER_ACCESS_CODE` → نشست نقش OWNER (دسترسی Rollback سیاست). خودش هم Rate-limited است.

**ریست اتصال** (دکمه الزامی): `POST /api/connection/reset {withData}` → ابطال نشست + بازسازی Provider + پاک‌سازی و همگام‌سازی مجدد کش → کلاینت کش SW/localStorage را پاک و به auth برمی‌گردد.

**یادگیری**: کاربر روی بینش 👍/👎 + توضیح → ردیف AgentFeedback + AgentMemory → اگر آستانه، `reviewPolicyIfNeeded` نسخه جدید سیاست می‌سازد → رندر بعدی بینش‌ها با وزن‌های جدید + تقویت RAG.

## ۶) تصمیمات آگاهانه و فرض‌های مستند

1. **فرض Endpoint ها**: مشخصات رسمی API ملک تبریز عمومی نیست؛ الگوهای REST استاندارد تعریف و در API-INTEGRATION.md مستند شد. تنها فایل‌های ویرایش‌شونده پس از دریافت مستندات رسمی: `endpoints.ts` و نگاشت پاسخ‌ها در `provider.ts`.
2. **تاریخ جدول‌ها میلادی/شمسی**: ثبت ISO + نمایش شمسی (Intl با تقویم persian). ورودی فیلتر تاریخ میلادی است و برچسب شمسی نمایش داده می‌شود — برای ورودی شمسی کامل می‌توان تقویم جلالی اختصاصی افزود (تصمیم آگاهانه برای پایداری).
3. **وب‌کریپتو در کلاینت**: AES-GCM کلید دستگاه در IndexedDB؛ در بسته اندروید مسیر ارتقا به CapacitorSecureStorage در BUILD-ANDROID.md مستند است.
4. **پالت زمرد/کهربایی**: مطابق قید «بدون آبی/بنفش»؛ تضاد تیره/روشن تست شده است.
