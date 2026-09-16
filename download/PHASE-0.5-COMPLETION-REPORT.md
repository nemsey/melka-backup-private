# PHASE 0.5 — COMPLETION REPORT
## شش Hotfix امنیتی/پایداری — گزارش تکمیل برای شورای راهبری

**از:** GLM-5.3 (Senior Architect + Refactoring Engineer + Security Engineer)
**تاریخ:** ۲۰۲۶-۰۹-۱۶ (مطابق گزارش گیت: ۲۰۲۶-۰۹-۱۵)
**اصل حاکم:** Preserve → Hotfix → Refactor → Harden → Upgrade Intelligence
**ممنوعیت رعایت‌شده:** Rewrite-from-scratch ✗ · حذف BaseLearningAgent ✗ · Feature جدید ✗ · Migration Schema غیرضروری ✗

---

## ۱. جدول شش Hotfix — وضعیت / شاهد / تست / Rollback

| # | Hotfix | وضعیت | شاهد (فایل + خط + رفتار) | تست | Rollback |
|---|---|---|---|---|---|
| **HOTFIX-01** | حذف رازهای fallback (SEC-1, SEC-2) | ✅ بسته | `config.ts:62-75` assertProductionSecrets (prod بدون راز = throw) · `crypto.ts:46-57` کلید اجباری بدون زنجیره کد مدیر · `divar/config.ts:131-133` · `master-login/route.ts:33-44` گارد 503 · `instrumentation.ts:17-19` fail-fast بوت · اسکریپت چرخش `scripts/rotate-encryption-key.ts` + `lib/auth/key-rotation.ts` (idempotent + AuditLog) | ۱۳ تست — `hotfix01-secrets.test.ts` | `git revert 26850d4` |
| **HOTFIX-02** | توکن ARM فقط per-user (SEC-3) | ✅ بسته | ستون `SyncState.armTokenEnc` از اسکیما و DB حذف شد (رکورد فقط ۸ فیلد متادیتا) · `api/sync/route.ts` فقط توکن نشست خود کاربر (بدون آن = 412) · تایمر پس‌زمینه پیش‌فرض خاموش (`MELK_BACKGROUND_SYNC=enabled` صریح + نشست زنده + AuditLog) · `connection/reset` بدون خواندن توکن دیگران | ۹ تست — `hotfix02-arm-token.test.ts` | `git revert f7678c3 1eb22e3` (ستون قابل بازگردانی از بکاپ) |
| **HOTFIX-03** | OWNER-gate پنج روت حساس (SEC-6) | ✅ بسته | `guard.ts:31-63` تابع `requireRole("OWNER", route)` · اعمال یکنواخت روی: connection/reset، pm/connection، instagram/connection، divar/scan، listings/[id]/instagram + یکسان‌سازی divar/connection · هر رد = AuditLog با `personnelCode + route` | ۱۳ تست — `hotfix03-owner-gate.test.ts` | `git revert a7c812c 347e950` |
| **HOTFIX-04** | باگ‌های بحرانی B1, B2, B3, B7 | ✅ بسته | **B1:** try/catch فارسی در auth/session (GET/PATCH/DELETE)، divar/scan POST، ads reject POST · **B2:** تلاش RATE_LIMITED ردشده دیگر recordAttempt نمی‌زند (پنجره لغزان ثابت) · **B3:** JSON خراب رکورد → 422 UNPROCESSABLE (route + `listing/store.ts` safeParseOr) · **B7:** meta/form خطا → 502، divar start-phone → 502، save-kenar نامعتبر → 400 | ۱۱ تست — `hotfix04-critical-bugs.test.ts` | `git revert 53809bf 64ce36e` |
| **HOTFIX-05** | قفل همزمانی sync (B6) | ✅ بسته | `sync.ts:89-117` الگوی in-flight join (فراخوان موازی = پیوستن به اجرای جاری، نه restart) + شمارنده اجرا · `clearCrmCacheTables()` تابع واحد ۶جدولی — هم connection/reset (قبلاً ۳ جدول) هم resetCrmCache | ۶ تست — `hotfix05-sync-lock.test.ts` | `git revert 938d168` |
| **HOTFIX-06** | خاموشی لاگ تولید (D1, D2) | ✅ بسته | `db.ts` → `resolvePrismaLogConfig()`: prod `['error']` / dev `['warn','error']` — `'query'` حذف کامل · instrumentation از singleton `@/lib/db` (حذف `new PrismaClient()` در هر tick — از HOTFIX-02) | ۸ تست — `hotfix06-prod-logs.test.ts` | `git revert 67ff995` |

**قاعده Rollback:** هر Hotfix کامیت مستقل دارد؛ بازگشت هر یک بقیه را نمی‌شکند (تست‌ها پس از هر کامیت جداگانه سبز شدند: 302→311→324→335→341→349).

---

