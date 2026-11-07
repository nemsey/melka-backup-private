
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
{{FILE:package.json}}
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
{{FILE:next.config.ts}}
```

`tsconfig.json`:

```json
{{FILE:tsconfig.json}}
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
{{FILE:src/core/tiles/tile-contract.ts}}
```
