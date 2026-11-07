# PN-044 — گزارش نهایی (شورا-ن۰۸۸ · ۱۴۰۵/۰۷/۲۹)

**اجرا:** GLM-5.3 · **وضعیت:** ✅ هر ۶ فاز کامل · **BUILD:** `5ed9ccb-20261020-0500` = HEAD · **دو-سبز:** ۲۹۱۵/۰ ×۲ پایدار · **گاردها:** ۱۲/۱۲ سبز

---

## پاسخ پنج‌گانهٔ مالک (بخش ۵.۶ دستور)

### ۱. کشف API ملکتون: REST دارد؟ HTML؟ session؟

**Session-based · Laravel + Inertia (Vue) · MELKETUN_CRM — بدون REST عمومی**

| کشف | مقدار |
|---|---|
| فریم‌ورک | Laravel + Inertia — ۱۶۰ مسیر از نقشهٔ Ziggy افشا شد |
| REST عمومی | ❌ هیچ — همهٔ `/api/*` → 404 (فقط `api/mobile-app/version`) |
| Login واقعی | `POST /login-store` — فیلدهای دقیق **`Username`/`Password`** (حرف بزرگ — کشف از خطای 422) + هدر `X-XSRF-TOKEN` |
| احراز هویت | Session (کوکی‌های XSRF-TOKEN + session) — `GET /dashboard → 200` = موفق |
| دسترسی داده | صفحات احراز‌شده → **JSON تمیز درون `data-page`** (بدون نیاز به cheerio/DOM scraping) |
| مجوز Sarmasti | غیر-admin — `admin/*` و `leads` → 403 · صفحات داده ۲۰۰ |

**Verdict فاز ۰: `SESSION_HTML_ADAPTER`** — بهتر از هر دو سناریوی شورا (REST و HTML): JSON ساختاریافتهٔ اینرسیا، بدون parsing شکنندهٔ HTML. `PATH: PROCEED` طبق قانون ۰.

### ۲. Migration: آیا tenantId اضافه شد؟

**بله — اما کشف مهم: ستون از قبل وجود داشت (P6.5-02 §۱۴ مصوبهٔ قبلی خود شورا).**

- هر ۴ جدول (PropertyRecord/RequestRecord/TransactionRecord/ExpertRecord) از قبل `tenantId @default("melk-tabriz")` داشتند — همهٔ ۵۴,۵۴۲ رکورد فعلی = `melk-tabriz`
- طبق قانون «صفر تغییر ستون موجود + صفر مداخله در دادهٔ تبریز»: **rename به 'tabriz' انجام نشد** — نگاشت کلید UI→DB در `src/lib/tenants.ts` (منبع یگانه)
- آنچه PN-044 افزود (همگی افزودنی): ایندکس tenantId روی ۳ جدول فاقد آن + ستون tenantId روی **ExpertProfile** (کشف: منبع دادهٔ واقعی کاشی M4 همین جدول است نه ExpertRecord — الگوی §۱۴: nullable + default)
- تأیید migration-verify: شمارش‌ها عیناً برابر (۲۷,۸۶۸ · ۲۵,۵۸۰ · ۷۹۸ · ۲۹۶) — صفر حذف، صفر تغییر داده

### ۳. Login: موفق شد یا نه؟

**✅ موفق** — `POST /login-store → 302` → `GET /dashboard → 200 (AUTHENTICATED)`
- سه تلاش لازم شد: تلاش ۱ به مسیر اشتباه (`/login` = GET-only → 405)؛ تلاش ۲ فیلدهای lowercase (→ 422)؛ تلاش ۳ با نام‌های دقیق **Username/Password** → موفق
- session در Persistent Zone ذخیره شد (`upload/.runtime/melketun-session.cookies` · gitignored ✓)
- گارد تازهٔ `audit-melketun-session.sh` سبز
- آداپتر PN-043 هم از «reachability only» به **login واقعی** ارتقا یافت (یادداشت «pending recon» منسوخ شد)

### ۴. Sync: داده‌های ملکتون کشیده شد؟ چند رکورد؟

**✅ ۴۹ آگهی (filings) + ۱۹ درخواست (potentials) — tenantId='melketun'**

| ماژول | نگاشت | fetched | upserted | یادداشت |
|---|---|---|---|---|
| Filings (آگهی) | → PropertyRecord | ۴۹ | ۴۹ | paginated ۱۰/صفحه · ۱۰.۷ ثانیه |
| Potentials (درخواست) | → RequestRecord | ۱۹ | ۱۹ | id ها vtiger-style (`71x…`/`13x…`) — صفر تصادم با ARM |
| Transactions (معاملات) | stub | ۰ | ۰ | **ماژول معادلی در CRM قابل‌دسترس نیست** — گزارش صادقانه (قانون ۱۴) |
| Experts (کارشناسان) | stub | ۰ | ۰ | **specialists/valuations برای این حساب خالی است** — گزارش صادقانه |

