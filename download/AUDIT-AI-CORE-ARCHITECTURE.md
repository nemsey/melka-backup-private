# گزارش ممیزی هسته هوش مصنوعی و استحکام معماری
## AI CORE AUDIT & ARCHITECTURAL HARDENING — PHASE 0

| مشخصه | مقدار |
|---|---|
| پروژه | داشبورد هوشمند چندعامله ملک تبریز (تحلیل تصمیم‌گیر بالای arm / pm) |
| مالک | سید نعمت‌اله سیدی |
| فاز | PHASE 0 — فقط Audit + Design (بدون کد جدید، بدون تغییر UI) |
| اصل حاکم | Preserve → Refactor → Harden → Upgrade Intelligence |
| ممنوعیت رعایت‌شده | بازنویسی از صفر ✗ / Feature جدید ✗ / Migration گسترده ✗ |
| تاریخ ممیزی | ۱۴۰۵/۰۶/۲۴ (۲۰۲۶-۰۹-۱۵) |
| روش | کاوش کامل کدبیس + ۴ عامل ممیزی موازی (API / Integration / UI / Test+Agent) + راستی‌آزمایی دستی فایل‌های حیاتی |

---

## خلاصه اجرایی (Executive Summary)

کدبیس فعلی یک **Modular CRM Dashboard با Agentهای Rule/Feedback-Based** است — نه یک Intelligent Agent Platform. این تشخیص، دقیقاً مطابق چارچوب دستور مالک، نقطه شروع ارتقاست نه نقطه ضعف: معماری Tile/TileContract/TileRegistry/AgentRegistry **قابل حفظ و ارزشمند** است و باید حفظ شود.

### پنج یافته تعیین‌کننده

| # | یافته | شدت | وضعیت |
|---|---|---|---|
| **F1** | **یادگیری فعلی = تعدیل وزن مبتنی بر بازخورد است، نه یادگیری واقعی.** کل Feedback History در هر بازبینی دوباره محاسبه می‌شود، بازخورد قدیمی چند بار اثر می‌گذارد، و هیچ اتصالی به Outcome واقعی (تماس/مذاکره/معامله) وجود ندارد. | بحرانی (معماری هوش) | تأییدشده در `base-agent.ts:242-300` |
| **F2** | **RAG فعلی = شباهت واژگانی TF/Cosine است** روی ۲۰۰ ردیف آخر دو جدول، بدون Embedding، بدون فیلتر Metadata، بدون Reranking، بدون Citation. «Prototype» قابل قبول — «RAG تولیدی» نیست. | بالا | تأییدشده در `base-agent.ts:39-65,163-197` |
| **F3** | **«پیش‌بینی» فعلی = Heuristic با احتمال‌های هاردکد است** (`predictRejectReasons` با اعداد ثابت ۷۰/۷۵/۶۰...). هیچ PredictionResult استاندارد، هیچ ارزیابی در برابر Outcome، هیچ Calibration وجود ندارد. | بحرانی (معماری هوش) | تأییدشده در `scoring.ts` |
| **F4** | **سه راز امنیتی بحرانی فعال:** کد مدیر `41372895` به‌عنوان fallback در سورس (`config.ts:67`)، کلید رمزنگاری fallback `"melk-tabriz-fallback-key"` (`crypto.ts:37`)، و اشتراک توکن ARM آخرین کاربر بین همه نشست‌ها از طریق `SyncState.armTokenEnc` singleton (`sync/route.ts:20-22`). فایل `.env` فقط `DATABASE_URL` دارد یعنی **هر سه fallback در عمل فعال‌اند**. | 🔴 بحرانی (امنیت) | راستی‌آزمایی مستقیم |
| **F5** | **زیرساخت یادگیری پایه وجود دارد و سالم است:** حافظه Append-only، سیاست نسخه‌بندی‌شده با Rollback، ۲۸۹ تست سبز، معماری پلاگین کاشی تمیز، جداسازی UI/Server قوی (یک استثنا). این‌ها شالود قابل اتکای ارتقا به Intelligence Core هستند. | مثبت — حفظ شود | تأییدشده |

### تصویر کلان کمّی

| سنجه | مقدار واقعی (ممیزی‌شده) |
|---|---|
| تست‌های سبز | **۲۸۹ تست / ۱۱۳۵ ادعا / ۱۲ فایل** (عدد «۱۶۱» قدیمی است — باید در مستندات اصلاح شود) |
| کاشی‌ها (Tile) | ۱۴ کاشی: ۵ ریشه (فایل‌یابی، آگهی، درخواست ملک، داشبورد مدیریتی، تنظیمات عمومی) + ۹ فرزند درون «داشبورد مدیریتی» |
| ایجنت‌های تخصصی | ۱۲ ایجنت + BaseLearningAgent + ۲۰ تحلیل‌گر خالص در `analyzers.ts` |
| مسیرهای API | ۴۸ فایل `route.ts` |
| مدل‌های Prisma | ۲۹ مدل |
| حجم تقریبی کد منبع | ~۲۵٬۰۰۰ خط TS/TSX (بدون ui/shadcn و node_modules) |
| نقض Agent → Prisma مستقیم | ~۴۶ فراخوانی `db.*` در لایه ایجنت (۱۲ ایجنت + base) |
| نوشتن روی GET | ۵ خانواده روت (بند ۶ و ۲۰) |
| لایه Repository | **وجود ندارد** — بزرگ‌ترین شکاف معماری داده |

### قانون عدم خودفریبی — وضعیت صادقانه ادعاها (بخش ۲۷ دستور)

| ادعا | وضعیت واقعی | مدرک |
|---|---|---|
| AI Learning = DONE | ✗ — تعدیل وزن بازخوردی، بدون Outcome | §۱۱ |
| RAG = DONE | ✗ — TF/Cosine Prototype | §۱۳ |
| Prediction = DONE | ✗ — Heuristic بدون ارزیابی | §۱۴ |
| Self-Healing = DONE | ✗ — فقط «self-seeding» فرصت‌طلبانه sync | §۱۵ |
| Production Ready | ✗ — سه راز بحرانی فعال + بدون OWNER-gate روی ۵ روت مخرب | §۹ |
| National Scale = DONE | ✗ — Singletonها بدون tenant، sync تمام‌جایگزین | §۲۱ |

---

## روش‌شناسی ممیزی

۱. **کاوش ساختاری:** نقشه کامل درخت `src/`، `prisma/`، `tests/`، `scripts/`.
۲. **ممیزی عمیق هسته:** خواندن خط‌به‌خط `base-agent.ts`، `policy.ts`، `tile-contract.ts`، `tile-registry.ts`، `bootstrap.ts`، `db.ts`، `instrumentation.ts`، `sync.ts`، `config.ts`.
۳. **چهار عامل ممیزی موازی:** (الف) تمام ۴۸ روت API — (ب) لایه یکپارچه‌سازی melk-api/divar/instagram/listing/request/auth — (ج) لایه ارائه و ۱۴ کاشی — (د) پوشش تست + تحلیل تک‌تک ۱۲ ایجنت.
۴. **راستی‌آزمایی مستقیم:** هر ادعای بحرانی (راز fallback، الگوی deleteMany، PrismaClient در هر tick، محتوای `.env`) با خواندن مستقیم فایل تأیید شد.
۵. **اجرای سوئیت تست** (توسط عامل ممیز، روی `db/test.db` ایزوله): ۲۸۹ pass / 0 fail.

> این گزارش صرفاً Audit + Design است. هیچ تغییری در کد اعمال نشده است. فازهای اجرایی ۱ تا ۱۲ در §۲۲ تعریف شده‌اند و با GATEهای §۲۵ کنترل می‌شوند.

---

# ۱. Repository Map (نقشه مخزن)

## ۱.۱ ساختار سطح بالا

```
/home/z/my-project/
├── prisma/schema.prisma          # ۲۹ مدل — SQLite
├── db/custom.db (1.3MB)          # پایگاه production
├── src/
│   ├── app/
│   │   ├── page.tsx              # SPA تک‌صفحه‌ای: auth→otp→home→tile
│   │   ├── layout.tsx            # RTL فارسی + PWA metadata
│   │   ├── globals.css           # نظام طراحی «فیروزه تبریز» ۱.۷.۰
│   │   └── api/                  # ۴۸ route.ts — لایه BFF
│   ├── core/                     # ❤️ هسته معماری
│   │   ├── agent/                # ۱۶ فایل، ۲٬۷۹۴ خط — ایجنت‌ها
│   │   └── tiles/                # قرارداد + رجیستری + bootstrap + ۱۴ کاشی
│   ├── components/
│   │   ├── app/                  # ۹ کامپوننت پوسته (۱٬۵۸۷ خط)
│   │   └── ui/                   # ۴۹ کامپوننت shadcn (۵٬۶۶۳ خط)
│   ├── lib/                      # زیرساخت + یکپارچه‌سازی
│   │   ├── melk-api/             # ۱۱ فایل — ARM/PM/FM + sync
│   │   ├── divar/                # ۸ فایل — اسکن/امتیازدهی دیوار
│   │   ├── instagram/            # ۴ فایل — Graph API
│   │   ├── listing/ request/     # store + انتقال CRM + ثبت ARM
│   │   ├── auth/                 # session/guard/crypto/rate-limiter
│   │   └── client/               # fetch wrapper + zustand store
│   └── instrumentation.ts        # تایمر sync پس‌زمینه
├── tests/                        # ۱۲ فایل تست + ۳ اسکریپت runtime
├── scripts/                      # ~۹۰ اسکریپت ابزار (اسکرین‌شات، تحلیل، استقرار)
├── public/                       # PWA: manifest, sw-v3.js, fonts, icons
└── download/                     # مستندات و تحویل‌شدنی‌ها
```

## ۱.۲ جدول مسئولیت فایل‌های حیاتی

| فایل | خط | مسئولیت | وابستگی | مشکل اصلی | شدت |
|---|---|---|---|---|---|
| `core/agent/base-agent.ts` | ۳۷۵ | چرخه یادگیری پایه: حافظه/بازیابی/سیاست/رندر بینش | `lib/db`, `policy.ts` | محاسبه مجدد کل تاریخچه؛ بدون Outcome؛ N+1 بازیابی | بحرانی |
| `core/agent/policy.ts` | ۳۶ | قرارداد سیاست + clamp | — | بدون policyVersion metadata (آزمون/پذیرش) | متوسط |
| `core/agent/index.ts` | ۴۹ | Agent Registry (۱۲ ایجنت) | base + ۱۲ ایجنت | بدون lifecycle/health | کم |
| `core/agent/analyzers.ts` | ۴۱۱ | ۲۰ تحلیل‌گر آماری خالص | فقط typeهای Prisma | خالص ✅ — الگوی درست | — |
| `core/tiles/tile-contract.ts` | ۸۹ | قرارداد کاشی + defineTile | react types | ✅ سالم | — |
| `core/tiles/tile-registry.ts` | ۵۸ | رجیستری پلاگین + ظرف | tile-contract | ✅ سالم | — |
| `core/tiles/bootstrap.ts` | ۳۵ | نقطه ثبت پلاگین‌ها | ۱۴ کاشی | ✅ سالم | — |
| `lib/db.ts` | ۱۳ | PrismaClient singleton | prisma | `log:['query']` همیشه فعال | متوسط |
| `lib/melk-api/sync.ts` | ۷۱۰ | همگام‌سازی full-refresh از ARM | db, provider, adapters | deleteMany×۶+create؛ بدون cursor/قفل/Idempotency | بالا |
| `lib/melk-api/config.ts` | ۷۶ | پیکربندی + رازها | — | **fallback `41372895`** | 🔴 بحرانی |
| `lib/melk-api/provider.ts` | ۵۴۸ | RealProvider: OTP/refresh/گزارش‌ها | client, adapters | resolveRole همیشه CONSULTANT | متوسط |
| `lib/melk-api/adapters.ts` | ۷۰۲ | نگاشت بردبند داده ARM | — | id fallback با `Date.now()` | بالا |
| `lib/divar/scoring.ts` | ۵۸۸ | موتور امتیاز ۱۰۰ نقطه‌ای | config, locations | احتمال‌های هاردکد «پیش‌بینی» | بالا |
| `lib/divar/scan.ts` | ۵۳۳ | موتور اسکن دیوار | client, scoring, store | بدون throttle بین fetchها | بالا |
| `lib/request/customer-mgmt.ts` | ۵۶۰ | مغز CRM: سلامت/NBA/تطبیق | db (۵ جدول) | import توسط UI (نقض مرز) | بالا |
| `src/instrumentation.ts` | ۵۲ | تایمر sync پس‌زمینه | prisma, sync | `new PrismaClient()` در هر tick | متوسط |

## ۱.۳ الگوهای سازمانی مثبت (حفظ شوند)

- **پلاگین واقعی:** افزودن کاشی = یک ماژول + یک import در `bootstrap.ts` — هسته و سایر کاشی‌ها دست‌نخورده.
- **قرارداد صریح:** `TileDefinition` با اعتبارسنجی ساختاری در `defineTile()`.
- **ایزوله‌سازی حافظه:** هر ایجنت فقط با `tileId` خودش خواندن/نوشتن می‌کند.
- **Append-only:** `AgentMemory` و `AgentPolicyVersion` هرگز overwrite نمی‌شوند.
- **BFF کامل:** کلاینت هرگز مستقیم به سامانه بیرونی وصل نمی‌شود؛ صفر `fetch()` خام در tsxها.

---

# ۲. Layer Map (نقشه لایه‌های منطقی موجود)

وضعیت فعلی **۴ لایه ضمنی** دارد (نه ۹ لایه هدف):

| لایه ضمنی فعلی | فایل‌ها | مسئولیت | مشکل |
|---|---|---|---|
| **L-UI (ارائه)** | `app/page.tsx`, `components/app/*`, `core/tiles/tiles/*/…tsx` (~۱۳٬۶۰۰ خط) | رندر، فرم‌ها، ویزاردها، نمودارها | منطق کسب‌وکار درون UI (آستانه‌ها/تجمیع/اعتبارسنجی تکراری)؛ یک import نقض‌کننده Prisma |
| **L-API (BFF)** | `app/api/**` (۴۸ روت) | احراز هویت، پروکسی، CRUD | اعتبارسنجی دستی ناهمگون؛ نوشتن روی GET؛ نقش‌گذاری ناقص |
| **L-DOMAIN+INFRA (درهم‌تنیده)** | `core/agent/*`, `lib/melk-api|divar|instagram|listing|request` (~۸٬۰۰۰ خط) | منطق دامنه + دسترسی داده + HTTP خارجی، **همه در یک لایه** | 🔴 دامنه و زیرساخت جدا نشده‌اند — ریشه تمام نقض‌های وابستگی |
| **L-DATA** | `lib/db.ts`, `prisma/schema.prisma` | SQLite + ۲۹ مدل | بدون Repository؛ log query فعال |

