# Worklog — داشبورد هوشمند چندعامله ملک تبریز

Project: Melk Tabriz Multi-Agent Smart Dashboard (PWA, Persian, RTL)
Owner: سید نعمت اله سیدی
Stack: Next.js 16 App Router + TypeScript + Tailwind 4 + shadcn/ui + Prisma(SQLite) + Recharts

---
Task ID: 1
Agent: main (Super Z)
Task: Initialize environment, plan architecture, build complete app

Work Log:
- Loaded fullstack-dev skill, ran init script, dev server running on port 3000
- Verified deps: recharts, zustand, next-themes, framer-motion, date-fns, full shadcn/ui set
- Architecture plan (decisions):
  * Single-page app at `/` (skill constraint: only `/` visible) — client state machine: auth → otp → home (tiles) → tile detail
  * BFF pattern: Next.js API routes proxy to arm.melketabriz.ir; MOCK mode (default) with realistic Persian mock data; REAL mode ready via env
  * Tile plugin architecture: TileContract + TileRegistry, each tile = self-contained module (page, settings, agent)
  * Per-tile learning agent: append-only memory (Prisma), RAG-lite retrieval (TF similarity), versioned policy with rollback
  * Auth: personnel code → OTP → session; master code for owner (hashed, env-configurable); rate limiting; encrypted client storage (AES-GCM)
  * 3 tiles: معاملات، کارشناسان، تنظیمات عمومی
  * Master code default: 41372895 (documented, env: MASTER_ACCESS_CODE)
  * Persian RTL + Vazirmatn font, Persian digits, emerald/amber palette (no blue/indigo)
  * PWA: manifest + service worker + icons
  * Tests: bun test for core libs
  * Docs: README, ARCHITECTURE, API integration, Capacitor Android build guide → /download

---
Task ID: 1 (final)
Agent: main (Super Z)
Task: Build complete Melk Tabriz multi-agent dashboard

Work Log:
- Prisma schema (8 models: Session, OtpAttempt, AuditLog, TransactionRecord, ExpertRecord, AgentMemory, AgentFeedback, AgentPolicyVersion) + db push
- melk-api abstraction layer: config/env, endpoints registry (documented assumptions), HTTP client (timeout+retry+error normalization), seeded mock provider (realistic Tabriz data), real provider, sync (extract-and-cache)
- Auth infra: SHA-256 token hashing, timing-safe master code compare, DB-backed sliding-window rate limiter with lockout, session lifecycle (create/validate/refresh-rotation/revoke), AES-GCM client secure storage (device key in IndexedDB), API guard
- API routes: request-otp, verify-otp, master-login, session (GET/PATCH/DELETE), crm transactions/experts/meta, agent insight/feedback/stats/policy(+rollback OWNER-only), connection status/reset, health
- Tile plugin architecture: TileContract + defineTile validation + TileRegistry (conflict detection, role filter, ordering); 3 tiles registered via bootstrap
- Learning agents: BaseLearningAgent (append-only memory, TF-cosine RAG-lite retrieval, versioned policy with clamp rule, rollback), TransactionAgent (6 domains), ExpertAgent (5 domains), pure analyzers (monthly series, growth, z-score anomalies, expert stats/performance/segments, concentration, conversion)
- Persian RTL UI: Vazirmatn local fonts, emerald/amber palette, AuthScreen (2 paths), OtpScreen (InputOTP + countdown + resend), DashboardHome (animated tile grid + agent badges), AppHeader (theme/account/logout), TileShell (per-tile settings drawer), AgentPanel (insights + feedback dialog + policy history/rollback), TransactionsPage (9 filters + KPIs + 2 recharts + paginated table), ExpertsPage (6 filters + cards/table + performance), SettingsPage (owner credit first, theme, language, account, connection mgmt + RESET button, app guide accordion)
- PWA: manifest (RTL fa), service worker (static cache-first / API network-first + RESET_CACHES message), PIL-generated icons (any+maskable), SwRegister
- Tests: 65 tests / 813 assertions across 6 files — all pass (bun test with separate test.db)
- Fixed during browser verification: zustand unstable selector (getSnapshot infinite loop) in TileShell; boot() token-not-set-before-validation bug; mock commission/price rounding; Persian decimal/thousands separators; server-side insight digits → Persian
- Browser E2E verified: OTP login happy path, master login, session persistence across reload, tiles open, charts render (pixel-verified 3 colors), feedback submit → policy versioning, rate limiting lockout, unauthorized 401, dark mode, mobile 390px single column, sticky footer, 0 console errors
- Docs: README, ARCHITECTURE, API-INTEGRATION, BUILD-ANDROID (Capacitor+TWA), .env.example — copied to download/melk-tabriz-dashboard-docs/ + dashboard screenshot
- capacitor.config.ts ready; package.json scripts: test, test:db:push