- Worker خودکار: `melketun-sync` در رجیستری — چرخهٔ ۶ ساعت (الگوی ARM) · اولین اجرا ۱۰ دقیقه پس از بوت
- API دستی OWNER: `POST /api/integrations/melketun/sync` + آینهٔ v1 (۴۰۱ بدون احراز = مرز سالم)
- رمز هرگز در لاگ/کد/گیت چاپ نشد (قانون ۱۸) — HTML های شاهد پاک‌سازی شدند

### ۵. داشبوردها: هر دو کار می‌کنند و دادهٔ متفاوت نشان می‌دهند؟

**✅ بله — جداسازی کامل و متقابل:**

```
PropertyRecord:    tabriz=27868  melketun=49   ← دو دنیای جدا
RequestRecord:     tabriz=25580  melketun=19
TransactionRecord: tabriz=798    melketun=0    ← stub صادقانه
ExpertRecord:      tabriz=296   melketun=0    ← stub صادقانه
```

- `dashboard/tabriz → 200` · `dashboard/melketun → 200` · `settings/melketun → 200`
- زنجیرهٔ کامل tenantId: TenantDashboard → کاشی‌های M1-M4 → ۴ روت API + ۲ روت export → ۵ where در repo/ذخیره‌گاه
- **پیش‌فرض ایمن:** هر query بدون tenantId = فقط تبریز → دادهٔ ملکتون هرگز به کاشی‌های تبریز نشت نمی‌کند (و برعکس)
- رکوردهای ملکتون با `source: 'melketun-crm'` و status متفاوت — موتور تطبیق تبریز (فیلتر `status='منتشر شده'` / `source='arm'`) به‌طور ذاتی آن‌ها را نادیده می‌گیرد

---

## رخدادها و تصمیم‌های شفاف

| # | رخداد | تصمیم |
|---|---|---|
| ۱ | ستون tenantId از قبل بود (P6.5-02) | استفاده از مقدار موجود `melk-tabriz` — rename ممنوع (قانون ۱۱) |
| ۲ | M4 از ExpertProfile می‌خواند (بیرون از ۴ مدل دستور) | افزودن additive ستون — وگرنه فیلتر M4 ناممکن بود |
| ۳ | reset-guard یک‌بار تغییرات کامیت‌نشدهٔ فاز ۵ را بازگرداند | درس PN-043 اعمال شد: بازسازی + **کامیت فوری قبل از تست** (قانون ۸) |
| ۴ | ۱۰ تصمیم منقضی از Worker سایه (گارد قرمز) | `expireSweep` قانونی — فقط تغییر وضعیت، صفر حذف (گارد سبز شد) |
| ۵ | P2022 در تست‌ها | `db/test.db` با `test:db:push` همگام شد (ستون جدید) |
| ۶ | نوسان یک‌بارهٔ تست relay در اجرای ۲ | در انزوا ۳۳/۰ سبز + دو اجرای کامل متوالی ۲۹۱۵/۰ = پایدار (معیار PN-043) |

## تحویل‌ها (download/pn044/)

| فایل | محتوا |
|---|---|
| recon.log | کشف کامل ۶ تست + verdict + کشف login-store |
| after-login-page.html / dashboard-authenticated.html | شواهد احراز (پاک‌سازی‌شده) |
| schema-before.log / migration-verify.log / prisma-push.log | مهاجرت افزودنی |
| login-test.log / guard-session.log | فاز ۲ |
| sync-test.log / tenant-isolation.log | فاز ۳-۴ (۴۹+۱۹ · شمارش دو-tenant) |
| guards.log / guard-tenant.log | ۱۲/۱۲ گارد |
| test-run-1/2.log (+3/4) | دو-سبز پایدار ۲۹۱۵/۰ ×۲ |
| build.log / build-id.log / final-verify.log | بیلد = HEAD · Health=True |
| SHA256SUMS.txt | تمام شواهد |

## کامیت‌ها (پوش خطی — BP فعال)

`612430a` (فاز۱: ایندکس‌ها) → `66904f7` (فاز۲: گارد session) → `46ea911` (فاز۳: sync worker) → `a368cff` (فاز۴: کاشی‌ها) → `5ed9ccb` (فاز۵: ExpertProfile + تست‌ها + مانیفست ۱۱۳) → [+ کامیت گزارش]

## ریسک‌های باقی‌مانده (گزارش صادقانه به مالک)

۱. **معاملات/کارشناسان ملکتون خالی است** — نه باگ، واقعیت: CRM ملکتون ماژول معادلِ قابل‌دسترسی برای حساب Sarmasti ندارد (پیشنهاد: دسترسی admin یا تعریف ماژول در CRM ملکتون)
۲. **token های ARM در session ملکتون معنی ندارد** — غنی‌سازی ARM فقط برای tenant تبریز فعال ماند (عمدی)
۳. **سقف صفحات sync = ۱۰۰ صفحه/۱۰۰۰ رکورد** — دادهٔ فعلی ۶۸ رکورد است؛ اگر ملکتون رشد کرد، سقف باید بالا برود
۴. **جاروی expireSweep** گاهی لازم می‌شود اگر Worker سایه دوباره کاشت (پدیدهٔ شناخته‌شدهٔ قبلی)