## ۲. diff خلاصه

```
42 files changed, 2,125 insertions(+), 220 deletions(-)
```

| دسته | فایل‌ها | تغییر |
|---|---|---|
| هسته امنیتی | key-rotation.ts (جدید ۲۱۲ خط)، crypto.ts، guard.ts (+۳۴)، config.ts×۲، db.ts | +۳۱۵ |
| روت‌های API | sync، connection/reset، pm/connection، instagram/connection، divar/scan، divar/connection، listings/[id]×2، ads reject، meta/form، auth/session، master-login | ~۳۴۰ خط اصلاح |
| زیرساخت | instrumentation.ts (بازنویسی ۹۳ خط)، sync.ts (+۴۶)، listing/store.ts، melk-api/types.ts | +۱۶۰ |
| اسکریپت‌ها | rotate-encryption-key.ts، dev-secrets.ts، rotation-evidence.ts، audit-phase0-revision.sh | +۲۴۰ |
| تست | ۶ فایل جدید hotfix01..06 (۱٬۲۵۶ خط) + پاکسازی ۳ فایل قدیمی | +۱٬۲۶۴ |
| مستندات | .env.example (جدید)، README، پیوست پ گزارش ممیزی | +۱۴۰ |

---

## ۳. خروجی grep — هیچ راز fallback باقی نمانده

```
$ grep -r "41372895" src/ tests/ scripts/ prisma/
→ ۱ نتیجه: tests/hotfix01-secrets.test.ts:141  (خودِ تستِ نگهبان — الگوی تشخیص، نه راز)

$ grep -r "melk-tabriz-fallback-key" src/
→ صفر نتیجه

$ grep -r "melk-tabriz-fallback-key" tests/ scripts/
→ ۳ نتیجه، همگی مجاز:
   • tests/hotfix01-secrets.test.ts:139  (تست نگهبان — اسکن‌گر)
   • scripts/rotation-evidence.ts:29,46  (اسکریپت مهاجرت — برای decrypt داده legacy
     به «مقدار» کلید قدیمی نیاز دارد؛ این کلید از این پس فقط اینجا، به‌عنوان
     تاریخچه مهاجرت زنده است و در هیچ مسیر production استفاده نمی‌شود)
```

**سورس production (`src/`) = صددرصد پاک.**

---

## ۴. خروجی تست

```
$ DATABASE_URL=file:...test.db MELK_TOKEN_KEY=... bun test tests/
  349 pass
    0 fail
  1,283 expect() calls
  Ran 349 tests across 18 files
```

| سنجه | مقدار |
|---|---|
| تست قبل از PHASE 0.5 | ۲۸۹ |
| تست جدید (۶ Hotfix) | +۶۰ (۱۳+۹+۱۳+۱۱+۶+۸) |
| **جمع** | **۳۴۹ — همه سبز** |
| TypeScript خطای src | ۰ |
| ESLint | پاک |
| ادعاها (assertions) | ۱٬۲۸۳ |

نمونه سنجه‌های کلیدی ثبت‌شده در تست‌ها:
- قفل RATE_LIMITED: ۵ شکست verify → قفل؛ تلاش ۶ و ۷ → 429 **بدون** رکورد جدید (قبل از رفع: ۷ رکورد — خود-تمدید)
- همزمانی: دو ensureSeeded موازی → **دلتای اجرای sync = ۱**، دو پاسخ موفق
- چرخش کلید: تزریق توکن با کلید قدیمی → rotated=1 → decrypt با کلید جدید = مقدار اصلی؛ اجرای دوم → already (idempotent)
- OWNER-gate: CONSULTANT → 403 روی هر ۵ روت + ثبت ACCESS_DENIED در AuditLog؛ OWNER → عبور
- لاگ production: پیکربندی `['error']`؛ اجرای کوئری → صفر خط prisma:query روی stdout (و اثبات معیار: پیکربندی قدیمی همان کوئری را چاپ می‌کرد)

---

## ۵. چک‌لیست GATEهای بسته‌شده

| GATE | وضعیت | مدرک |
|---|---|---|
| GATE-SEC-1 | 🔒 بسته | HOTFIX-01 — fallback کد مدیر حذف + fail-fast + پاکسازی تست‌ها |
| GATE-SEC-2 | 🔒 بسته | HOTFIX-01 — کلید رمزنگاری اجباری مستقل + چرخش idempotent |
| GATE-SEC-3 | 🔒 بسته | HOTFIX-02 — توکن ARM فقط per-user در Session؛ SyncState بدون راز |
| GATE-SEC-6 | 🔒 بسته | HOTFIX-03 — requireRole(OWNER) ×۵ روت + AuditLog رد |
| GATE-BUGS-CRITICAL | 🔒 بسته | HOTFIX-04 — B1/B2/B3/B7 با تست بازتولید |
| GATE-SYNC-LOCK | 🔒 بسته | HOTFIX-05 — قفل in-flight + یکسان‌سازی reset ۶جدولی |
| GATE-LOGS | 🔒 بسته | HOTFIX-06 — لاگ شرطی + singleton در تایمر |