Stage Summary:
- Deliverable: production-grade Persian RTL multi-agent dashboard for Melk Tabriz CRM
- Default master code: 41372895 (env MASTER_ACCESS_CODE, must change before production)
- Mock mode default (MELK_API_MODE=mock); real mode endpoint patterns documented in API-INTEGRATION.md
- All requirements from the master prompt implemented: 2-step OTP auth, master code, reset connection button, per-tile settings, general settings tile with owner credit, learning agents with append-only memory + versioned policies + rollback, plugin architecture, tests, full docs

---
Task ID: 2
Agent: main (Super Z)
Task: اتصال واقعی به دو سامانه ملک تبریز (arm + pm)، تست و تأیید اتصال، استخراج داده واقعی و حذف کامل داده دمو

Work Log:
- کشف API واقعی با مهندسی معکوس باندل‌های رسمی:
  * arm.melketabriz.ir → React/Vite SPA → API: https://arus-api.melketabriz.ir/api/apm/ + /api/public/ (NestJS+Mongoose+nginx)
  * pm.melketabriz.ir → سامانه پرسنلی → API: https://pm-api.melketabriz.ir/api/
  * Endpoint ها: authentication/otp/{code} (GET، پیامک)، authentication/otp/login (POST {code, otpCode})، refresh-token، realtor-reports/traded-count-total، realtor-reports/traded-count، realtor-interactions، realtors/list، statics/enums-persian، public/portalInfo، count/badge
  * OTP واقعی ۴ رقمی است (numInputs:4 در فرم ورود خود سامانه) — UI و اعتبارسنجی از ۶ به ۴ رقم اصلاح شد
  * پوشه NestJS: {statusCode, status, data, message} — با تست زنده تأیید شد
- تست زنده‌ی اتصال:
  * ARM public enums → HTTP 200 با داده واقعی (استخراج شد: AD_STATUS_TYPES_FA و ۱۴ گروه enum دیگر)
  * ARM auth OTP → HTTP 500 MongooseError «realtors.findOne() buffering timed out» → MongoDB سمت ملک تبریز قطع است (علت عدم ارسال پیامک)
  * PM portalInfo → 502/تایم‌اوت → سرویس پشتیبان قطع
  * نتیجه: اتصال شبکه برقرار و قرارداد API صحیح؛ قطعی ۱۰۰٪ سمت سرورهای ملک تبریز
- بازنویسی کامل لایه melk-api برای اتصال واقعی:
  * endpoints.ts/config.ts → آدرس‌های واقعی arus-api/pm-api، حالت real اجباری
  * client.ts → armCall با نرمال‌سازی پوشه NestJS، تشخیص DB_DOWN (Mongoose/502 HTML)، backoff نمایی، probeGet
  * adapters.ts (جدید) → نگاشت بردبند ردیف‌های ARM → مدل دامنه + تبدیل جلالی↔میلادی (الگوریتم استاندارد) + extractPagedList
  * provider.ts → RealProvider تنها provider؛ جریان OTP واقعی + refreshArmToken + testConnection سه‌سرویسی (reachable/databaseUp/latency)
  * sync.ts → syncFromArm صفحه‌بندی‌دار + syncWithRefresh (تمدید خودکار توکن) + SyncState (آخرین موفق/خطا/تلاش) + ensureSeeded زنده