**نکته کلیدی معماری:** پروژه فاقد «لایه Application/Use Case» و فاقد «لایه Agent Orchestration مستقل از دامنه» است. ایجنت‌ها همزمان: کوئری می‌زنند (Repository)، تحلیل می‌کنند (Domain)، گاهی شبکه صدا می‌زنند (Integration) و سیاست تغییر می‌دهند (Orchestration). این درهم‌تنیدگی، هدف اصلی PHASE 1-3 است.

---

# ۳. Dependency Map (نقشه وابستگی‌ها و نقض‌ها)

## ۳.۱ گراف وابستگی واقعی (استخراج‌شده)

```
UI (tsx)
  ↓ api() fetch           ✅ مجاز
  ↓ TILE CONTRACT          ✅ مجاز (types خالص)
  ⚠️ CustomerManagementPanel.tsx:21
      → import VALUE از lib/request/customer-mgmt
      → که خودش db (Prisma) import می‌کند     🔴 نقض UI → Prisma

API Routes
  ↓ lib/auth/guard          ✅
  ↓ lib/*/store             ✅ (الگوی درست)
  ↓ db.* مستقیم             🔴 ~۲۰ روت نقض Route → Prisma (باید از store عبور کند)
  ↓ lib/melk-api/*          ✅

core/agent (ایجنت‌ها)
  ↓ db.* مستقیم             🔴 ۴۶ فراخوانی — Agent → Prisma
  ↓ getCommissionConfig()   🔴 I/O شبکه زنده در computeRawInsights (finance-agent)
  ↓ getPriceIndexConfigs()  🔴 I/O شبکه زنده در computeRawInsights (price-index-agent)
  ↓ buildCustomerManagement() (request-agent → ۵ جدول)  🔴 درهم‌تنیدگی دامنه/دسترسی

lib/melk-api
  ↓ db, crypto, provider    — یکپارچه‌سازی و زیرساخت درهم

Domain خالص (موجود و سالم ✅)
  analyzers.ts, policy.ts, commission.ts, price-index.ts,
  scoring.ts, customer-club.ts, format.ts, jalali.ts
```

## ۳.۲ جدول نقض‌های قانون وابستگی (مطابق بخش ۵ دستور)

| قاعده ممنوع | وضعیت | شواهد | شدت | اثر جانبی اصلاح |
|---|---|---|---|---|
| UI → Prisma | 🔴 نقض (۱ مورد) | `request/CustomerManagementPanel.tsx:21` — value-import از ماژول دارای `import { db }` | بالا | انتقال ثابت‌ها به `types.ts` خالص؛ ریسک کم |
| Agent → Prisma مستقیم | 🔴 نقض (سیستماتیک) | هر ۱۲ ایجنت + base (~۴۶ فراخوانی) | بالا | نیازمند لایه Repository (PHASE 2) |
| Domain → Next.js/React | ✅ برقرار | هیچ فایل lib/core فریم‌ورک React را import نمی‌کند | — | — |
| LLM → Security Decision | ✅ (غیرمرتبط) | LLM وجود ندارد | — | — |
| External API → UI | ✅ برقرار | صفر fetch خام در کلاینت؛ همه از BFF | — | — |
| Integration → Adapter → Domain | 🟡 جزئی | adapters بردبند ✅ اما sync/adapters/store درهم‌تنیده و مستقیم به db | متوسط | جداسازی قرارداد Adapter |

## ۳.۳ وابستگی‌های چرخه‌ای و پنهان

| مورد | توضیح | ریسک |
|---|---|---|
| `divar/ads/[token]/register/route.ts` → `db.listingRecord` | روت دیوار مستقیماً به ماژول آگهی می‌نویسد (درون‌ریزی خودکار) | چسبندگی بین‌کاشی؛ شکستن جداسازی پلاگین |
| `divar/ads/[token]/reject/route.ts` → `db.agentMemory` | روت مستقیماً به حافظه ایجنت دیوار می‌نویسد به‌جای `divarAgent.appendMemory` | دور زدن کپسوله‌سازی حافظه — دو مسیر ناهمگون برای یک مفهوم |
| `agent/insight` (GET) → `ensureSeeded()` → `syncFromArm()` | رندر بینش می‌تواند sync کامل ۶ جدول راه بیندازد | زنجیره عارضه جانبی پنهان روی خواندن |
| `RefListCache` برای تنظیمات Instagram | تنظیمات اپ در جدول «کش لیست‌های مرجع ARM» ذخیره می‌شود | آلودگی مفهومی cache با config |

---

# ۴. Tile Map (نقشه کاشی‌ها)

۱۴ کاشی ثبت‌شده در رجیستری — ۵ ریشه + ۹ فرزند درون ظرف `management-dashboard`:

| کاشی | id | order | ظرف | ایجنت | دامنه‌های بینش | خط UI | نکات |
|---|---|---|---|---|---|---|---|
| فایل‌یابی | `file-finder` | ۱ | ریشه | ✅ | SCAN, PERSONAL, PRICE, OTHER, LOCATION, LEARNING | ۱٬۸۰۷ | بزرگ‌ترین کاشی؛ موتور امتیاز در سرور ✅ |
| آگهی | `listings` | ۲ | ریشه | ✅ | REGISTRY, CRM, INSTAGRAM, COMPLETENESS, SOURCE | ۲٬۲۹۲ | ویزارد ۵ گامی ۶۷۷ خطی |
| درخواست ملک | `requests` | ۳ | ریشه | ✅ | COMMUNITY_MGMT, CUST_HEALTH, LIFECYCLE, NEXT_ACTION, MATCH, CHURN, EVENT_MGMT, ARM_SYNC (۸ دامنه — بیشترین) | ۲٬۲۹۱ | NewRequestDialog = ۹۱۶ خط (بزرگ‌ترین فایل UI) |
| داشبورد مدیریتی | `management-dashboard` | ۴ | ریشه | ✗ (ظرف خالص) | — | ۱۴۱ | `listChildren("management-dashboard")` |
| تنظیمات عمومی | `settings` | ۹۹ | ریشه | ✗ | — | ۱٬۴۱۶ | آخرین کاشی هوم (مطابق دستور مالک) |
| معاملات | `transactions` | ۱ | mgmt | ✅ | VOLUME, TREND, COMPOSITION, CONVERSION, DOCUMENT, ANOMALY | ۵۷۹ | صفحه‌بندی جعلی limit=5000 |
| قراردادها | `contracts` | ۲ | mgmt | ✅ | FUNNEL, BOTTLENECK, STALLED, SHARE, DOCUMENT, REJECT | ۴۸۳ | قیف ۹ مرحله‌ای؛ findMany کامل |
| باشگاه مشتریان | `customer-club` | ۳ | mgmt | ✅ | COMMUNITY, REPEAT, GROWTH, LOYALTY, CATALOG | ۳۵۹ | ۳ اسکن کامل جدول در هر GET |
| مالی و کمیسیون | `finance-commission` | ۴ | mgmt | ✅ | TARIFF, REVENUE, SETTLEMENT, BRANCH, PIPELINE | ۵۷۱ | I/O شبکه زنده در ایجنت 🔴 |
| شاخص قیمت | `price-index` | ۵ | mgmt | ✅ | MARKET, REGION, TREND, ALERT, HEALTH | ۴۹۲ | نوشتن history روی GET 🔴 |
| کارشناسان | `experts` | ۶ | mgmt | ✅ | COMPOSITION, ACTIVITY, GROWTH, NETWORK, RISK | ۵۹۶ | درجه همکاری در UI هاردکد |
| بازدیدها | `visits` | ۷ | mgmt | ✅ | VOLUME, TREND, STATUS, LEADERSHIP, ATTENTION | ۳۷۰ | distinct با بارگذاری کل ستون |
| عرضه و تقاضا | `supply-demand` | ۸ | mgmt | ✅ | BALANCE, PRESSURE, STRATEGY | ۳۲۱ | آستانه‌های ۶۰/۴۰ در UI |
| استخراج اطلاعات | `extraction` | ۹ | mgmt | ✅ | LOOKUP, COVERAGE, QUALITY, SECURITY | ۵۵۴ | SECURITY توصیفی — مسدودسازی ندارد |

**ارزیابی:** ساختار ریشه/ظرف مطابق دستور اخیر مالک پیاده شده و تست دارد (`management-dashboard.test.ts` — ۷ تست). مشکل اصلی این لایه **تکرار** است (§۱۹) نه ساختار.

---

# ۵. Agent Map (نقشه ایجنت‌ها)

## ۵.۱ معماری فعلی

```
BaseLearningAgent (abstract)
  ├── tileId, name, insightDomains
  ├── computeRawInsights()      ← هر ایجنت تخصصی پیاده می‌کند
  ├── ensurePolicy / rollbackPolicy / reviewPolicyIfNeeded
  ├── appendMemory / retrieveRelevant (TF/Cosine)
  ├── submitFeedback
  ├── renderInsights()          ← قلب: سیاست + بازیابی → وزن نهایی
  └── learningStats()
        ↓ (وراثت — بدون override)
۱۲ ایجنت تخصصی (۱٬۹۲۳ خط)
```

**یافته کلیدی:** هیچ‌کدام از ۱۲ ایجنت هیچ‌یک از متدهای یادگیری را override نکرده‌اند (تأیید با جستجوی سراسری). یادگیری «یک اندازه برای همه» است؛ تخصص فقط در `computeRawInsights` است.

## ۵.۲ جدول ۱۲ ایجنت — «هر ایجنت چه می‌داند؟»

| ایجنت | خط | منبع دانش (خواندن) | فراخوانی db.* | هوش دامنه‌ای | نقطه ضعف |
|---|---|---|---|---|---|
| transaction | ۱۴۲ | `transactionRecord` کامل | ۱ | آستانه رشد ±۱۰٪، requestShare<۵۰٪، ناهنجاری z≥1.8 | بدون take؛ بدون try/catch |
| expert | ۱۴۱ | expert + interaction | ۲ | فعال<۸۵٪/۷۰٪، تمرکز شبکه>۵۰٪ | بدون take |
| extraction | ۱۱۰ | lookupLog(500) | ۱ | کد تکراری≥۳، نقص موبایل≥۳۰٪ | SECURITY فقط نمایشی |
| visits | ۱۳۱ | visitRecord کامل | ۱ | checkedRate<۷۰٪ | بدون take |
| supply-demand | ۹۹ | sdRecord کامل | ۱ | حکم بازار ≥۶۰/≤۲۵٪ | آستانه هاردکد |
| **divar (فایل‌یابی)** | ۲۳۶ | divarAd(3000), scanLog, rejectLog, priceStat, setting — همه با .catch | ۵ | سلامت اسکن، قانون مالک، کیفیت قیمت | ⚠️ ادعای «تعدیل امتیاز با ردها» در کارت LEARNING پیاده نشده — شکاف ادعا/پیاده‌سازی |
| contract | ۱۶۷ | contractRecord + ۳ JSON parse | ۱ | گلوگاه ≥۵۰%→critical، STALL_DAYS=۱۴ هاردکد | بدون take |
| customer-club | ۱۵۵ | refList×۴ + tx + contract + expert | ۴ | رشد ±۲۰٪، وفاداری دوطرفه | اسکن کامل ۳ جدول |
| finance | ۱۷۱ | contract + expert + divarAd(200) | ۳ | تایید باز≥۳ | 🔴 `getCommissionConfig()` شبکه زنده؛ «پیش‌بینی درآمد» = میانگین قیمت دیوار × تعرفه ×۲ (خشن) |
| price-index | ۱۶۹ | divarAd + history(400) | ۲ | reliable≥۲ نمونه، جهش≥۱۵٪، انحراف≥۳۰٪ | 🔴 `getPriceIndexConfigs()` شبکه زنده |
| listing | ۱۸۰ | listing(500) + igLog(200) + igConnection | ۳ | شکاف ۵ گامی، آماده انتقال | — |
| **request (مدیریت مشتریان)** | ۲۲۲ | requestRecord(500) + eventRecord(500) + buildCustomerManagement (۵ جدول) | ۲+ارجاع | ✅✅ واقع‌ترین هوش: سلامت ۳۵/۲۵/۲۰/۱۰/۱۰، CHURN>۱۴روز→warning (با ارزش بالا→critical)، NBA اولویت ۱-۳، تطبیق ۳۰/۲۰/۱۵/۲۰/۱۵ | ارکستر در lib نه در core |

## ۵.۳ مغزهای تحلیلی خارج از لایه ایجنت (شایسته ارتقا به Intelligence Core)

| ماژول | خط | قابلیت | ارزیابی |
|---|---|---|---|
| `lib/request/customer-mgmt.ts` | ۵۶۰ | پروفایل ۳۶۰°، امتیاز سلامت، چرخه عمر، ۸ نوع NBA، موتور تطبیق درخواست↔آگهی | کامل‌ترین موتور تصمیم‌یار پروژه — اما بدون ثبت Outcome |
| `lib/divar/scoring.ts` | ۵۸۸ | امتیاز ۱۰۰ نقطه‌ای ۴ مؤلفه، طبقه‌بندی آگهی‌دهنده، predictRejectReasons | دقیق اما احتمال‌ها هاردکد و بدون ارزیابی |
| `core/agent/analyzers.ts` | ۴۱۱ | ۲۰ تحلیل‌گر خالص | الگوی مرجع خالص‌بودن ✅ |
| `lib/melk-api/commission.ts` | — | تعرفه اتحادیه | خالص و تست‌شده ✅ |
| `lib/melk-api/price-index.ts` | — | آمار توصیفی/جهش/انحراف | خالص و تست‌شده ✅ |

---

# ۶. API Map (نقشه API)

## ۶.۱ آمار کلی

۴۸ فایل `route.ts` — همه با گارد نشست به‌جز ۵ روت عمومی (۳ روت auth عمدی + health + روت ریشه scaffold).

## ۶.۲ نگاشت روت‌ها به دامنه‌ها

| خانواده | روت‌ها | الگوی دسترسی داده | نکات بحرانی |
|---|---|---|---|
| auth | session, request-otp, verify-otp, master-login | از طریق lib ✅ | session بدون try/catch؛ باگ ثبت RATE_LIMITED به‌عنوان تلاش ناموفق |
| agent | insight, feedback, policy, stats (×tileId) | 🔴 مستقیم از طریق base-agent | نوشتن حافظه روی GET insight؛ N+1 |
| requests | ۵ روت | مخلوط (store + db مستقیم) | status code با جستجوی زیررشته فارسی «کامل نیست» |
| divar | ۸ روت | 🔴 db مستقیم در ۴ روت | POST scan بدون try/catch و بدون OWNER-gate؛ reject مستقیم به agentMemory می‌نویسد |
| crm | ۱۲ روت | 🔴 db مستقیم (۹ روت findMany کامل) | ensureSeeded فرصت‌طلبانه؛ price-index نوشتن روی GET |
| listings | ۴ روت | مخلوط | JSON.parse بدون try/catch در PATCH؛ Instagram بدون OWNER-gate |
| اتصال‌ها | instagram, pm, connection/status, connection/reset, sync, indicators, users/lookup | مخلوط | 🔴 reset/pm/instagram بدون OWNER-gate؛ sync با توکن Singleton |