**وضعیت GATE-A/B/C (از PHASE 0):** مستند و آماده امضای نهایی شورا (گزارش ممیزی + پیوست پ).

---

## ۶. بکاپ DB و شاهد چرخش کلید رمزنگاری

- **بکاپ:** `db/custom.backup-pre-phase05.db` (۱٫۳ MB — تهیه‌شده قبل از اولین Hotfix)
- **شاهد چرخش (روی کپی دیتابیس واقعی `custom.rotation-test.db`):**
  - وضعیت داده‌های رمزنگاری‌شده در DB واقعی: Session=0، SyncState=0، PmConnection=0، DivarConnection=0، InstagramConnection=0 → **هیچ داده‌ای با کلید قدیمی ساکن نیست** (ریسک صفر)
  - تزریق توکن نمونه رمزشده با کلید قدیمی fallback → اجرای چرخش → `rotated=1, already=0, unreadable=0` → رمزگشایی با کلید جدید = مقدار اصلی ✅
  - رد حسابرسی `KEY_ROTATION` با اثر انگشت کلید (SHA-256 دوازده نویسه اول، بدون افشای کلید) ثبت شد
- **مسیر عملیاتی برای استقرار production (هنگام راه‌اندازی سرور واقعی):**
  1. `MASTER_ACCESS_CODE` و `MELK_TOKEN_KEY` واقعی در متغیرهای محیطی سرور
  2. اگر داده legacy با کلید قدیمی وجود دارد: `ROTATION_PENDING=true` + `MELK_TOKEN_KEY_OLD=<قدیم>` → بوت خودکار می‌چرخاند → سپس حذف متغیرها
  3. بدون رازها سرور اصلاً بالا نمی‌آید (fail-fast عمدی)
- **محیط dev این نصب:** `.env.local` (gitignored) با کلید تولیدی `dev-secrets.ts` ساخته شد

---

## ۷. آیا آماده شروع PHASE 1 هستیم؟

# ✅ بله

**دلایل (هر یک با مدرک):**

1. **هر ۶ Hotfix بسته، هر یک با کامیت مستقل، تست اختصاصی و دستور rollback مستند** — شرط بخش B برآورده شد.
2. **سطح تست از ۲۸۹ به ۳۴۹ رسید (٪۲۱+) و صفر fail** — رگرسیونی مشاهده نشد؛ تازه ۶۰ تست جدید دقیقاً روی نقاط آسیب‌پذیر شناسایی‌شده در ممیزی نشسته‌اند.
3. **سه سوراخ امنیتی فعال F4 (SEC-1/2/3) دیگر وجود ندارد** — کد مدیر و کلید رمزنگاری از سورس پاک شدند، توکن ARM بین کاربران مشترک نیست، روت‌های مدیریتی OWNER-gate دارند.
4. **هیچ Feature جدید / UI / تغییر رفتار کسب‌وکار** — مطابق قانون فاز؛ خروجی کاربر فقط در پیام‌های خطای شفاف‌تر فارسی و کدهای وضعیت صحیح است (رفع باگ، نه تغییر محصول).
5. **یک تغییر اسکیما:** فقط حذف ستون `SyncState.armTokenEnc` — منصوص همان HOTFIX-02، با تأیید «هیچ داده‌ای با آن ساکن نبود» و بکاپ کامل DB.

**دو یادآوری صادقانه برای شورا (نه مانع، فقط شفافیت):**
- ورود مدیر در dev تا زمانی که `MASTER_ACCESS_CODE` در `.env.local` تنظیم نشود غیرفعال است (مسیر OTP کار می‌کند) — این عمدی است؛ کد واقعی فقط باید در محیط امن توسط مالک تنظیم شود.
- تایمر همگام‌سازی پس‌زمینه تا PHASE 2 (حساب سرویس) پیش‌فرض خاموش است؛ همگام‌سازی دستی/درخواستی با توکن خود کاربر فعال است.

**پیشنهاد شروع PHASE 1:** P1-01 (استخراج اشتراک‌های UI) → P1-02 (منطق دامنه از UI به سرور) → P1-03 (ماژول‌های خالص + رفع نقض UI→Prisma) → P1-04 (خاموشی تدریجی ignoreBuildErrors) → P1-05 (حذف کدهای مرده) → P1-06 (تست‌های رگرسیون) — طبق دستور بخش D، بدون Feature و بدون Migration.

---

*قانون عدم خودفریبی رعایت شد: هیچ ادعای Learning/RAG/Prediction/Production-Ready مطرح نشده است. این گزارش صرفاً «Hotfix complete» برای شش مورد بخش ۰٫۵ است.*