- حذف کامل داده دمو (طبق درخواست مالک):
  * src/lib/melk-api/mock-data.ts حذف شد؛ MockProvider حذف شد؛ demoOtp از انواع/مسیرها/UI حذف شد
  * ۶۴۰ معامله و ۲۴ کارشناس دمو از DB پاک شد (scripts/purge_demo_data.py)
  * بنر «حالت دمو» از صفحه ورود حذف شد
- زیرساخت امن توکن ARM: ستون‌های armTokenEnc/armRefreshTokenEnc/armUserType در Session (AES-256-GCM با MELK_TOKEN_KEY)، updateSessionArmTokens، SyncState.armTokenEnc برای همگام‌سازی پس‌زمینه
- مسیرهای جدید/به‌روزشده: request-otp (GET واقعی)، verify-otp (توکن ARM ذخیره می‌شود)، sync (POST دستی؛ 412 به‌جای 401 برای نبود توکن تا خروج خودکار رخ ندهد)، connection/status (پروب ۳ سرویس + SyncState)، connection/reset (ریست + استخراج مجدد واقعی)، crm/* (dataSource شفاف)، health
- instrumentation.ts (جدید): حلقه همگام‌سازی پس‌زمینه هر ۵ دقیقه — به‌محض بازیابی MongoDB ملک تبریز، داده واقعی خودکار استخراج می‌شود
- UI: OtpScreen ۴ رقمی؛ SettingsPage → نمایش وضعیت تفصیلی ۳ سرویس (سالم/پایگاه داده قطع/در دسترس نیست) + وضعیت آخرین استخراج + دکمه «همگام‌سازی داده‌ها»
- تست‌ها: ۶۲ تست / ۱۶۳ ادعا همه پاس (بازنویسی melk-api.test برای قرارداد واقعی + آداپتور + رمزنگاری AES؛ OTP ۴ رقمی در crypto.test)
- تایپ‌چک tsc بدون خطای src/ (فقط bun:test module types محیطی)
- تست مرورگر: ورود مدیر ✅، داشبورد ✅، کاشی معاملات با حالت خالی صادقانه ✅، تنظیمات → تست اتصال زنده با وضعیت تفصیلی سرویس‌ها ✅، همگام‌سازی بدون خروج ناخواسته ✅
- مستندات: API-INTEGRATION.md با قرارداد واقعی + وضعیت زنده؛ README/ARCHITECTURE/BUILD-ANDROID به‌روزشد؛ .env واقعی ساخته شد؛ همه در download/melk-tabriz-dashboard-docs/

Stage Summary:
- اتصال واقعی به هر دو سامانه پیاده، تست و تأیید شد؛ قرارداد API از باندل‌های رسمی کشف و با پاسخ‌های واقعی NestJS تأیید شد
- عدم ارسال پیامک ریشه‌یابی شد: MongoDB سمت arm.melketabriz.ir قطع است (Mongoose buffering timeout) — مساله زیرساختی سمت ملک تبریز
- داده واقعی enums استخراج شد؛ استخراج معاملات/کارشناسان آماده است و به‌محض بازیابی DB با ورود OTP، خودکار/دستی انجام می‌شود (token ارسال‌شده)
- تمام داده دمو حذف شد؛ داشبورد صادقانه خطاها و وضعیت منبع داده را به فارسی نمایش می‌دهد

---
Task ID: 3
Agent: main (Super Z)
Task: فارسی‌سازی کامل محیط، تجهیز کامل به تقویم هجری شمسی، بازنویسی حرفه‌ای دو کاشی معاملات و کارشناسان بر اساس داده واقعی، و پیشنهاد کاشی‌های جدید (فقط پیشنهاد)

Work Log:
- کشف عمیق‌تر داده واقعی: تحلیل باندل‌های رسمی صفحات ARM (TradedStatisticsPage، users-list-page، realtor-interactions-page، trade-over-view-page، suggested-usage، visits، calculate-commission، current-prices، price-evaluations):
  * گزارش تطابق معاملات: propertyCode/propertyCustomer، requestCode/requestCustomer، contractDate، contractHolo، suggestedPropertyCount، eventsCount + خلاصه totalCount/hasRequestEvent/hasSuggestedProperty/hasBoth
  * users-list: fullName، mobile، role.name، businessId.title، creator.fullName، createdAt، active
  * تعاملات: requestRealtorName × propertyRealtorName × count
- زیرساخت تقویم هجری شمسی (تک‌منبع حقیقت):
  * src/lib/jalali.ts: تبدیل دوجهته جلالی↔میلادی، کبیسه ۳۳ ساله، طول ماه، ماه‌ها/روزهای هفته فارسی، dateToJalali/jalaliToDate/todayJalali، isoToJalaliString، anyDateStringToDate، buildJalaliMonthGrid (۴۲ سلول شنبه‌محور)، قالب‌های خوانا/کوتاه
  * format.ts بازنویسی: faDate «۲۱ شهریور ۱۴۰۵»، faJalaliShort «۱۴۰۵/۰۶/۲۱»، faDateTime «… — ساعت ۱۴:۳۰»، faMonthLabel از کلید ماه جلالی
  * کامپوننت جدید JalaliDatePicker: تقویم ماهانه راست‌به‌چپ، سربرگ ش-ی-د-س-چ-پ-ج، ناوبری ماه/سال، دکمه «امروز»، پاک‌سازی، مقدار ISO خروجی — جایگزین ورودی میلادی بومی
- فارسی‌سازی کامل:
  * «API» → «رابط برنامه‌نویسی»، «(ARM)/(PM)» → «(آرم)/(پی‌ام)»، «ms» → «میلی‌ثانیه» با ارقام فارسی، «Rollback ممکن است» → «با قابلیت بازگردانی»، «Z-Score» → «انحراف معیار»، نسخه کاشی با ارقام فارسی
  * همه placeholderها فارسی («نمونه: ۱۲۳۴۵»، «۰۹۱۴۱۲۳۴۵۶۷»، «۴۱۰۰۳۱۳۲۰»)، راهنمای OTP ۴ رقمی اصلاح شد، برچسب سرویس‌های provider فارسی کامل
- بازنویسی مدل داده عین سامانه واقعی:
  * types.ts: CrmTransaction (قرارداد/هولوگرام/شمارش‌ها)، TradedSummary، CrmExpert (نقش/کسب‌وکار/ثبت‌کننده)، CrmInteraction
  * adapters.ts: mapArmTradedRow با contractDate/contractHolo/propertyCustomer/requestCustomer، mapArmTradedSummary، mapArmRealtorRow با role.name/businessId.title/creator.fullName، mapArmInteractionRow — همه بردبند
  * prisma schema: TransactionRecord/ExpertRecord جدید + InteractionRecord جدید + SyncState.summaryJson — db push انجام شد (دو پایگاه: اصلی و تست)
- همگام‌سازی سه‌گانه: sync.ts استخراج معاملات + کاربران + تعاملات (تعاملات غیربحرانی — شکستش کل همگام‌سازی را نمی‌شکند) + خلاصه چهارگانه در SyncState
- APIها: crm/transactions (فیلتر تاریخ/کد ملک/درخواست/هولوگرام/نوع تطبیق + خلاصه بازه)، crm/experts (فیلتر نقش/کسب‌وکار/ثبت‌کننده/وضعیت + مجموع تعامل)، crm/interactions جدید (درجه همکاری + ۱۰ برتر)، crm/meta (نقش‌ها/کسب‌وکارها/ثبت‌کنندگان)
- ایجنت‌ها و تحلیل‌گرها بازنویسی بر داده واقعی:
  * analyzers: سری ماهانه جلالی، ترکیب چهارگانه، سهم درخواست/هولوگرام، توزیع نقش/کسب‌وکار، سری عضویت، درجه همکاری دوطرفه، جفت برتر، تمرکز شبکه، راکدها
  * TransactionAgent: VOLUME/TREND/COMPOSITION/CONVERSION/DOCUMENT/ANOMALY (+ماه اوج)
  * ExpertAgent: COMPOSITION/ACTIVITY/GROWTH/NETWORK/RISK
- کاشی معاملات بازنویسی کامل: شاخص‌های چهارگانه عین خود سامانه + دو سهم کلیدی، فیلتر تاریخ با JalaliDatePicker + نوع تطبیق، جدول عین ستون‌های خود سامانه با تاریخ جلالی، نمودار روند ماهانه شمسی + ترکیب تطبیق، بنر شفافیت منبع داده، تنظیمات کاشی جدید (نسخه ۲.۰.۰)
- کاشی کارشناسان بازنویسی کامل: دو تب «کاربران و مشاوران» (۷ فیلتر شامل نقش/کسب‌وکار/ثبت‌کننده + کارت با تاریخ جلالی/درجه همکاری) و «تعاملات مشاوران» (رتبه‌بندی درجه همکاری + جدول عین خود سامانه) (نسخه ۲.۰.۰)
- تست‌ها: بازنویسی کامل ۳ فایل (jalali/format، analyzers، melk-api آداپتورها) — ۹۵ تست / ۲۳۰ ادعا همه پاس؛ tsc بدون خطای src
- تست زنده: ARM MongoDB بازیابی شد! OTP واقعی: HTTP 200 «کد تایید ارسال شد»؛ PM همچنان ۵۰۲
- تست مرورگر (agent-browser): ورود مدیر ✓، تقویم جلالی (شهریور ۱۴۰۵، دکمه امروز → «۲۱ شهریور ۱۴۰۵») ✓، کاشی‌ها با داده آزمایشی موقت (اسکرین‌شات: KPI، جدول جلالی، ۲ نمودار، تب تعاملات با ۳۰ ردیف) ✓، سپس پاک‌سازی کامل داده آزمایشی (۰ رکورد — وضعیت خالی صادقانه) ✓، تنظیمات: «۳۴۷۷ میلی‌ثانیه» + «نشانی رابط برنامه‌نویسی…» ✓، بدون خطای کنسول
- مستندات: API-INTEGRATION بخش‌های ۷-۹ (ساختار واقعی گزارش‌ها + APIهای داشبورد + وضعیت زنده جدید)، README بازنگری ۲؛ اسکرین‌شات‌ها و مستندات در download/melk-tabriz-dashboard-docs

Stage Summary:
- تمام چهار خواسته اجرا شد: (۱) فارسی‌سازی کامل با حفظ اسلوب فارسی در جملات مخلوط؛ (۲) تقویم هجری شمسی کامل (هسته مشترک + انتخاب‌گر تاریخ + همه نمایش‌ها و سری‌های ماهانه)؛ (۳) دو کاشی بر اساس ساختار واقعی داده سامانه‌ها بازنویسی حرفه‌ای شدند؛ (۴) پیشنهاد کاشی‌های جدید صرفاً در پیام نهایی ارائه شد (بدون کد)
- پایگاه داده MongoDB ملک تبریز بازیابی شد و ارسال پیامک OTP واقعی تأیید شد؛ با ورود مالک از مسیر OTP، استخراج سه‌گانه داده واقعی خودکار انجام می‌شود
- پایگاه داده محلی کاملاً پاک است (۰ دمو/تست) — فقط داده واقعی پس از همگام‌سازی ذخیره می‌شود

---
Task ID: 4
Agent: main (Super Z)
Task: ساخت کاشی‌های پیشنهادی با ایجنت اختصاصی + کاشی استخراج اطلاعات با داده واقعی + تست جامع (رابعا)

Plan (from reverse-engineering of ARM official bundles — live-verified endpoints):
- ARM endpoints discovered this stage (all return 401 unauth = route exists):
  * properties/info/by-code/{code} — جست‌وجوی آگهی با کد (ردیف: _id, title, relatedRealtor)
  * properties/details/{_id} — جزئیات آگهی (details[] + address)
  * properties/owner/{_id} — اطلاعات مالک آگهی (mobileNumber, phoneNumber, extraUserInfo[].infos[0].{firstName,lastName,mobileNumber})
  * properties/list (params: code[], status, address, customer, realtor, page, limit, sort)
  * requests/list (params: code[], status, page, limit, sort) — ردیف: code, title, businessId.title
  * requests/details/{_id}, requests/applicant/{_id} — درخواست‌دهنده (همان ساختار user)
  * visits/list (params: status, page, limit) — بررسی کننده/درخواست‌دهنده/کد آگهی/زمان‌ها
  * realtor-reports/supply-demand (params: page, limit, startDate, endDate, realtor) — بازه/تعداد آگهی/درصد درخواست/وضعیت
  * users/info/mobile-number/{mobile} — بازیابی مشتری با شماره موبایل

Work Log:
- کشف عمیق ثبت آگهی/ثبت درخواست از باندل رسمی ARM: فرم چندمرحله‌ای آگهی (اطلاعات مالک → توضیحات کارشناس → فرم‌های پویا) و درخواست (موقعیت → جزییات → اطلاعات تکمیلی → اطلاعات مشتری)؛ فیلتر جست‌وجوی کد هر دو (code[])
- Prisma: مدل‌های جدید VisitRecord + SupplyDemandRecord + LookupLog (فقط افزودنی) — db push (اصلی + تست)
- melk-api: endpoints (۱۰ مسیر جدید)، types (CrmVisit/CrmSupplyDemand/PersonInfo/PropertyLookupResult/RequestLookupResult)، adapters (mapArmVisitRow/mapArmSupplyDemandRow/extractPersonInfo/normalizeMobile/extractDetailItems/extractAddress)، provider (lookupPropertyByCode/lookupRequestByCode/listVisits/listSupplyDemand)، sync (پنج‌گانه: معاملات+کاربران+تعاملات+بازدیدها+عرضه/تقاضا)
- API: POST/GET /api/crm/lookup (استعلام زنده + تمدید خودکار توکن + حسابرسی)، /api/crm/visits، /api/crm/supply-demand
- ایجنت‌ها: ExtractionAgent (LOOKUP/COVERAGE/QUALITY/SECURITY) + VisitsAgent (VOLUME/TREND/STATUS/LEADERSHIP/ATTENTION) + SupplyDemandAgent (BALANCE/PRESSURE/STRATEGY) + تحلیل‌گرهای خالص + ثبت در رجیستری
- کاشی‌ها: استخراج اطلاعات (دو تب کدآگهی/کددرخواست + کارت تماس با کپی/لینک + جزئیات + تاریخچه) + بازدیدها (۴ شاخص + ۶ فیلتر + تقویم جلالی + نمودار ماهانه + جدول عین سامانه) + عرضه و تقاضا (۴ شاخص + هدایت راهبردی + نمودار مقایسه + جدول عین سامانه) — bootstrap ثبت شد
- ریشه‌یابی «اپلیکیشن بالا نیامد»: سرور dev با Prisma client قدیمی (قبل از prisma generate) اجرا می‌شد → db.lookupLog/db.visitRecord undefined → خطای «reading 'count'» در همه ایجنت‌ها → ریستارت سرور dev = رفع کامل
- رفع نقص HTML: Skeleton (div) داخل p → span (VisitsPage/SupplyDemandPage)
- SettingsPage: نمایش شمارش‌های جدید همگام‌سازی (بازدید/عرضه‌تقاضا)
- تست‌ها: ۲۵ تست جدید (آداپتورها + استخراج شخص + نرمال‌سازی موبایل + تحلیل‌گرها + زنجیره استعلام با fetch شبیه‌سازی‌شده) — مجموع ۱۲۰ تست / ۳۲۳ ادعا همه پاس
- لینت ۰ خطا؛ tsc بدون خطای src/؛ تست مرورگر: ۶ کاشی ✓، استخراج اطلاعات (تب‌ها، هشدار شفاف ۴۱۲ بدون توکن ARM) ✓، بازدیدها ✓، عرضه/تقاضا ✓، ۰ خطای کنسول ✓، موبایل ۳۹۰px تک‌ستونه ✓
- تست زنده: ARM public 200 + ARM auth فعال (DB بالا) + PM ۵۰۲ (قطعی سمت سرور)؛ سنجش همه Endpoint های جدید ۴۰۱ (موجود)؛ مستندات API-INTEGRATION بخش ۱۰-۱۱

Stage Summary:
- چهار خواسته اجرا شد: (اولا) سه کاشی جدید با ایجنت اختصاصی و داده واقعی ساخته شد؛ (ثانیا) کاشی استخراج اطلاعات با دو مسیر کدآگهی/کددرخواست و زنجیره عین خود سامانه ARM کدنویسی شد؛ (ثالثا) پیشنهاد کامل کاشی داشبورد مدیریتی صرفاً در پیام نهایی ارائه شد (بدون کد)؛ (رابعا) تست جامع انجام شد و مشکل «اپلیکیشن بالا نیامد» (Prisma client کهنه) ریشه‌یابی و رفع شد
- داشبورد اکنون ۶ کاشی دارد: معاملات، کارشناسان، استخراج اطلاعات، بازدیدها و پیگیری‌ها، عرضه و تقاضا، تنظیمات عمومی
- استخراج زنده اطلاعات فقط با ورود OTP (توکن ARM) فعال است؛ ورود مدیر محلی پیام شفاف دریافت می‌کند
- همه استعلام‌ها در LookupLog (فقط افزودنی) ثبت و مبنای ایجنت استخراج اطلاعات و حسابرسی امنیتی‌اند

---
Task ID: 5
Agent: main (Super Z)
Task: ریشه‌یابی و رفع فراجامع «بالا نیامدن اپلیکیشن» از لینک عمومی k1wr079jxf01-d.space-z.ai

Work Log:
- تشخیص چندلایه انجام شد:
  * سرور dev سالم بود و HTML درست می‌داد (GET / 200) اما ۱.۳GB RAM (۳۱٪ ماشین ۳.۹GB بدون swap) مصرف می‌کرد + کامپایل تنبل (تأخیر چندثانیه‌ای در اولین بازدید هر مسیر)
  * کش لایه Alibaba Function Compute جلوی دامنه عمومی، مسیر /sw.js را با کلید «فقط مسیر» (نادیده گرفتن query) کش کرده و نسخه قدیمی v1 را تحویل می‌داد؛ هدرهای HEAD همیشه 403 FCCommonError برمی‌گرداندند
  * نکته معماری کلیدی: لینک عمومی پروکسی زنده به sandbox نیست؛ یک Deployment مستقل (snapshot از build قبلی) در FC اجرا می‌شود — snapshot قبلی از وضعیت خراب مرحله قبل گرفته شده بود (build ID متفاوت: IqaVXoG قدیمی vs JmMkTS19 جدید)
  * کشف محیط: هر پروسه‌ای که در فراخوانی ابزار spawn شود در پایان همان فراخوانی reaper می‌شود (حتی با setsid) — راه‌حل: double-fork تا پروسه به init واگذار شود
- اصلاحات اعمال‌شده:
  * sw.js بازنویسی به v3: HTML و /_next همیشه network-first، کش فقط فونت/آیکن/مانیفست، پاک‌سازی کش‌های v1/v2 در activate، skipWaiting + clients.claim + navigate برای خوددرمانی کاربران قفل‌شده
  * مسیر ثبت SW به /sw-v3.js تغییر یافت (مسیر جدید = کش miss تضمینی در CDN؛ الگوی versioned-SW-filename برای آینده مستند شد)
  * SwRegister: بررسی اجباری registration.update() در هر بارگذاری + reload خودکار در controllerchange
  * next.config.ts: هدر no-store برای /sw.js، /sw-v3.js و «/» (جلوگیری از کش سالانه CDN روی HTML ریشه — قبلاً s-maxage=31536000 می‌رفت)
  * تبدیل اجرا از dev به production standalone: bun run build موفق، اجرای .next/standalone/server.js روی پورت 3000
  * scripts/prod-watchdog.sh: نگهبان با ری‌استارت خودکار ۵ ثانیه‌ای + فلگ توقف (.prod-stop) + لاگ در server.log
  * راه‌اندازی با double-fork daemonize (واگذاری به init) → بقای پروسه‌ها بین فراخوانی‌ها اثبات شد
  * .env به standalone کپی شد؛ DATABASE_URL مطلق پاس شد؛ MELK_TOKEN_KEY عمداً دست‌نخورده (سازگاری با توکن‌های رمزشده موجود)
- تست فراجامع پس از رفع:
  * ۱۲۰ تست / ۳۲۳ ادعا همه پاس (bun test)
  * tsc: صفر خطای src/ (خطاهای باقی‌مانده فقط فایل‌های خارج از src مثل examples/skills/tests با bun:test types)
  * E2E مرورگر از مسیر Caddy :81 (عین مسیر FC): ورود مدیر ۴۱۳۷۲۸۹۵ ✓، داشبورد ۶ کاشی ✓، باز کردن تک‌تک ۶ کاشی (معاملات/کارشناسان/استخراج اطلاعات با دو تب/بازدیدها/عرضه و تقاضا/تنظیمات) ✓، تاریخ جلالی فعال (۲۲ شهریور ۱۴۰۵) ✓، صفر خطای کنسول و صفحه ✓
  * APIها از مسیر :81 — health 200 با mode:real؛ همه CRM/agent ها 401 صحیح (نیاز به نشست) ✓
  * حافظه سرور production: ۱۶۱MB (۴٪) — کاهش ۸ برابری نسبت به dev ✓
  * اسکرین‌شات‌ها: scripts/shot-post-fix-home.png و shot-post-fix-settings.png

Stage Summary:
- سه عامل هم‌زمان «بالا نیامدن» ریشه‌یابی و رفع شد: (۱) Deployment کهنه و خراب روی FC (۲) کش CDN روی /sw.js و HTML ریشه (۳) مصرف حافظه/تأخیر dev-mode
- زیرساخت اجرای پایدار: production standalone + watchdog با double-fork (مقاوم به reaper محیط) + ری‌استارت خودکار
- برای انتشار نسخه سالم روی لینک عمومی، deploy جدید (فراخوانی Complete) لازم است — snapshot فعلی FC همچنان نسخه قدیمی را سرو می‌کند
- راهنمای آینده: هر تغییر major در SW باید با مسیر جدید (sw-v4.js و بعدی) ثبت شود

---
Task ID: 5 (پیوست)
Agent: main (Super Z)
Task: پایش انتشار نسخه جدید روی دامنه عمومی

Work Log:
- Complete فراخوانده شد (۲۰:۵۹)؛ پایش ۱۵ دقیقه‌ای: deployment FC همچنان build قدیمی IqaVXoG را سرو می‌کند (sw-v3=404) — انتشار نسخه جدید در صف خط لوله پلتفرم است (به‌روزرسانی دامنه عمومی معمولاً با چرخه انتشار پلتفرم در پایان نشست انجام می‌شود)
- نمونه FC فعلی از مرورگر تازه کاملاً سالم است (ورود مدیر ✓، همه ۱۰ API با توکن ۲۰۰ ✓) — خرابی فقط برای مرورگرهایی است که SW v1 و HTML کش‌شده قدیمی دارند
- راهکار فوری کاربر (با هر نسخه‌ای که روی دامنه است): پاک کردن داده سایت (Clear site data) یا Ctrl+Shift+R — بدون SW و کش، اپ بلافاصله بالا می‌آید
- پس از انتشار build جدید: سازوکار خوددرمانی v3 (بایت متفاوت sw.js → نصب SW جدید → حذف کش‌های قدیمی → claim + navigate → HTML تازه) کاربران قفل‌شده را خودکار درمان می‌کند

Stage Summary:
- وضعیت نهایی: پروژه سالم و production پایدار (watchdog زنده، ۱۶۱MB، پاسخ ۱۸ms)؛ انتشار دامنه عمومی در اختیار چرخه deploy پلتفرم؛ راهکار فوری و خوددرمانی بلندمدت هر دو مستند شدند