## ۶.۳ یافته‌های API (اولویت‌بندی)

| # | یافته | شدت | پیشنهاد | اثر جانبی |
|---|---|---|---|---|
| A1 | ۴ روت بدون try/catch (session×۳، scan POST، reject POST) | بالا | افزودن wrapper خطای یکسان | هیچ — رفتار فعلی 500 خام است |
| A2 | Zod v4 نصب اما بلااستفاده — اعتبارسنجی دستی ناهمگون | بالا | Schema مرکزی + اعتبارسنجی کوئری/بدنه | تغییر قرارداد خطا — نیازمند هماهنگی UI |
| A3 | نوشتن روی GET (۵ خانواده — جزئیات در §۲۰) | بالا | تفکیک رویدادها مطابق دستور بخش ۱۶ | endpoint جدید؛ کلاینت باید POST بزند |
| A4 | نقش OWNER فقط در ۳ روت چک می‌شود | 🔴 بالا | OWNER-gate یکنواخت برای reset/pm/instagram/scan | مسیرهای مدیریتی قفل می‌شوند |
| A5 | ناسازگاری کد وضعیت (200+ok:false در ۲ روت؛ 400 برای خطای سرور) | متوسط | پاکت خطای ساختاریافته | تست‌های کلاینت به‌روز شوند |
| A6 | فیلترهای تاریخ بدون اعتبارسنجی → Invalid Date → 500 | متوسط | اعتبارسنجی کوئری | — |
| A7 | روت ریشه `/api` = scaffold باقی‌مانده | کم | حذف | — |

---

# ۷. Data Model Map (نقشه مدل داده)

۲۹ مدل Prisma روی SQLite — `db/custom.db` (۱.۳ مگابایت):

## ۷.۱ خانواده‌های مدل

| خانواده | مدل‌ها | مشاهده |
|---|---|---|
| امنیت/احراز | `Session`, `OtpAttempt`, `AuditLog` | توکن هش‌شده؛ توکن ARM رمز AES-256-GCM؛ **اما کلید fallback بحرانی** |
| کش CRM (sync) | `SyncState`(singleton), `TransactionRecord`, `ExpertRecord`, `InteractionRecord`, `VisitRecord`, `SupplyDemandRecord`, `ContractRecord` | 🔴 deleteMany+create در هر sync؛ شناسه‌های ناپایدار با `Date.now()` |
| دیوار | `DivarConnection`, `DivarSetting`, `DivarAd`, `DivarRejectLog`, `MarketPriceStat`, `DivarScanLog` | ✅ idempotent با کلید `token` — الگوی درست |
| هوش مصنوعی | `AgentMemory`, `AgentFeedback`, `AgentPolicyVersion` | 🔴 فاقد memoryType/provenance/confidence/tenant — برای Memory Architecture چندلایه کافی نیست |
| جریان کار | `ListingRecord`, `RequestRecord`, `RequestEventRecord` | ثبت ARM/CrmTransfer در ستون‌ها و JSON |
| یکپارچه‌سازی | `RefListCache`, `PriceIndexHistory`, `CommissionCalcLog`, `InstagramConnection`, `InstagramPostLog`, `PmConnection`, `LookupLog` | ترکیب cache + لاگ + تنظیمات در یک خانواده |

## ۷.۲ شکاف‌های مدل داده نسبت به معماری هدف

| قابلیت هدف | وضعیت فعلی | گپ |
|---|---|---|
| Memory چندلایه (Working/Episodic/Semantic/Procedural/Strategic/Institutional) | یک جدول `AgentMemory` عمومی (kind/payload JSON) | بدون memoryType ساخت‌یافته، embeddingRef, confidence, importance, validFrom/Until, provenance, tenantId |
| Prediction/Outcome | **وجود ندارد** | بدون PredictionRecord, OutcomeRecord, ContextSnapshot |
| Institutional Knowledge Promotion | **وجود ندارد** | بدون جدول KnowledgeItem + فرایند اعتبارسنجی |
| Multi-tenant / Multi-city | Singletonها: `SyncState`, `DivarSetting`, `InstagramConnection`, `PmConnection` — همه بدون ستون tenant | برای شهر دیگر = instance جدید دیتابیس/استقرار (بدون بازنویسی ممکن اما نه data-level) |
| Feature Store | **وجود ندارد** | ویژگی‌ها inline در scoring/analyzers محاسبه می‌شوند |
| Sync Versioning/Cursor | `SyncState` فقط lastSuccessAt/lastError/attempts دارد | بدون watermark/cursor/dead-letter |
| Session→Device/Tenant | Session فقط personnelCode/role دارد | بدون device/tenant |

## ۷.۳ اشکالات جزئی مدل

- `AgentMemory.payload` متن JSON خام است — `text.slice(0,400)` در بازیابی بریده می‌شود (قطع واژه).
- `PriceIndexHistory` روی GET نوشته می‌شود (dedup روزانه دارد ولی نوشتار است).
- `LookupLog` هر استعلام موفق/ناموفق را ثبت می‌کند بدون انقضا/هرس.
- `ListingRecord` ~۱۵ ستون وضعیت/زمان دارد + دو فیلد JSON متنی (`crmTransferJson`) — نیمه-ساخت‌یافته.

---

# ۸. External Integration Map (نقشه یکپارچه‌سازی خارجی)

| سیستم | کانال | فایل‌ها | مکانیزم | ریسک |
|---|---|---|---|---|
| **ARM** (arus-api.melketabriz.ir/api/apm) | OTP + Bearer | client, provider, endpoints | fetch + retry نمایی 800ms×2ⁿ + timeout 25s + نرمالسازی NestJS envelope | ✅ مهندسی خوب |
| ARM عمومی (/api/public) | بدون توکن | sync (لیست مرجع) | همان client + کش `RefListCache` | کم |
| **PM** (pm-api.melketabriz.ir/api) | OTP + ورود | pm/connection | armCall | 🔴 بدون OWNER-gate و rate limit → تحریک بی‌سقف پیامک |
| **FM مالی** (fm-api.melketabriz.ir) | تعرفه کمیسیون | sync.getCommissionConfig | armCall + کش ۶ ساعته | کم |
| **دیوار — وب عمومی** | اسکرپینگ | divar/client | 🔴 fetch با **UA جعلی مرورگر Chrome/130** به api.divar.ir/v8 + هدرهای Origin/Referer جعلی | بالا — ریسک ToS/بلاک IP؛ **بدون throttle بین fetch جزئیات** |
| دیوار — کنار رسمی | x-api-key | client, store | رسمی ✅ اما پیش‌فرض وب است چون کلید اختیاری | متوسط |
| دیوار — احراز پیامکی | OTP | client | 🔴 توکن ذخیره می‌شود اما **هیچ‌جا مصرف نمی‌شود** — قابلیت نمایشی | کم |
| **اینستاگرام** Graph API v21 | انتشار | instagram/client | انتشار دو مرحله‌ای + poll + permalink | توکن در query string (لاگ سرور)؛ بدون OWNER-gate |

**یافته ساختاری:** لایه Adapter واقعی فقط در `melk-api/adapters.ts` (الگوی بردبند pick/pickStr) و `divar/parse.ts` برقرار است. بقیه یکپارچه‌سازی‌ها مستقیم به db و domain چسبیده‌اند — طرح هدف §۲۳ (L7) این را قراردادمند می‌کند.

---

# ۹. Security Map (نقشه امنیت)

## ۹.۱ یافته‌های بحرانی (هر سه فعال — راستی‌آزمایی مستقیم)

| ID | یافته | محل | توضیح | پیشنهاد | اثر جانبی |
|---|---|---|---|---|---|
| **SEC-1** | کد مدیر fallback هاردکد | `melk-api/config.ts:67` | `env("MASTER_ACCESS_CODE","41372895")` و `.env` فقط DATABASE_URL دارد → کد فعال در سورس/تست‌ها علنی است | حذف fallback + fail-fast + چرخش کد + پاکسازی از تست‌ها و تاریخچه git | قفل شدن بوت تا تنظیم env — عمدی و مطلوب |
| **SEC-2** | کلید رمزنگاری fallback | `auth/crypto.ts:37`, `divar/config.ts:127` | `MELK_TOKEN_KEY ?? MASTER_ACCESS_CODE ?? "melk-tabriz-fallback-key"` → کلید AES از رشته عمومی؛ سرقت db = سرقت همه توکن‌ها | حذف fallback + کلید ۳۲بایتی مستقل + **بازرمزنگاری همه توکن‌های ذخیره‌شده** (چرخش کلید = داده فعلی ناخوانا) | نیاز به migration رمزنگاری یک‌باره با کلید قدیم→جدید |
| **SEC-3** | اشتراک توکن ARM بین کاربران | `sync/route.ts:20-22`, `connection/reset:41-45`, `instrumentation.ts:26-28` | `SyncState.armTokenEnc` singleton = توکن آخرین کاربر موفق؛ sync/reset/تایمر با آن اجرا می‌شود حتی برای OWNER محلی | حذف armTokenEnc از SyncState یا scope به personnelCode + ثبت مالک در audit | تایمر پس‌زمینه به نشست سرویس مستقل نیاز دارد (service account) |

## ۹.۲ یافته‌های بالا

| ID | یافته | محل | پیشنهاد |
|---|---|---|---|
| SEC-4 | بعد IP در rate-limiter ذخیره می‌شود ولی در شمارش نیست | `rate-limiter.ts:32-34` | شمارش `personnelCode OR ip` برای REQUEST_OTP + parse صحیح x-forwarded-for |
| SEC-5 | باگ خود-تمدید قفل: خطای RATE_LIMITED به‌عنوان تلاش ناموفق ثبت می‌شود | `request-otp:44-47`, `verify-otp` | تفکیک کد خطا قبل از recordAttempt |
| SEC-6 | ۵ روت حساس بدون OWNER-gate: `connection/reset`, `pm/connection`, `instagram/connection`, `divar/scan` POST, `listings/[id]/instagram` | روت‌ها | گارد نقش یکنواخت `requireRole("OWNER")` |
| SEC-7 | اسکرپینگ دیوار با UA/Referer جعلی + بدون throttle | `divar/client.ts:8-9` | throttle 150-300ms + احترام به 429 + اولویت کنار |
| SEC-8 | resolveRole همیشه CONSULTANT → همه کاربران OTP دسترسی داده کامل | `provider.ts:121-125` | در فاز تک‌کاربر مستند شود؛ برای multi-user → RBAC |

## ۹.۳ نقاط قوت امنیتی (حفظ شوند)

- توکن نشست فقط SHA-256 ذخیره می‌شود؛ مقایسه کد مدیر timing-safe.
- توکن‌های خارجی AES-256-GCM با IV تصادفی + tag.
- چرخش توکن در PATCH session (البته کلاینت مصرف نمی‌کند).
- revoke نشست، توکن‌های ARM را پاک می‌کند.
- خروج خودکار کلاینت در 401؛ trust-but-verify نشست هنگام boot.
- client persist فقط tileSettings — توکن در secure-storage رمز شده.

---

# ۱۰. Persistence Map (نقشه ماندگاری)

| لایه | مکانیزم | مشاهده |
|---|---|---|
| پایگاه اصلی | SQLite + Prisma (`db/custom.db`) | تک‌فایل؛ بدون مهاجرت نسخه‌دار (db push) |
| کش فرایند‌داخلی | `probeCache` (indicators, ۶۰ث), `cachedProvider` | **به‌ازای هر پروسه** — در standalone تک‌پروسه ok؛ چند instance = ناهماهنگ |
| کش DB | `RefListCache` (لیست مرجع ARM + تنظیمات IG!), `SyncState` | بدون TTL ساخت‌یافته |
| کش کلاینت | tileSettings (zustand persist), secure-storage (token), Cache API + SW v3 | ✅ |
| صف/شغل | **وجود ندارد** — sync با setInterval در instrumentation؛ اسکن دیوار فرصت‌طلبانه روی GET | بدون Queue/Job/Dead-letter |
| لاگ | `console.log` پراکنده + `log:['query']` Prisma | 🔴 بدون Logger ساختاریافته — دستور بخش ۲۱ |

**مسیر هدف مطابق دستور بخش ۱۸:** SQLite فعلاً می‌ماند؛ abstraction لازم (Repository + UnitOfWork) تا مهاجرت آینده به PostgreSQL + Redis + pgvector + Queue + Object Storage بدون بازنویسی ایجنت‌ها ممکن باشد.

---

# ۱۱. Learning Map (نقشه یادگیری فعلی — صادقانه)

## ۱۱.۱ آنچه واقعاً وجود دارد (Feedback-Based Weighting)

```
submitFeedback(rating ±1)
  → ثبت در AgentFeedback (append-only ✅)
  → ثبت رویداد FEEDBACK در AgentMemory
  → reviewPolicyIfNeeded():
      کل تاریخچه بازخورد از ابتدا ← 🔴 محاسبه مجدد کامل
      امتیاز دامنه = Σ(+1/−1) روی کل تاریخچه ← 🔴 بازخورد قدیمی دوباره اثر می‌گذارد
      اگر |امتیاز| ≥ ۲: وزن += 0.15 × امتیاز (clamp 0.3..1.8)
      نسخه جدید Policy (append-only ✅) + rationale فارسی ✅
```

## ۱۱.۲ معیار سنجش «یادگیری واقعی» (مطابق دستور بخش ۱۵)

| معیار | وضعیت | شاهد |
|---|---|---|
| Learning Window (فقط بازخورد جدید) | ✗ | `base-agent.ts:243` — findMany بدون محدوده زمانی |
| اتصال به Outcome واقعی | ✗ | هیچ مسیری از تماس/مذاکره/معامله به بازبینی سیاست وجود ندارد |
| Candidate Policy + Shadow Evaluation | ✗ | نسخه جدید بلافاصله active می‌شود (`active:false` سپس در همان تراکنش فعال) |
| Metrics ارزیابی نسخه | ✗ | فقط rationale متنی |
| policyVersion/modelVersion/featureVersion/trainingWindow/evaluationWindow/approvedBy/status/rollbackTarget | ✗ (فقط tileId+version+content+rationale+active) | `policy.ts` |
| چرا نسخه جدید بهتر است؟ | **غیرقابل پاسخ** — هیچ سنجه‌ای قبل/بعد اندازه‌گیری نمی‌شود | — |

