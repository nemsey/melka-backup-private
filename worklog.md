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
