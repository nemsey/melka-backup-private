
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
{{FILE:src/lib/melk-api/endpoints.ts}}
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
{{FILE:src/lib/melk-api/catalog-daemon.ts}}
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
{{FILE:src/lib/auth/crypto.ts}}
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