## ۱۱.۳ آنچه «یادگیری» نامیده می‌شود ولی نیست

1. **رندر بینش (learningDelta):** شباهت واژگانی عنوان بینش با خاطرات قدیمی × sentiment × 0.4 — این «حس موقعیت» است نه یادگیری؛ آستانه sim>0.05 و k=3 ثابت‌اند.
2. **دامنه LEARNING دیوار:** کارت بینش دلایل رد متداول را «گزارش» می‌کند؛ متن کارت ادعای تعدیل امتیاز آگهی‌های مشابه دارد اما **هیچ مسیر تعدیلی در scoring.ts/scan.ts وجود ندارد** — شکاف ادعا/پیاده‌سازی.
3. **مهاجرت‌های تنظیمات دیوار (v2→v3):** migration داده تنظیمات است نه یادگیری.

## ۱۱.۴ ظرفیت یادگیری موجود (سرمایه اولیه ارتقا)

- زیرساخت Append-only سه‌جدوله (Memory/Feedback/PolicyVersion) — پایه Memory Engine آینده.
- Rollback سیاست + rationale — پایه Governance آینده.
- موتورهای امتیاز دهنده با سیگنال‌های واقعی (شخصی‌بودن ۷ گروه واژگان + سیگنال رسمی کنار، زیرقیمت با میانه محله + armWeight، ۶ فاکتور «سایر») — پایه Feature Engine.
- `buildCustomerManagement` با NBA و امتیاز سلامت — پایه Decision Engine دامنه مشتری.

---

# ۱۲. Memory Map (نقشه حافظه فعلی)

## ۱۲.۱ ساختار فعلی

```
AgentMemory (هر ردیف: tileId, kind, payload JSON, createdAt)
  kinds ثبت‌شده: INTERACTION, FEEDBACK, POLICY_CHANGE
  + نوشتار مستقیم روت reject (kind=DIVAR_REJECT — خارج از کپسول ایجنت)

AgentFeedback (tileId, insightKey, insightTitle, rating, comment, context JSON)
```

## ۱۲.۲ شکاف نسبت به معماری هدف (دستور بخش ۷)

| ویژگی هدف | وضعیت |
|---|---|
| memoryType (Working/Episodic/Semantic/Procedural/Strategic/Institutional) | ✗ — فقط kind رشته‌ای آزاد |
| tenantId | ✗ |
| source/provenance | ✗ |
| confidence/importance | ✗ |
| validFrom/validUntil (انقضا/بازاعتبارسنجی) | ✗ |
| embeddingRef | ✗ — هیچ embedding وجود ندارد |
| context ساخت‌یافته | نیمه — contextSnapshot در بازخورد اختیاری است |
| ایزوله‌سازی per-agent | ✅ با tileId |
| Institutional Memory | ✗ — هیچ مسیر Promotion وجود ندارد |

## ۱۲.۳ رفتار حافظه — مشکلات عملیاتی

| مشکل | توضیح | اثر |
|---|---|---|
| رشد نامحدود INTERACTION | هر GET insight یک ردیف می‌نویسد (`base-agent.ts:341-347`) | جدول باد می‌کند؛ سیگنال/نویز پایین |
| بازیابی سنگین | `retrieveRelevant` هر بار ۲۰۰ feedback + ۲۰۰ memory را لود و بردار TF می‌سازد؛ در renderInsights برای هر کارت بینش تکرار می‌شود (N+1) | تأخیر رندر بینش با رشد جدول |
| برش خام متن | `payload.slice(0,400)` ممکن است وسط JSON/واژه ببرد | بازیابی ناقص |
| یکنواختی عملکرد | حافظه فقط وزن نمایش بینش را تغییر می‌دهد — **هیچ حافظه‌ای روی خودِ محتوا/امتیاز/اقدام اثر ندارد** | سقف ارزش یادگیری |

---

# ۱۳. Current RAG Map (نقشه RAG فعلی)

## ۱۳.۱ خط تولید فعلی (Prototype)

```
Query (عنوان بینش + دامنه)
  → termVector() — بردار فراوانی واژه فارسی (بدون ریشه‌یابی، بدون حذف stopword فارسی)
  → cosineSimilarity با هر یک از ۴۰۰ قطعه (۲۰۰ feedback + ۲۰۰ memory اخیر)
  → فیلتر sim > 0.05 → top-k (k=3)
  → استفاده: فقط learningDelta برای وزن نمایش
```

## ۱۳.۲ شکاف نسبت به RAG هدف (دستور بخش ۹)

| مرحله هدف | وضعیت |
|---|---|
| Embedding معنایی | ✗ — TF واژگانی (فارسی؛ ناهم‌ریختگی واژگان = شبیهت صفر) |
| Metadata Filter (agent/tile/domain/city/area/propertyType/tradeType/time/source/confidence/tenant/validity) | ✗ — فقط tileId |
| Vector Search | ✗ — اسکن خطی ۴۰۰ ردیف در حافظه |
| Keyword/Hybrid Search | ✗ |
| Reranking | ✗ |
| Context Assembly ساخت‌یافته | ✗ — متن خام بریده‌شده |
| Reasoning | ✗ — فقط عدد شباهت |
| Citation/Provenance | نیمه — weightSource متنی است، ارجاع به رکورد مشخص نیست |

**حکم:** مطابق دستور، این Layer به‌عنوان **Prototype** نگه داشته می‌شود و RAG واقعی در PHASE 5 با قرارداد Metadata پایه ساخته می‌شود (بدون افزودن Vector DB پیش از طراحی قراردادها).

---

# ۱۴. Prediction Capability Map (نقشه قابلیت پیش‌بینی)

## ۱۴.۱ «پیش‌بینی‌های» موجود و ماهیت واقعی آن‌ها

| ادعای فعلی | محل | ماهیت واقعی | ارزیابی‌پذیر؟ |
|---|---|---|---|
| پیش‌بینی دلایل رد (۱۳ قاعده با احتمال ۷۰/۷۵/۶۰/۵۵/۴۵/۴۰/۲۵/۱۰) | `scoring.ts predictRejectReasons` | **احتمال‌های هاردکد توسط طراح** — نه برآورد آماری | ✗ — هیچ رکوردی برای مقایسه با واقعیت ذخیره نمی‌شود |
| «پیش‌بینی درآمد» مالی | finance-agent | میانگین قیمت دیوار × تعرفه × ۲ | ✗ — نه از قراردادها، نه قابل ارزیابی |
| باکت شکار/پیگیری/بررسی | scoring + config thresholds | طبقه‌بندی قطعی قاعده‌محور | ✗ — cut خشک بدون عدم‌قطعیت |
| Golden Opportunity Score (totalScore 0-100) | scoring.computeTotalScore | امتیاز ترکیبی وزنی قاعده‌محور | ✗ — هیچ‌وقت با «آیا واقعاً شکار شد؟» مقایسه نمی‌شود |
| Health Score / NBA مشتری | customer-mgmt | امتیاز وزنی + قواعد اولویت | ✗ — پیامد اقدام هرگز ثبت نمی‌شود |

## ۱۴.۲ ارزیابی صریح

**هیچ‌کدام از موارد بالا Prediction به معنای دستور بخش ۱۱ نیستند** — زیرا:
1. خروجی استاندارد `PredictionResult {probability, confidence, expectedValue, expectedTimeWindow, drivers, risks, assumptions, modelVersion, featureVersion, predictionId}` وجود ندارد.
2. هیچ رکورد Outcome مرتبطی ساخته نمی‌شود.
3. هیچ سنجه ارزیابی (Calibration/Brier/Lift) محاسبه نمی‌شود.
4. نسخه مدل/ویژگی قفل نمی‌شود → مقایسه نسخه‌ها ناممکن است.

**نکته مثبت:** سیگنال‌های خام لازم (قیمت/متراژ/واژگان/زمان انتشار/رفتار آگهی‌دهنده/تاریخچه تماس‌ها در RequestEventRecord) هم‌اکنون در دسترس‌اند — یعنی مسیر PHASE 6-7 (Feature+Prediction+Outcome) داده‌محور مسیر دارد، نه صفر.

## ۱۴.۳ طراحی اولیه Prediction برای فایل‌یابی (مطابق دستور بخش ۲۳)

```
PredictionResult برای هر آگهی شکار:
  personalProbability, underpriceProbability, contactProbability,
  ownerVerificationProbability, negotiationProbability,
  crmRegistrationProbability, transactionProbability,
  expectedRevenue, expectedTimeToConversionDays
  + predictionId, modelVersion, featureVersion, contextSnapshot
Outcome (از ثبت‌های واقعی کاربر):
  contacted / ownerVerified / negotiated / crmRegistered / transactionClosed
Evaluation:
  Brier Score per probability + calibration curve + lift@k
```

---

# ۱۵. Decision Capability Map (نقشه قابلیت تصمیم)

## ۱۵.۱ وضعیت فعلی

- **تصمیم‌های سیستمی:** همه قاعده‌محور و توزیع‌شده در ایجنت‌ها/لیب‌ها (shouldAutoReject، باکت‌بندی، NBA، CHURN alert). خروجی: بینش/کارت — نه ساختار Decision.
- **تصمیم‌های حساس انسانی:** ثبت در ARM، انتقال CRM، انتشار Instagram — همه با تأیید صریح کاربر ✅ (الگوی خوب Human-in-the-loop).
- **LLM:** وجود ندارد → قاعده «LLM → Security Decision» فعلاً برقرار است.
- ساختار خروجی `Decision {reason, evidence, confidence, risk, alternatives, requiredApproval}` **وجود ندارد**.
- هیچ Risk Engine / Policy Engine مستقلی وجود ندارد.

## ۱۵.۲ ارزیابی Self-Diagnosis و Self-Repair (دستور ۱۳-۱۴)

| قابلیت | وضعیت |
|---|---|
| تشخیص خرابی خودکار | فقط «self-seeding» sync در صورت کش خالی + شاخه liveError در ۲ ایجنت — **به معنای واقعی نیست** |
| Health Model (Input/Data/Integration/Prediction/Memory/Latency/ErrorRate/Drift/OutcomeAccuracy) | ✗ |
| Detect→Diagnose→Explain→Prioritize→Recommend | ✗ |
| Self-Repair با Pipeline (Sandbox→Approval→Rollback) | ✗ — و مطابق دستور، **بدون Governance پیاده نمی‌شود** |

---

# ۱۶. Observability Map (نقشه رصدپذیری)

| بعد | وضعیت فعلی | شکاف |
|---|---|---|
| Logger ساختاریافته | ✗ — `console.log` پراکنده (فقط sync موفق در instrumentation) | بدون requestId/traceId/userId/tenantId/agentId/tileId/operation/duration/status/errorCode (دستور بخش ۲۱) |
| Prisma Logging | 🔴 `log:['query']` در **همه محیط‌ها** فعال (`db.ts:10`) | نویز + افشای داده در لاگ + کندی |
| متریک‌ها | ✗ | هیچ Metric/Series ثبت نمی‌شود |
| Tracing | ✗ | — |
| Health Endpoint | `/api/health` عمومی (وضعیت بوت + نسخه) | افشای آدرس API داخلی؛ سنجش واقعی وابستگی‌ها در `/api/connection/status` (گارددار) |
| Audit | `AuditLog` برای ورود/خروج/sync/lookup ✅ | اما sync با توکن Singleton، بازیگر واقعی را ثبت نمی‌کند (SEC-3) |
| خطای پس‌زمینه | `catch {}` بی‌صدا در instrumentation tick | تیک ناموفق هیچ ردی ندارد |
| Application Performance | ✗ | — |

**طرح:** Logger ساختاریافته JSON با زمینه‌های اجباری + سطح محیطی + ممنوعیت لاگ داده حساس (توکن/OTP/موبایل) — پیش‌نیاز GATE-L.

---

# ۱۷. Test Coverage Map (نقشه پوشش تست)

## ۱۷.۱ وضعیت واقعی (اجرا‌شده)

**۲۸۹ تست سبز / ۰ شکست / ۱٬۱۳۵ ادعا / ۱۲ فایل / ~۰.۸ ثانیه** روی `db/test.db` ایزوله.
> اصلاح مستندات: عدد «۱۶۱» قدیمی است.

| فایل تست | تست | پوشش |
|---|---|---|
| divar.test | ۷۵ | parse/scoring/filters/باکت/قانون مالک/ردها — جامع‌ترین |
| request.test | ۳۱ | اعتبارسنجی + تطبیق + سلامت + NBA |
| new-tiles-2.test | ۲۷ | کمیسیون/قرارداد/باشگاه/شاخص + ثبت ۴ کاشی |
| new-tiles.test | ۲۵ | آداپتورها + زنجیره استعلام با fetch ماک |
| listing.test | ۲۹ | اعتبارسنجی + payload آرم + محتوای IG |
| format.test | ۲۷ | ارقام فارسی + جلالی |
| analyzers.test | ۱۸ | ۱۳ تابع از ۲۰ تحلیل‌گر |
| melk-api.test | ۲۱ | client/config/AES/آداپتور |
| agent.test | ۱۲ | چرخه کامل یادگیری پایه با TestAgent مصنوعی |
| tile-registry.test | ۹ | قرارداد + رجیستری + نقش |
| management-dashboard.test | ۷ | ساختار ۵ ریشه + ۹ فرزند |
| crypto.test | ۸ | توکن/هش/safeEqual/فرمت‌ها |

## ۱۷.۲ شکاف‌های بحرانی پوشش (Test Pyramid)

| سطح هرم | وضعیت |
|---|---|
| Unit (خالص) | ✅ قوی — analyzers/scoring/commission/format |
| Domain | 🟡 نیمه — customer-mgmt پوشش دارد، sync/arm-register خیر |
| Repository | ✗ — لایه وجود ندارد |
| Integration (HTTP route) | 🔴 **صفر تست روی ۴۸ روت** — تست‌ها منطق را «موازی-بازنویسی» می‌کنند؛ روت از lib جدا شود، تست کور می‌شود |
| Agent (تخصصی) | 🔴 `computeRawInsights` هیچ‌کدام از ۱۲ ایجنت واقعی تست نشده |
| API | ✗ |
| E2E | فقط اسکریپت `e2e-publisher-scan.ts` — ⚠️ با **پایگاه production** (custom.db) اجرا می‌شود |
| **AI Evaluation** (دستور بخش ۲۲) | ✗ — Golden Dataset / Precision / Recall / Calibration / Brier / Drift هیچ‌کدام وجود ندارد |

## ۱۷.۳ ریسک‌های کیفی تست

- `agent.test.ts` به وضعیت تجمعی بین تست‌ها وابسته است (نسخه ≥۲ بعد از تست قبلی) — شکست وسط راه آلودگی می‌گذارد.
- بلوک‌های DB در divar.test بدون teardown کامل — singleton تنظیمات جهانی می‌ماند.
- آدرس‌های production واقعی در melk-api.test قفل شده (عمدی، شکننده).

---

# ۱۸. Technical Debt Map (نقشه بدهی فنی)

| # | بدهی | محل | شدت | پیشنهاد | اثر جانبی |
|---|---|---|---|---|---|
| D1 | `log:['query']` دائمی | db.ts:10 | متوسط | شرطی بر NODE_ENV | — |
| D2 | `new PrismaClient()` در هر tick | instrumentation.ts:24 | متوسط | استفاده از singleton db | — |
| D3 | `ignoreBuildErrors: true` در next.config | next.config.ts | بالا | فعال‌سازی تایپ‌strict + رفع خطاها | احتمال شکست build تا رفع — باید تدریجی |
| D4 | PII مالک هاردکد در سورس | session.ts:162, schema.prisma:2 | متوسط | انتقال به env | — |
| D5 | کدهای مرده: `getKenarKey()`, `divarSecretEnvKey()`, `onRejected`, `lineId: undefined:undefined`, توکن پیامکی دیوار بلااستفاده | چند فایل | کم | پاکسازی | — |
| D6 | status code با زیررشته فارسی | ۲ روت register/transfer | بالا | پرچم خطای ساختاری | — |
| D7 | ناسازگاری ریست: روت reset = ۳ جدول، resetCrmCache = ۶ جدول | connection/reset vs sync.ts:361 | بالا | یک منبع واحد | — |
| D8 | دو نگاشت ناسازگار دسته دیوار→ARM (ObjectId vs برچسب فارسی) | listing/store vs register route | متوسط | یکسان‌سازی | — |
| D9 | تاریخ ناموجود معامله → `new Date()` (داده ساختگی) | adapters.ts:130 | متوسط | null | تحلیل سری زمانی کمی تغییر |
| D10 | followersCount همیشه null | instagram/store.ts:43 | کم | رفع | — |
| D11 | `normalizeName` بی‌اثر (replace خود بر خود) | customer-mgmt.ts:554 | کم | ي/ك عربی→فارسی | — |
| D12 | توکن IG حتی هنگام شکست آزمون ذخیره می‌شود | instagram/store.ts:92 | متوسط | ذخیره فقط پس از تست موفق | — |
| D13 | `as RequestMetaResponse` و castهای آلوده | UI چند نقطه | کم | اصلاح تایپ | — |
| D14 | ۱۰ دامنه بدون ترجمه در DOMAIN_FA + ۵ مدخل مرده | AgentPanel.tsx:62-115 | کم | تکمیل نقشه | — |
| D15 | وابستگی useEffect گم‌شده در RequestsPage | RequestsPage:94-97 | کم | رفع | — |
| D16 | `ui/form.tsx` + react-hook-form + Zod نصب ولی بلااستفاده؛ ~۲۰ کامپوننت ui مرده | پروژه | کم | تصمیم راهبردی در PHASE 1 | — |

---

# ۱۹. Duplication Map (نقشه تکرار کد)

| الگوی تکرار | نسخه‌ها | تخمین فشردگی | اقدام |
|---|---|---|---|
| **تازه‌سازی توکن ARM** | ۴ پیاده‌سازی: `execWithArmToken` (crm-transfer), `withArmRefresh` (crm/lookup), inline (divar register), `syncWithRefresh` | ~۱۲۰ خط | تابع واحد `withArmToken()` در لایه L7 |
| **پیش‌نمایش جستجوی مشتری** (`users/info/mobile-number`) | ۵ نقطه (۲ روت GET + users/lookup + داخل resolveCustomer ×۲) | ~۱۵۰ خط | سرویس مشترک `CustomerLookupService` |
| **قالب صفحه گزارش CRM** (DataSourceInfo + بویلرپلیت load/toast + Alert منبع + KPI) | ۸ صفحه — `DataSourceInfo` ۴ بار تعریف مستقل، load-callback ~۲۸ بار | ~۸۰۰-۱٬۲۰۰ خط | استخراج `shared/` کاشی + `KpiCard` + `useTileData` |
| **گزارش گام‌های ARM** (TransferStepUI vs ArmStepReport + stepIcon) | ۲ نسخه یکسان | ~۱۰۰ خط | `<StepReportList>` مشترک |
| **ویزارد ثبت** (NewRequestDialog ۹۱۶ / NewListingDialog ۶۷۷) | ۲ ویزارد با ۲۵+ useState پراکنده | ~۴۰۰-۶۰۰ خط | فریم‌ورک ویزارد یا react-hook-form موجود |
| **تبدیل ارقام فارسی** | ۷+ پیاده‌سازی (parse, normFa, enDigits, faDigitsLocal, regex inline ×۲, parseAmount, toLatinDigits محلی) | ~۸۰ خط | یک `lib/format` واحد (موجود است — متمرکز شود) |
| **هلپرهای محلی روت‌ها** | num()×۴, parseJson()×۳, بلاک dataSource×۸ | ~۱۵۰ خط | ماژول مشترک BFF |
| **برچسب‌های دسته موازی** | CATEGORY_LABELS (AdCard) vs متای سرور vs CATEGORY_FA (PriceIndex) | ۳ منبع حقیقت | یک enum دامنه |

**جمع قابل فشردشده تخمینی:** ~۱٬۸۰۰-۲٬۲۰۰ خط (~۸٪ کدبیس) — بدون تغییر رفتار، فقط در PHASE 1-2 همراه با تست‌های رگرسیون.

---

# ۲۰. Critical Bugs (باگ‌های بحرانی)

## ۲۰.۱ باگ‌های فعال شناسایی‌شده

| # | باگ | محل | شدت | توضیح | اثر جانبی رفع
|---|---|---|---|---|---|
| B1 | ۴+ روت بدون try/catch → 500 خام بدون پاکت فارسی | auth/session (۳ متد), divar/scan POST, divar/reject POST | بالا | خطای DB → صفحه خطای خام | UI پیام بهتری می‌گیرد |
| B2 | باگ خود-تمدید قفل OTP: RATE_LIMITED به‌عنوان تلاش ناموفق ثبت می‌شود | request-otp:44-47, verify-otp | بالا | پنجره قفل با هر درخواست throttled دوباره پر می‌شود — کاربر بی‌گناه قفل می‌ماند | رفتار قفل کمی کوتاه‌تر می‌شود |
| B3 | JSON.parse بدون try/catch روی داده ذخیره‌شده | listings/[id] PATCH:78-82 | بالا | JSON خراب قبلی → 500 دائمی روی آن رکورد | — |
| B4 | status code با جستجوی زیررشته فارسی «کامل نیست» | requests/[id]/register:107, listings/[id]/transfer-crm:108 | بالا | تغییر پیام = شکست منطق | — |
| B5 | ناسازگاری reset: ۳ جدول vs ۶ جدول | connection/reset:36-38 vs resetCrmCache | بالا | کاربر فکر می‌کند ریست کامل شده | ریست واقعاً کامل می‌شود |
| B6 | ensureSeeded بدون قفل همزمانی | sync.ts:343-358 + ۹ روت GET | بالا | دو درخواست همزمان با کش خالی → دو تراکنش deleteMany/create موازی → P2002/شکست | نیاز به in-flight lock (الگوی divar scan موجود است) |
| B7 | ناسازگاری HTTP 200 + ok:false | requests/meta/form:124-137, divar/connection start-phone | متوسط | کلاینت خطا را موفق می‌شمارد | — |
| B8 | فیلتر تاریخ بدون اعتبارسنجی → Invalid Date → 500 | crm/* | متوسط | — | — |
| B9 | lastSeenAt UPDATE در هر درخواست | session.ts:76 | متوسط | write-amplification روی SQLite | throttle ۵ دقیقه‌ای |
| B10 | `cast t.icon as unknown as LucideIcon` + ignoreBuildErrors | DashboardHome:63, next.config | متوسط | پوشش خطای تایپ | — |

## ۲۰.۲ نوشتن روی GET — فهرست کامل تأییدشده (دستور بخش ۱۶)

| # | روت | نوشتن | کد |
|---|---|---|---|
| W1 | GET /api/agent/[tileId]/insight | `agentMemory.create(INTERACTION)` در هر باز شدن + ایجاد سیاست نسخه ۱ در اولین GET | base-agent.ts:341-347, 91-106 |
| W2 | GET /api/crm/price-index | `priceIndexHistory.create` (dedup روزانه) | route:25-48,96 |
| W3 | GET /api/divar/ads + scan | تحریک اسکن پس‌زمینه → upsert سه جدول | ads:21-24, scan:27-30 |
| W4 | GET /api/listings | `importRegisteredDivarAds` → ایجاد رکورد | listings:29 |
| W5 | GET /api/crm/* (۹ روت) | `ensureSeeded` → در صورت کش خالی sync کامل ۶ جدول | sync.ts:343-358 |
| W6 | هر درخواست گارددار | `session.lastSeenAt` UPDATE | session.ts:76 |

**طرح تفکیک رویدادها (مطابق دستور):** `INSIGHT_GENERATED / INSIGHT_VIEWED / INSIGHT_OPENED / INSIGHT_ACCEPTED / INSIGHT_REJECTED / ACTION_TAKEN / OUTCOME_RECEIVED` — رندر بینش خواندنی می‌شود؛ ثبت تعامل به رویداد صریح کلاینت (POST) یا Batch Writer غیرهمگام منتقل می‌شود.

---

# ۲۱. Architectural Risks (ریسک‌های معماری)

| # | ریسک | احتمال | اثر | ریشه | درمان (فاز)
|---|---|---|---|---|---|
| R1 | **سقف هوشمندی:** تا وقتی یادگیری به Outcome متصل نیست، هر بهبود «توهمی» است — سیستم هرگز نمی‌فهمد کجا اشتباه کرده | قطعی (فعلاً محقق) | کل ارزش AI زیر سؤال | F1/F3 | PHASE 6-7 |
| R2 | **تک‌نقطه خرابی SyncState:** یک singleton برای توکن + وضعیت + seed-check چند مسیر | بالا | خرابی قفل‌گشا/تداخل | SEC-3, H2 | PHASE 2, 12 |
| R3 | **مقیاس‌ناپذیری sync تمام‌جایگزین:** هر ۵ دقیقه deleteMany×6+create با id ناپایدار | بالا (با رشد داده قطعی) | P2002، گم‌شدن پیوند خارجی، قطعی داده لحظه‌ای | H1 | PHASE 2 |
| R4 | **درهم‌تنیدگی دامنه/دسترسی:** ایجنت‌ها همزمان Repository+Domain+Integration+Policy اند | قطعی | تست‌ناپذیری، مهاجرت DB = بازنویسی ایجنت | نقض‌های §۳ | PHASE 1-3 |
| R5 | **وابستگی زنده ایجنت به شبکه:** finance/price-index در مسیر رندر بینش HTTP می‌زنند | متوسط | کندی/ناپایداری رندر؛ شکست آبشاری | §۵.۲ | PHASE 3 |
| R6 | **بلاک شدن IP دیوار:** اسکرپینگ بدون throttle با UA جعلی | متوسط-بالا | ازکارافتادن کاشی فایل‌یابی | SEC-7 | PHASE 12 |
| R7 | **آلودگی Singletonها برای چند-کاربر/شهر:** تنظیمات دیوار/IG/PM بدون tenant | متوسط | در استقرار multi-user رفتار نامعین | §۷.۲ | PHASE 2, 12 |
| R8 | **بدهی تایپ پنهان:** ignoreBuildErrors خطاهای واقعی را می‌پوشاند | متوسط | regression خاموش | D3 | PHASE 1 |
| R9 | **تست‌های موازی-بازنویسی:** پوشش روت‌ها کاذب است؛ هر ریفکتور لایه‌ای تست‌ها را کور می‌کند | بالا | ریسک PHASE 1-2 | §۱۷.۲ | هر فاز: تست قبل از ریفکتور |
| R10 | **حافظه فقط وزن نمایش را تغییر می‌دهد:** حتی با RAG/Memory کامل، اگر خروجی فقط «ترتیب بینش» باشد ارزش کسب‌وکاری محدود است | قطعی (طراحی فعلی) | سقف ROI هوش | §۱۲.۳ | PHASE 3-8 (Action Planner) |

---

# ۲۲. Refactoring Plan (برنامه بازآفرینی — PHASE 0 تا ۱۲)

> اصل: هر فاز = ریفکتور محدود + تست رگرسیون + عبور از GATE مربوطه. هیچ فازی کار فاز بعد را جلو نمی‌اندازد. BaseLearningAgent حذف نمی‌شود — به‌تدریج ارتقا می‌یابد.

## PHASE 0 — Full Audit ✅ (همین گزارش)
خروجی: ۲۵ نقشه + ۵ یافته تعیین‌کننده + طراحی هدف. GATE-A/B/C قابل امضاست.

## PHASE 1 — Layer Refactor (بدون تغییر رفتار)
| اقدام | فایل‌ها | شرط پایان |
|---|---|---|
| انتقال `LIFECYCLE_FA/LIFECYCLE_COLOR/ACTION_FA` به ماژول خالص + ممنوعیت import سرور در کلاینت | `request/CustomerManagementPanel`, `customer-mgmt.ts` | `tsc --noEmit` بدون خطا |
| استخراج اشتراک‌های UI: `KpiCard`, `DataSourceInfo`, `useTileData`, `StepReportList` | ۸ صفحه CRM + ۲ دیالوگ گام | ~۱٬۵۰۰ خط کاهش؛ تست UI دستی + رگرسیون |
| انتقال منطق دامنه از UI به سرور: سری ماهانه/درجه همکاری/آستانه‌ها → API یا ایجنت | ۶ صفحه | رفتار ثابت (مقادیر یکسان) |
| خاموشی `ignoreBuildErrors` (تدریجی: ابتدا فقط خطاهای جدید) | next.config.ts | build سبز |
| حذف کدهای مرده (D5, A7) | چند فایل | grep صفر رفرنس |

**GATE بستن فاز:** تایپ‌چک سبز + ۲۸۹ تست سبز + رفتار UI بدون تغییر قابل مشاهده.

## PHASE 2 — Repository / Data Boundary
| اقدام | قرارداد |
|---|---|
| ایجاد `core/repositories/`: `TransactionRepository, CustomerRepository, ListingRepository, VisitRepository, MarketRepository, AgentMemoryRepository, PredictionRepository, OutcomeRepository` | Interface-first؛ Prisma فقط در پیاده‌سازی `infrastructure/prisma/*` |
| انتقال ~۴۶ فراخوانی db.* ایجنت‌ها + ۲۰ روت به Repository | جایگزینی مکانیکی؛ رفتار یکسان |
| قفل همزمانی sync (الگوی `__divarScanRunning`) + یکسان‌سازی ریست (۶ جدول) + حذف `armTokenEnc` از SyncState (رفع SEC-3) | sync از instrumentation فقط با service-account |
| آغاز Incremental Sync: upsert با کلید طبیعی (کد ARM) به‌جای id با `Date.now()`؛ فاز بعدی cursor | دیتای موجود حفظ شود (بکاپ قبل از مهاجرت) |
| Logger ساختاریافته + حذف `log:['query']` + رفع D1/D2 | فیلدهای اجباری دستور بخش ۲۱ |

**GATE:** تست‌های Repository سبز؛ ایجنت‌ها صفر import از `@prisma/client`؛ sync موازی بی‌خطا.

## PHASE 3 — BaseIntelligentAgent (ارتقا، نه جایگزینی)
```
BaseLearningAgent (دست‌نخورده — سازگاری عقب‌وار)
        ↓ extends
BaseIntelligentAgent
  ├── Context Engine    (زمینه: tile/user/market/time)
  ├── Memory Engine     (PHASE 4 تزریق می‌شود — اول interface)
  ├── Retrieval Engine  (اول Prototype فعلی — strategy pattern)
  ├── Feature Engine    (features از FeatureStore خالص)
  ├── Prediction Engine (interface — پیاده در PHASE 6)
  ├── Decision Engine   (interface — پیاده در PHASE 8)
  ├── Action Planner    (خروجی: پیشنهاد اقدام + requiredApproval)
  ├── Outcome Engine    (interface — PHASE 7)
  ├── Evaluation Engine (سنجه‌ها)
  ├── Learning Engine   (جایگزین تدریجی reviewPolicyIfNeeded)
  └── Safety/Policy Engine (چه چیزی مجاز است)
```
- انتقال ایجنت‌ها یکی‌یکی (اول `request` چون کامل‌ترین، بعد `divar`)؛ بقیه روی Base فعلی می‌مانند — سازگاری عقب‌وار.
- حذف I/O شبکه از computeRawInsights (داده از Repository/کش).
**GATE-D:** طرح BaseIntelligentAgent تأیید مالک + یک ایجنت مهاجرت‌یافته سبز.

## PHASE 4 — Memory Engine
- توسعه مدل: ستون‌های `memoryType, tenantId, source, context, confidence, importance, validFrom, validUntil, provenance, embeddingRef, createdBy` (_migration additive — پیش‌فرض‌های امن برای ردیف‌های قدیمی).
- شش نوع حافظه + دسترسی از طریق `AgentMemoryRepository` فقط.
- **Institutional Promotion:** قواعد confidence-threshold + repeated-evidence + provenance + validation + expiration/revalidation + human-approval برای موارد حساس. هیچ ایجنتی با یک تجربه ضعیف دانش سازمانی نمی‌سازد.
- تفکیک رویدادهای بینش (W1 → POST صریح).
**GATE-E.**

## PHASE 5 — RAG Engine (قرارداد اول، ابزار بعد)
1. قرارداد Metadata (دستور بخش ۹): agent/tile/domain/city/area/propertyType/tradeType/time/source/confidence/tenant/validity.
2. `RetrievalEngine` interface + پیاده‌سازی Hybrid: Prototype فعلی (TF) + BM25 سبک + (اختیاری آینده) embedding.
3. Context Assembly + Citation (ارجاع به memoryId/منبع).
4. فقط پس از قراردادها: تصمیم Vector DB (pgvector در فاز مقیاس).
**GATE-F.**

## PHASE 6 — Feature + Prediction Engine
- FeatureStore خالص (ملک: area/line/price/pricePerMeter/meterage/age/rooms/floor/publisher/text-signals/publication-time/price-changes/seller-behavior/market-stats — مشتری: recency/frequency/seriousness/budget/response-rate/activity/matching-history — کارشناس: activity/conversion/response/network/cooperation).
- `PredictionResult` استاندارد (دستور بخش ۱۱) + ثبت در `PredictionRepository`.
- مدل v0: heuristicهای موجود (scoring) به‌عنوان baseline قابل‌ارزیابی — نه حذف.
**بخش ویژه فایل‌یابی (دستور بخش ۲۳):** ثبت ۹ احتمال + درآمد موردانتظار + پنجره تبدیل برای هر شکار.

## PHASE 7 — Outcome Learning (مهم‌ترین توسعه)
- `OutcomeRecord` + Context Snapshot + اتصال به اقدامات واقعی (ثبت ARM/تماس/مذاکره/قرارداد — جریان‌های موجود داده‌ی رویداد را می‌دهند).
- Evaluation: Brier/Calibration/Lift/Conversion — گزارش «پیش‌بینی کجا درست/غلط بود».
- ورودی Learning Engine: فقط Outcome ارزیابی‌شده، نه بازخورد خام نامحدود.

## PHASE 8 — Decision Engine
- معماری دستور بخش ۱۲: LLM-Reasoning (آینده) + Domain Rules + Prediction + Risk Engine + Policy → `Decision{reason,evidence,confidence,risk,alternatives,requiredApproval}`.
- NBA فعلی customer-mgmt به این ساختار مهاجرت می‌کند.

## PHASE 9 — Evaluation + Governance
- Policy Lifecycle کامل (دستور بخش ۱۵): Learning Window → Reward → Candidate → Shadow/Offline Evaluation → Activation؛ metadata: policyVersion/modelVersion/featureVersion/trainingWindow/evaluationWindow/metrics/createdBy/approvedBy/status/rollbackTarget.
- Golden Dataset (دستور بخش ۲۶): برای فایل‌یابی ۱۰۰۰+ آگهی تاریخی + برچسب انسانی + نتیجه واقعی؛ ارزیابی هر نسخه.
- Drift Detection (بخش ۲۵): تشخیص تغییر Regime بازار → Revalidation/Retraining.

## PHASE 10 — Self-Diagnosis
- Health Model ۹ بُعدی + Detect→Diagnose→Explain→Prioritize→Recommend (بخش ۱۳ دستور).

## PHASE 11 — Controlled Self-Repair
- Pipeline اجباری ۹ مرحله‌ای (Detect→…→Rollback) با Auto-Apply فقط برای تغییرات کم‌خطر تعریف‌شده و Human Approval برای حساس (بخش ۱۴ دستور).

## PHASE 12 — Security + Scale Hardening
- SEC-1..SEC-8 (بخش §۹)، Rate Limit چندبعدی (user/ip/device/session/endpoint)، Session→user/tenant/device/session، Abstraction برای PostgreSQL+Redis+pgvector+Queue+ObjectStorage، Drift/Scale.

> **ترتیب غیرقابل جابه‌جاست** (دستور بخش ۲۸). هر Blocker → Alternative → Decision → Continue (نه STOP).

---

# ۲۳. Target Architecture (معماری هدف — ۹ لایه)

## ۲۳.۰ نمای کلی و قانون جریان

```
L1 Presentation ─────────┐
L2 Application/UseCase ──┤ هر لایه فقط به لایه‌های پایین‌تر از خودش import می‌کند
L3 Agent Orchestration ──┤
L4 Intelligence Core ────┤
L5 Domain/Business ──────┤
L6 Data Access/Repo ─────┤
L7 Integration/Adapter ──┘ (L7 از L5 استفاده می‌کند، از L1..L4 هرگز)
L8 Infrastructure/Jobs/Cache/Queue   (پیاده‌سازی L6/L7 را میزبانی می‌کند)
L9 Security/Governance/Observability (مقطعی — توسط همه استفاده، هیچ‌کس را import نمی‌کند جز L8)
```

## ۲۳.۱ L1 Presentation
- **ورودی:** state کاربر، props کاشی، DTOهای آماده نمایش (بینش/سنجه/فرم).
- **خروجی:** رویدادهای کاربر (فرم/بازخورد/تأیید) → فراخوانی L2؛ هیچ محاسبه دامنه‌ای.
- **اجازه import:** L2 (فقط از طریق کلاینت API)، TileContract (types)، ui Kit.
- **ممنوع:** Prisma، libهای سرور، fetch خام، منطق آستانه/تجمیع.
- **قرارداد:** `TilePageProps` فعلی حفظ می‌شود؛ DTO با Zod-parse در مرز.
- **تست:** storybook سبک + رگرسیون بصری + یکپارچگی قرارداد (contract test روی شکل DTO).

## ۲۳.۲ L2 Application / Use Cases
- **ورودی:** فراخوانی API (روت‌های BFF فعلی به این لایه تبدیل می‌شوند: thin controller → UseCase).
- **خروجی:** DTO پاسخ، فرمان به L3/L5/L6، شروع همگام‌سازی، ثبت رویداد.
- **اجازه import:** L3, L5, L6, L9 (اشاره قراردادی).
- **ممنوع:** Prisma مستقیم، HTTP خارجی مستقیم، رندر.
- **قرارداد:** `UseCase<Req,Res>` + Zod schema برای Req + پاکت خطای ساختاریافته یکسان.
- **تست:** integration هر UseCase با DB تست + mock L7.

## ۲۳.۳ L3 Agent Orchestration
- **مسئولیت:** انتخاب ایجنت، چرخه حیات، اولویت‌دهی، ترکیب خروجی چند ایجنت (آینده)، صف اقدامات، Human-Approval routing.
- **ورودی:** فرمان UseCase + Context (user/tile/time).
- **خروجی:** نتیجه ایجنت + اقدامات پیشنهادی + رویدادها.
- **اجازه import:** L4, L5 (فقط types/توابع خالص), L6 (از طریق قرارداد Repository), L9.
- **ممنوع:** Prisma، HTTP، React.
- **قرارداد:** `BaseIntelligentAgent` (PHASE 3) + AgentRegistry فعلی حفظ می‌شود.
- **تست:** تست ارکستراسیون با ایجنت‌های stub + تست تنهایی هر ایجنت با Repository in-memory.

## ۲۳.۴ L4 Intelligence Core (جدید — قلب ارتقا)
- **اجزا:** Context/Memory/Retrieval/Feature/Prediction/Decision/ActionPlanner/Outcome/Evaluation/Learning/Safety — هرکدام یک interface خالص + پیاده‌سازی قابل تعویض.
- **ورودی:** Features + Context + Query.
- **خروجی:** PredictionResult / Decision / Insight enriched / LearningSignal.
- **اجازه import:** L5 (types)، L6 (قرارداد Repository برای Memory/Prediction/Outcome) — **نه Prisma، نه HTTP**.
- **ممنوع:** هر وابستگی به Next.js/React/دیتابیس مشخص/LLM provider مشخص.
- **قرارداد:** تمام خروجی‌ها versioned + ارزیابی‌پذیر (predictionId → outcomeId).
- **تست:** Unit کامل (خالص) + AI Evaluation (Golden Dataset) — سطح جدید هرم تست.

## ۲۳.۵ L5 Domain / Business Rules
- **مسئولیت:** قواعد کسب‌وکار خالص: امتیازدهی ۱۰۰ نقطه‌ای، تعرفه کمیسیون، تطبیق درخواست↔آگهی، سلامت مشتری، NBA، تحلیل‌گرهای ۲۰گانه.
- **اجازه import:** هیچ‌چیز جز تایپ‌ها — **خالص مطلق**.
- **ممنوع:** Next.js، React، Prisma، fetch.
- **قرارداد:** توابع خالص + Feature version tag.
- **تست:** unit (موجود — تقویت شود).
- **نکته:** `analyzers.ts`, `scoring.ts`, `commission.ts`, `customer-mgmt` (بخش‌های خالص) هم‌اکنون این لایه‌اند — فقط جابه‌جایی فیزیکی + پاکسازی import.

## ۲۳.۶ L6 Data Access / Repository
- **اجازه import:** Prisma (تنها نقطه)، L5 types.
- **ممنوع:** منطق کسب‌وکار، HTTP.
- **قرارداد:** ۸+ Repository (دستور بخش ۱۷) + UnitOfWork + migration-safe.
- **تست:** repository test با SQLite تست؛ آمادگی PostgreSQL با همان interface.

## ۲۳.۷ L7 Integration / External Adapters
- **الگو:** `Integration → Adapter → Domain`: هر سیستم خارجی یک Adapter با DTO داخلی.
- **اجزا:** ArmAdapter, PmAdapter, FmAdapter, DivarWebAdapter, DivarKenarAdapter, InstagramAdapter — + `withArmToken` واحد (حذف ۴ نسخه).
- **اجازه import:** L5 (types/DTO)، L8 (config/logger).
- **ممنوع:** import از L1..L4؛ نوشتن مستقیم DB (نوشتن از طریق L6 توسط L2/L3).
- **تست:** contract test با recorded fixtures + resilience (retry/timeout/throttle).

## ۲۳.۸ L8 Infrastructure / Jobs / Cache / Queue
- **اجزا:** instrumentation واحد (با singleton db)، SyncJob (cursor/watermark/upsert/idempotency/retry/DLQ/syncVersion)، RefListCache، Queue برای اسکن دیوار و انتشار IG، ObjectStorage (آینده).
- **اجازه import:** L6, L7, L9.
- **تست:** job test با زمان شبیه‌سازی‌شده.

## ۲۳.۹ L9 Security / Governance / Observability
- **اجزا:** Auth/Guard/RateLimit چندبعدی، Session(user/tenant/device)، Policy Engine، Approval Gate، Rollback Registry، Logger ساختاریافته، Metrics، Tracing، AuditLog.
- **قاعده:** هیچ لایه‌ای Security Decision را از L4 (LLM) نمی‌پذیرد؛ گیت‌های انسانی اینجا اعمال می‌شوند.
- **تست:** security regression + audit assertion.

## ۲۳.۱۰ نگاشت مهاجرت واقعی→هدف (نمونه‌های کلیدی)

| فایل فعلی | لایه هدف | نکته |
|---|---|---|
| `core/tiles/tile-contract/registry/bootstrap` | L1 (قرارداد) | دست‌نخورده ✅ |
| `app/api/**/route.ts` | L2 (thin) | منطق به UseCase منتقل شود |
| `core/agent/base-agent.ts` | L3+L4 | BaseLearningAgent می‌ماند؛ BaseIntelligentAgent اضافه می‌شود |
| `core/agent/analyzers.ts` + `divar/scoring.ts` + `melk-api/commission.ts` | L5 | جابه‌جایی فیزیکی |
| `lib/request/customer-mgmt.ts` | L5 (خالص) + L3 (ارکستر) | جداسازی دو نقش |
| `lib/db.ts` + فراخوانی‌های db.* | L6 | Repository |
| `lib/melk-api/*`, `lib/divar/client`, `lib/instagram/client` | L7 | Adapter |
| `instrumentation.ts`, `sync.ts` | L8 | Job |
| `lib/auth/*` | L9 | Governance |

---

# ۲۴. Migration Plan (طرح مهاجرت — استراتژی بدون توقف)

## ۲۴.۱ اصول

1. **Strangler Fig به سبک خودمان:** هر ریفکتور در کنار کد قدیمی قرار می‌گیرد، تست تطابق می‌گیرد، سپس کد قدیمی حذف می‌شود. هیچ «قطع کامل» رخ نمی‌دهد.
2. **سازگاری عقب‌وار:** BaseLearningAgent می‌ماند؛ ایجنت‌های مهاجرت‌نکرده روی آن کار می‌کنند.
3. **هر مرحله با بکاپ `db/custom.db` + تست رگرسیون کامل (۲۸۹+) شروع می‌شود.**
4. **افزایشی برای Schema:** هر تغییر جدول additive + پیش‌فرض امن برای ردیف‌های قدیمی (بدون rewrite).
5. **Feature Flag فقط برای دو مورد پرریسک:** جدیدترین مسیر sync و رویدادهای بینش (INSIGHT_VIEWED) — بقیه تغییرات رفتاری هستند نه بصری.

## ۲۴.۲ توالی مهاجرت داده

| گام | تغییر | روش | بازگشت‌پذیری |
|---|---|---|---|
| M1 | ستون‌های جدید AgentMemory (memoryType, tenantId, ...) | additive + default (`memoryType='EPISODIC'` برای ردیف‌های موجود) | بکاپ |
| M2 | شناسه پایدار رکوردهای CRM (کلید طبیعی ARM) | migration یک‌باره: نگاشت id فعلی → کلید طبیعی؛ سپس upsert | بکاپ + نگاشت |
| M3 | جداول Prediction/Outcome/KnowledgeItem | جداول جدید — بدون دست‌زدن به داده موجود | trivial |
| M4 | Policy metadata (modelVersion/featureVersion/status/...) | additive با default | بکاپ |
| M5 | چرخش کلید رمزنگاری (SEC-2) | decrypt با قدیم → encrypt با جدید (اسکریپت یک‌باره در startup) + حذف fallback | کلید قدیم تا پایان migration |
| M6 | (آینده، خارج از این فاز) SQLite → PostgreSQL | Repository interface یکسان + اسکریپت انتقال | — |

## ۲۴.۳ مدیریت ریسک مهاجرت

- **قبل از هر گام:** بکاپ + تست سبز + فهرست «رفتارهایی که نباید تغییر کنند» (چک‌لیست رگرسیون دستی صاحب محصول).
- **بعد از هر گام:** تست سبز + مقایسه خروجی نمونه (مثلاً بینش فایل‌یابی قبل/بعد باید همان بینش‌ها با همان ترتیب باشد — برای سیاست فعال موجود).
- **Blocker encountered → Alternative → Decision → Continue** (دستور بخش ۳۰): مثلاً اگر ORM در گام M2 با حجم داده مشکل داد → نگاشت تدریجی batch-wise؛ اگر باز نشد → نگهداری id فعلی + جدول نگاشت جانبی. پروژه متوقف نمی‌شود.

---

# ۲۵. Acceptance Gates (دروازه‌های پذیرش)

> هر GATE فقط با «Implementation + Test + Evidence + Metric» امضا می‌شود (قانون عدم خودفریبی). وضعیت فعلی همه: **باز**.

| گیت | معیار عبور دقیق | وضعیت | مدرک لازم |
|---|---|---|---|
| **GATE-A** — Architecture Audit complete | این گزارش: ۲۵ بخش + هر فایل با مسئولیت/وابستگی/مشکل/شدت/پیشنهاد/اثر جانبی | ✅ کامل شد (این سند) | سند حاضر |
| **GATE-B** — Dependency violations identified | فهرست کامل نقض‌ها با شواهد خطی | ✅ (§۳: UI→Prisma ×۱، Agent→Prisma ×۴۶، Route→Prisma ×۲۰، I/O در ایجنت ×۲) | §۳ |
| **GATE-C** — Layer boundaries defined | ۹ لایه با ورودی/خروجی/قواعد import/قرارداد/تست | ✅ طراحی شد (§۲۳) — پیاده‌سازی در PHASE 1-2 | §۲۳ |
| **GATE-D** — BaseIntelligentAgent design approved | طرح ۱۱-موتوری + تأیید مالک + یک ایجنت مهاجرت‌یافته سبز | 🔓 پس از PHASE 3 | تست ایجنت مهاجر + سند تأیید مالک |
| **GATE-E** — Memory architecture implemented | ۶ نوع حافظه + metadata کامل + Institutional Promotion با قواعد ۶گانه | 🔓 پس از PHASE 4 | تست promotion + seed واقعی |
| **GATE-F** — Real RAG implemented | Hybrid (metadata filter + keyword + ranking) + citation؛ روی Golden queries دقت بازیابی > baseline TF | 🔓 پس از PHASE 5 | سنجه بازیابی (Recall@k, MRR) |
| **GATE-G** — Prediction/Outcome loop implemented | هر Prediction رکورد دارد؛ Outcome واقعی متصل می‌شود؛ گزارش Brier/Calibration تولید می‌شود | 🔓 پس از PHASE 6-7 | ≥۵۰ نمونه outcome ثبت‌شده + گزارش ارزیابی |
| **GATE-H** — Decision Engine implemented | خروجی Decision استاندارد با evidence/risk/alternatives/requiredApproval؛ LLM حق تصمیم حساس ندارد | 🔓 پس از PHASE 8 | تست تصمیم + رد مسیر غیرمجاز |
| **GATE-I** — Evaluation/Governance implemented | Policy Lifecycle با shadow evaluation + rollback واقعی + Golden Dataset + سنجه‌های AI Eval | 🔓 پس از PHASE 9 | مقایسه نسخه سیاست با metric |
| **GATE-J** — Self-Diagnosis implemented | Health Model ۹بُعدی + گزارش Detect→Recommend | 🔓 پس از PHASE 10 | تزریق خطای عمدی + تشخیص صحیح |
| **GATE-K** — Controlled Self-Repair implemented | Pipeline ۹مرحله‌ای + sandbox + approval gate + rollback موفق در تست | 🔓 پس از PHASE 11 | تمرین rollback ثبت‌شده |
| **GATE-L** — Production hardening complete | SEC-1..8 بسته + rate limit چندبعدی + بدون fallback secret + logger ساختاریافته + load test | 🔓 پس از PHASE 12 | گزارش امنیت + بوت بدون env = fail-fast |

---

# پیوست الف — پاسخ به ۱۷ پرسش Definition of Done (دستور بخش ۳۱)

| # | پرسش | پاسخ کوتاه | ارجاع |
|---|---|---|---|
| ۱ | هر فایل چه مسئولیتی دارد؟ | جدول مسئولیت ۱۵ فایل حیاتی + نگاشت هر ۹۰+ فایل به خانواده | §۱.۲، §۲ |
| ۲ | هر Agent چه می‌داند؟ | جدول ۱۲ ایجنت با منابع دانش و هوش دامنه‌ای هر یک | §۵.۲ |
| ۳ | هر Agent چه چیزی را ذخیره می‌کند؟ | AgentMemory (INTERACTION/FEEDBACK/POLICY_CHANGE + DIVAR_REJECT خارج از کپسول) + AgentFeedback + PolicyVersion — همه append-only | §۱۲ |
| ۴ | هر Agent از چه چیزی یاد می‌گیرد؟ | فعلاً فقط بازخورد ±۱ کاربر روی «دسته بینش»؛ ریشه‌های Outcome/بازار متصل نیستند | §۱۱ |
| ۵ | هر Prediction چگونه ساخته می‌شود؟ | فعلاً: قواعد وزنی با آستانه‌های هاردکد (توضیح کامل هر موتور). هدف: PredictionResult استاندارد از Feature Engine | §۱۴، §۲۲-P6 |
| ۶ | چگونه می‌فهمیم Prediction درست بوده؟ | **فعلاً نمی‌فهمیم** — هیچ رکورد Outcome وجود ندارد. طرح: OutcomeRecord + Brier/Calibration | §۱۴.۲، §۲۲-P7 |
| ۷ | Outcome چگونه وارد Learning می‌شود؟ | فعلاً وارد نمی‌شود. طرح: Evaluation→Reward→Candidate Policy (نه بازخورد خام) | §۱۱.۲، §۲۲-P7/P9 |
| ۸ | Policy چگونه تغییر می‌کند؟ | فعلاً: بازبینی پس از هر بازخورد اگر ≥۵ بازخورد و |امتیاز دامنه|≥۲ → وزن±۰٫۱۵×امتیاز (clamp ۰.۳-۱.۸) + نسخه جدید | §۱۱.۱ |
| ۹ | چرا Policy جدید بهتر است؟ | **فعلاً اثبات‌شده نیست** — هیچ سنجه before/after نیست. طرح: shadow evaluation با metric | §۱۱.۲، GATE-I |
| ۱۰ | چگونه Rollback انجام می‌شود؟ | `rollbackPolicy(v)`: تراکنش غیرفعال‌سازی نسخه فعال + فعال‌سازی v + ثبت POLICY_CHANGE — نسخه‌ها هرگز حذف نمی‌شوند | §۱۱.۱ |
| ۱۱ | RAG چگونه کار خواهد کرد؟ | خط ۸ مرحله‌ای: Query→Embedding→MetadataFilter→VectorSearch→Hybrid→Rerank→ContextAssembly→Citation؛ ابتدا با BM25+TF hybrid، Vector DB فقط پس از قراردادها | §۱۳، §۲۲-P5 |
| ۱۲ | Memory چگونه اعتبارسنجی می‌شود؟ | فعلاً نمی‌شود. طرح Promotion: confidence-threshold + repeated-evidence + provenance + validation + expiration + human-approval حساس | §۲۲-P4 |
| ۱۳ | Agent چگونه Failure خودش را تشخیص می‌دهد؟ | فعلاً نمی‌دهد (فقط .catch در ۳ ایجنت). طرح: Health Model ۹بُعدی | §۱۵.۲، §۲۲-P10 |
| ۱۴ | چگونه Fix پیشنهاد می‌کند؟ | طرح: Diagnose→Fix Proposal→Risk Assessment (PHASE 11) | §۲۲-P11 |
| ۱۵ | چه Fixهایی Auto-Apply هستند؟ | طبق طرح: فقط کم‌خطرِ فهرست‌بسته (مثلاً پاک‌سازی کش، تلاش مجدد sync، re-scan) — هرگز تغییر سیاست/کد/داده حساس | §۲۲-P11 |
| ۱۶ | چه Fixهایی Human Approval می‌خواهند؟ | تغییر Policy فعال، Promotion دانش سازمانی، هر نوشتن روی ARM/Instagram، هر تغییر Schema | §۲۲-P11، §۲۳.۹ |
| ۱۷ | سیستم چگونه بدون بازنویسی برای شهرهای دیگر آماده می‌شود؟ | فعلاً: استقرار instance جدا (ممکن، بدون بازنویسی). هدف: tenantId در تمام مدلهای singleton + پیکربندی شهرمحور (locations/مناطق) + Repository abstraction برای مقیاس | §۷.۲، §۲۲-P12 |

---

# پیوست ب — خلاصه اقدامات فوری (پیش از شروع PHASE 1)

این موارد امنیتی/پایداری **منتظر فاز نمی‌مانند** (ریسک فعال امروز):

| اولویت | اقدام | مرجع |
|---|---|---|
| 🔴 ۱ | حذف fallback کد مدیر و کلید رمزنگاری + fail-fast + چرخش کد/کلید + بازرمزنگاری توکن‌ها | SEC-1, SEC-2 |
| 🔴 ۲ | OWNER-gate برای connection/reset، pm/connection، instagram/connection، divar/scan POST، listings/instagram POST | SEC-6 |
| 🔴 ۳ | حذف اشتراک توکن ARM از SyncState singleton | SEC-3 |
| 🟠 ۴ | try/catch برای ۵ روت + رفع باگ RATE_LIMITED (B2) + JSON.parse (B3) | B1-B3 |
| 🟠 ۵ | قفل همزمانی sync (کپی الگوی موجود divar scan) | B6 |
| 🟠 ۶ | خاموشی `log:['query']` در production | D1 |

> اجرای این شش مورد = پیش‌شرط اعتماد برای ادامه PHASE 1. بدون آن‌ها هر ادعای «Production» نقض قانون عدم خودفریبی است.

---

# پیوست پ — بازنگری پنج‌گانه PHASE 0 (دستور شورای راهبری — بستر PHASE 0)

> این پیوست به‌موجب بخش A دستور اجرایی شورای راهبری (اصلاح پنج‌گانه گزارش، فقط مستندات بدون کد) افزوده شد.
> اسکریپت راستی‌آزمایی: `scripts/audit-phase0-revision.sh` — خروجی کامل: `tool-results/audit-revision-output.txt`

## پ.۱ — شمارش دقیق فراخوانی `db.*` در ایجنت‌ها (اصلاح عدد ۴۶ → ۴۷)

شمارش با regex دقیق `\bdb\.[a-zA-Z]+\.[a-zA-Z]+\(` روی `src/core/agent/*.ts` (فقط فراخوانی متد واقعی؛ تعریف و کامنت مستثنا):

| فایل | تعداد | مدل‌های دسترسی‌شده |
|---|---|---|
| `base-agent.ts` | **۲۱** | agentPolicyVersion ×۱۰، agentMemory ×۳، agentFeedback ×۸ |
| `divar-agent.ts` | ۵ | divarAd، divarScanLog، divarRejectLog، marketPriceStat، divarSetting |
| `customer-club-agent.ts` | ۴ | refListCache، transactionRecord، contractRecord، expertRecord |
| `finance-agent.ts` | ۳ | contractRecord، expertRecord، divarAd |
| `listing-agent.ts` | ۳ | listingRecord، instagramPostLog، instagramConnection |
| `expert-agent.ts` | ۲ | expertRecord، interactionRecord |
| `price-index-agent.ts` | ۲ | divarAd، priceIndexHistory |
| `request-agent.ts` | ۲ | requestRecord، requestEventRecord |
| `contract-agent.ts` | ۱ | contractRecord |
| `extraction-agent.ts` | ۱ | lookupLog |
| `supply-demand-agent.ts` | ۱ | supplyDemandRecord |
| `transaction-agent.ts` | ۱ | transactionRecord |
| `visits-agent.ts` | ۱ | visitRecord |
| **جمع** | **۴۷** | ۱۵ مدل |

فهرست کامل file:line (خروجی اسکریپت، عیناً):

```
base-agent.ts:        L87 L91 L128 L137 L142 L143 L157 L164 L169 L210 L228 L243 L274 L280 L290 L291 L361 L362 L363 L364 L365
contract-agent.ts:    L29
customer-club-agent.ts: L33 L60 L65 L75
divar-agent.ts:       L25 L30 L31 L32 L33
expert-agent.ts:      L31 L32
extraction-agent.ts:  L21
finance-agent.ts:     L58 L119 L143
listing-agent.ts:     L25 L26 L124
price-index-agent.ts: L60 L125
request-agent.ts:     L33 L168
supply-demand-agent.ts: L20
transaction-agent.ts: L27
visits-agent.ts:      L27
```

**تفسیر:** ۲۱ فراخوانی از ۴۷ (٪۴۵) در `base-agent.ts` است — یعنی با انتقال این فایل به `AgentMemoryRepository` + `PolicyRepository` در PHASE 2، نیمی از بدهی فنی ایجنت‌ها یک‌جا بسته می‌شود. ۱۸ فراخوانی از ۲۶ باقیمانده از نوع `findMany` خواندنی ساده‌اند (کاندیدای طبیعی Repository_read سبک). عدد اصلاح‌شده گزارش اصلی: **۴۷ (نه ۴۶)**.

## پ.۲ — بازبینی سراسری نقض UI→Prisma (تأیید: ۱ نقض زمان اجرا + ۲ نقض نرم سطح نوع)

بازبینی با grep سراسری سه‌لایه (کامپوننت‌های «use client» → import ارزشی → زنجیره وابستگی تا `@/lib/db`):

| # | نوع | فایل | توضیح | شدت |
|---|---|---|---|---|
| ۱ | **نقض زمان اجرا** | `core/tiles/tiles/request/CustomerManagementPanel.tsx:21` | `import { LIFECYCLE_FA, LIFECYCLE_COLOR } from "@/lib/request/customer-mgmt"` — import **ارزشی**؛ ماژول مقصد در خط ۱۵ خودش `import { db } from "@/lib/db"` و در خط ۱۷ `import type ... from "@prisma/client"` دارد → Prisma به باندل client کشیده می‌شود | 🔴 |
| ۲ | نقض نرم (type-only) | `core/tiles/tiles/request/RequestsPage.tsx:22` | `import type { CustomerManagementSummary }` — در کامپایل حذف می‌شود، وارد باندل نمی‌شود؛ اما وابستگی لایه‌ای UI→Server-module را از نظر معماری برقرار می‌کند | 🟡 |
| ۳ | نقض نرم (type-only) | `lib/listing/types.ts:14` | `import type { ListingRecord } from "@prisma/client"` — این فایل مشترک توسط ۶ کامپوننت client کاشی آگهی import می‌شود؛ type-only است اما «قرارداد نوعی» UI را به اسکیمای Prisma قفل می‌کند | 🟡 |

نتیجه: عدد گزارش اصلی (**۱ نقض زمان اجرا**) تأیید شد؛ دو مورد نرم سطح-نوع نیز برای پاکسازی در P1-03 (استخراج `LIFECYCLE_FA/LIFECYCLE_COLOR/ACTION_FA` به ماژول خالص بدون وابستگی سرور + انتقال `ListingRecord` به DTO مستقل) فهرست شد.

## پ.۳ — جدول صریح Singletonها (محل / scope فعلی / scope هدف / فاز رفع)

| # | Singleton | محل | scope فعلی | scope هدف | فاز رفع |
|---|---|---|---|---|---|
| ۱ | `SyncState` رکورد `id="singleton"` (شامل `armTokenEnc`) | `prisma/schema.prisma:64-76` + `lib/melk-api/sync.ts:87-95` | **Global** (فرا-کاربر) | per-tenant + per-connection (متادیتای sync جدا از توکن) | توکن: **PHASE 0.5 / HOTFIX-02** · متادیتا: PHASE 12 |
| ۲ | `PmConnection` رکورد `id="singleton"` (توکن PM مشترک) | `schema.prisma:630` + `api/pm/connection/route.ts:67-80` | **Global** | per-user (توکن هر کاربر در نشست خودش) | PHASE 2 (Repository) — انتقال ستون‌ها به Session |
| ۳ | `DivarConnection` دو رکورد `method=kenar|phone` (کلید/توکن مشترک) | `schema.prisma:212` + `lib/divar/store.ts:23-27` | **Global** | per-user یا per-tenant + Service Account برای اسکن پس‌زمینه | PHASE 2/12 |
| ۴ | `InstagramConnection` تک‌رکورد `findFirst` (توکن IG مشترک) | `schema.prisma:589` + `lib/instagram/store.ts:25,62` | **Global** | per-tenant (حساب کسب‌وکار واحد آژانس) + AuditLog نویسنده | PHASE 12 |
| ۵ | `DivarSetting` رکورد `id="singleton"` (تنظیمات ایجنت فایل‌یابی) | `schema.prisma:233` + `lib/divar/store.ts:128` | **Global** | per-user (تنظیمات شخصی‌سازی هر مشاور) | PHASE 12 |
| ۶ | `getMelkProvider()` — نمونه ماژول-سطح Provider | `lib/melk-api/provider.ts` | **Global-Process** (کل فرایند) | per-request factory (Stateless) — الگوی فعلی برای client HTTP بی‌حالت قابل قبول است اما باید تزریق‌پذیر شود | PHASE 2 (L7 Adapter) |
| ۷ | `__divarScanRunning` — قفل ماژول-سطح روی globalThis | `lib/divar/scan.ts:520-531` | **Global-Process** | درست برای تک-کاربره؛ در multi-tenant باید قفل per-tenant شود | PHASE 12 |
| ۸ | `db` (PrismaClient روی globalThis) | `lib/db.ts:3-13` | Global-Process | همین بماند (الگوی درست singleton اتصال) — فقط `log:['query']` اصلاح شود | **PHASE 0.5 / HOTFIX-06** |

**نتیجه‌گیری:** ۵ singleton از ۸ (ردیف ۱-۵) راز یا تنظیمات **مشترک بین همه کاربران** نگه می‌دارند — سه تای اول رازِ دسترسی هستند (ریسک امنیتی فعال) و با HOTFIX-02/PHASE 2 بسته می‌شوند؛ ردیف ۶-۸ زیرساختی‌اند و الگوی درستی دارند.

## پ.۴ — جدول metadata گمشده `policy.ts` (۹ فیلد + فاز افزودن)

وضعیت فعلی `AgentPolicyRecord` (`src/core/agent/policy.ts:16-25`): `id, tileId, version, content, rationale, active, createdAt, activatedAt`.

| فیلد لازم (دستور بخش ۲۰) | وضعیت فعلی | چرا لازم است | فاز افزودن |
|---|---|---|---|
| `policyVersion` | ✅ **موجود** — همان `version: number` (شماره صحیح صعودی) | — | — (تغییر نام در PHASE 3 برای هم‌ترازی واژگان، اختیاری) |
| `modelVersion` | ❌ غایب | اگر مدل/الگوریتم تولید بینش عوض شود، وزن‌های نسخه‌های قدیمی قابل مقایسه با جدید نیستند | **PHASE 6** (Feature+Prediction) — با ورود PredictionResult |
| `featureVersion` | ❌ غایب | تغییر تعریف ویژگی‌ها (مثلاً تغییر فرمول امتیاز شخصی‌بودن) باید نسخه بگیرد | **PHASE 6** |
| `trainingWindow` | ❌ غایب | مشخص نکردن «بازخوردهای چه بازه‌ای» در این نسخه لحاظ شده‌اند → همان باگ اثر مرکب (پ.۵) | **PHASE 9** (Policy Lifecycle) — با Learning Window |
| `evaluationWindow` | ❌ غایب | بازه‌ای که عملکرد سیاست روی آن سنجیده شده قبل از فعال‌سازی | **PHASE 9** |
| `metrics` | ❌ غایب | بدون متریک (Precision/Recall/Lift/Conversion) فعال‌سازی سیاست = تصمیم کور | **PHASE 9** (با Golden Dataset + Shadow Evaluation) |
| `createdBy` | ❌ غایب | سیاست توسط کدام ایجنت/کاربر/فرایند ساخته شده (Accountability) | **PHASE 3** (BaseIntelligentAgent) — فیلد رشته‌ای ساده |
| `approvedBy` | ❌ غایب | فعال‌سازی سیاست حساس نیازمند تأیید انسانی | **PHASE 8/9** (Decision Engine + Governance) |
| `status` | ❌ غایب (فقط بولین `active`) | چرخه عمر واقعی: `candidate → shadow → active → retired` | **PHASE 9** — بولین active به enum تبدیل شود |
| `rollbackTarget` | ❌ غایب (ضمنی از طریق تاریخچه نسخه‌ها) | بازگشت اضطراری باید هدف صریح و تأییدشده داشته باشد | **PHASE 9** (در PHASE 3 به‌صورت فیلد اختیاری) |

**قید سازگاری:** تا PHASE 9، `active: boolean` و تاریخچه نسخه‌ها حفظ می‌شود (سازگاری عقب‌وار با `BaseLearningAgent` و روت‌های `/api/agent/[tileId]/policy`). افزودن فیلدهای جدید به‌صورت **ستون اختیاری nullable** — بدون Migration مخرب.

## پ.۵ — Learning Map با مثال عددی: چرا بازمحاسبه کل تاریخچه «اثر مرکب» می‌سازد

کد مرجع: `base-agent.ts:242-300` (`reviewPolicyIfNeeded`). قاعده فعلی: `وزن جدید = وزن فعلی + ۰٫۱۵ × (مجموع تمام بازخوردهای تاریخچه از ابتدا)` — بدون پنجره زمانی، بدون علامت‌گذاری «مصرف‌شده».

**سناریو: ۷ بازخورد در ۳ دسته (X، Y، Z) به این ترتیب:** f1=X⁺، f2=X⁺، f3=Y⁻، f4=X⁺، f5=Y⁻، f6=Z⁺، f7=X⁺

| رویداد | تعداد کل بازخورد | بازبینی سیاست اجرا می‌شود؟ | score_X (از **کل** تاریخچه) | score_Y | وزن X | وزن Y | نسخه سیاست |
|---|---|---|---|---|---|---|---|
| f1..f4 | ۴ | خیر (<۵) | — | — | ۱٫۰۰ | ۱٫۰۰ | v1 |
| f5 | ۵ | **بله ①** | **+۳** (f1,f2,f4) | −۲ (f3,f5) | ۱٫۰۰+۰٫۱۵×۳ = **۱٫۴۵** | ۱٫۰۰+۰٫۱۵×(−۲) = **۰٫۷۰** | v2 |
| f6 | ۶ | **بله ②** | **+۳** (همان f1,f2,f4 — هیچ داده جدیدی برای X نیامده!) | −۲ (همان قبلی) | ۱٫۴۵+۰٫۴۵ = ۱٫۹۰ → **clamp ۱٫۸۰** | ۰٫۷۰−۰٫۳۰ = **۰٫۴۰** | v3 |
| f7 | ۷ | **بله ③** | +۴ | −۲ (برای سومین بار) | ۱٫۸۰+۰٫۶۰ → **clamp ۱٫۸۰** (اشباع) | ۰٫۴۰−۰٫۳۰ = ۰٫۱۰ → **clamp ۰٫۳۰** | v4 |

**سه اثر مرکب اثبات‌شده با اعداد:**

1. **شمارش چندباره شواهد قدیمی:** سه بازخورد مثبت f1/f2/f4 دسته X در بازبینی‌های ①②③ سه بار اعمال شدند (وزن X: ۱٫۰۰→۱٫۴۵→۱٫۸۰ با تنها ۳ داده). تنها بازخورد جدید f6 (که اصلاً مربوط به X نبود) وزن X را ۰٫۳۵ واحد دیگر بالا برد. با ۱۰۰ بازخورد آینده، همان ۳ داده قدیمی **صد بار دیگر** اعمال می‌شوند.
2. **اشباع روی ریل clamp:** طبقه‌بندی وزن فعلاً فقط بازه ۰٫۳ تا ۱٫۸ دارد؛ پس هر دسته‌ای که یک‌بار از آستانه |score|≥۲ عبور کند، در هر بازبینی بعدی دوباره حرکت می‌کند تا به ریل بچسبد. پس از چند بازبینی، سیاست «دوقطبی» می‌شود (همه چیز ۰٫۳ یا ۱٫۸) و **granularity انتخاب بینش از بین می‌رود**.
3. **تورم نسخه:** چون آستانه معناداری (|score|≥۲) روی مجموع تجمعی سنجیده می‌شود نه روی شواهد جدید، پس از عبور یک‌باره، «هر بازخورد آینده» یک نسخه جدید می‌سازد: با ۱۰۰ بازخورد ≈ ۹۵ نسخه سیاست — رشد خطی جدول `AgentPolicyVersion` و بی‌معنایی rationale ها («به‌روزرسانی از N بازخورد» با N یکسان).

**راه‌حل هدف (PHASE 9 — Policy Lifecycle):** هر بازخورد فقط یک‌بار مصرف شود (پنجره یادگیری + علامت appliedPolicyVersion)، وزن از «شواهد جدید در پنجره» محاسبه شود نه دلتای روی وزن قبلی، و فعال‌سازی نسخه جدید منوط به ارزیابی Shadow روی متریک واقعی (Conversion/Outcome) باشد. تا آن زمان، این جدول سند رسمی این است که چرا وضع فعلی «یادگیری» نامیده نمی‌شود.

---

> **بستن PHASE 0:** با درج این پیوست، هر پنج اصلاح بخش A (شمارش دقیق ۴۷ فراخوانی، بازبینی سراسری UI→Prisma، جدول ۸ Singleton، جدول فیلدهای metadata سیاست، و مثال عددی اثر مرکب یادگیری) اعمال شد. PHASE 0 رسماً بسته می‌شود و مسیر برای PHASE 0.5 (شش Hotfix) باز است.

---

## جمع‌بندی نهایی

کدبیس ملک تبریز **شالوده‌ای سالم و قابل‌دفاع** دارد: معماری پلاگین کاشی تمیز، جداسازی UI/Server قوی، زیرساخت یادگیری append-only، ۲۸۹ تست سبز، و موتورهای دامنه‌ای واقعی (امتیاز ۱۰۰ نقطه‌ای، تطبیق، NBA). آنچه کم است — و این گزارش نقشه دقیق آن را کشیده — سه چیز است: **(۱) مرزهای لایه‌ای و Repository** (PHASE 1-2)، **(۲) هسته هوش مشترک با Memory/RAG/Prediction/Outcome واقعی** (PHASE 3-7)، و **(۳) Governance/ارزیابی/ خودتشخیص** (PHASE 9-11). مسیر ارتقا «حفظ → بازآفرینی → استحکام → ارتقای هوش» است و هر گامش با GATE و مدرک بسته می‌شود.

**هدف نهایی، همان‌گونه که مالک فرمود:**
> A modular, explainable, measurable, continuously improving, outcome-driven Multi-Agent Real Estate Intelligence Platform.






