# گزارش پایانی PN-031-HOTFIX — رفع باگ نشانی bootstrap در محیط عمومی

**سند رسمی · ملکا-شورا-ن۰۳۸-اجرا · تاریخ ۱۴۰۵/۰۷/۲۲ · ۲۰۲۶-۱۰-۱۲**
**دستور:** صورت‌جلسهٔ فوری جلسهٔ ۰۳۸ شورای عالی ملکا (سند ملکا-شورا-ن۰۳۸-۱۴۰۵)
**وضعیت:** ✅ کامل — همهٔ بندهای دستور اجرا شد · تست زنده از URL عمومی سبز

---

## ۱) خلاصهٔ اجرایی

باگ جلسهٔ ۰۳۸ ظرف یک اجرا رفع و روی سرور زنده مستقر شد. ریشه: دو روت (`enroll` و `bootstrap`) نشانی سرور را از `request.nextUrl.origin` می‌ساختند که در محیط کانتینر به `http://0.0.0.0:3000` (آدرس بایند داخلی) تفسیر می‌شود — آدرسی که از گوشی مالک در اینترنت بی‌معناست. اصلاح: ماژول یگانهٔ `getPublicBaseUrl` با اولویت چهارگانهٔ مصوب شورا (env → x-forwarded-host → host عمومی → fail-closed) + ثبت `MELK_PUBLIC_BASE_URL` در env.platform.json و زنجیرهٔ escrow سه‌لایه برای بقا در بازنشانی‌های محیط. **تست زندهٔ کامل مسیر واقعی مالک از URL عمومی** (ورود مدیر → ثبت دستگاه → دانلود اسکریپت — عین curl گوشی) همه سبز؛ دستور نصب تازه با نشانی عمومی صادر و دستگاه کهنه ابطال شد. دروازه: دو-سبز **۲۶۳۰/۰ ×۲** (رکورد) · tsc صفر · lint صفر خطا · گارد ۴۲/۴۲ · BUILD_ID = HEAD.

## ۲) تشخیص (فاز ۱)

| قلم | جزئیات |
|------|---------|
| علامت (تصویر مالک) | `curl: (7) Failed to connect to 0.0.0.0:3000 after 1 ms` — نصب Termux کامل موفق (curl 8.21.0 · openssl 1.3.6.3 · jq 1.8.2)؛ تنها دریافت فایل رله خطا داد |
| ریشهٔ فنی | `request.nextUrl.origin` در هر دو روت — پراکسی پلتفرم Host را به بایند داخلی کانتینر بازنویسی می‌کند |
| نقاط آسیب | `src/app/api/admin/relay/enroll/route.ts:30` (متن QR/دستور نصب) + `src/app/api/mobile-relay/bootstrap/route.ts:28` (SERVER_URL درون اسکریپت رله → حلقهٔ poll گوشی) |
| نشانی عمومی واقعی | `https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai` — کشف از runtime-status.json + تأیید زنده (health 200 در 0.10s از کانتینر) |
| دارایی حیاتی | کد قدیمی `cff39acd…` هرگز مصرف نشد (اتصال گوشی در لایهٔ TCP شکست — هرگز به سرور نرسید) اما منقضی طبیعی شد (۰۹:۲۸Z) → ابطال رسمی در فاز ۳ |
| شاهد | `download/pn031-hotfix/diagnosis.json` |

## ۳) اصلاح (فاز ۲) — اولویت چهارگانهٔ مصوب

ماژول تازهٔ `src/lib/http/public-url.ts` — `getPublicBaseUrl(req)`:

1. **`process.env.MELK_PUBLIC_BASE_URL`** — قطعی‌ترین منبع؛ ثبت‌شده در env.platform.json (gitignored) + نمونهٔ مستند در env.platform.json.example
2. **`x-forwarded-host` + `x-forwarded-proto`** — استاندارد reverse-proxy
3. **`req.headers.host`** — فقط اگر میزبان عمومی باشد (رد کامل: `0.0.0.0` · `localhost` · `127.x` · `::1`)
4. **fail-closed** — خطای صریح فارسی برای مالک («نه URL خراب») با HTTP 503

**دو تصمیم ترتیبی مهم (فراتر از دستور — درس درس ۴):**
- در روت bootstrap: تعیین نشانی **پیش از** مصرف کد یک‌بارمصرف — اگر خطا رخ دهد، کد مالک سالم می‌ماند و همان کد قابل تلاش مجدد است
- در روت enroll: تعیین نشانی **پیش از** ساخت دستگاه — fail-closed دستگاه یتیم نمی‌سازد

**بقا (درس ۵):** `MELK_PUBLIC_BASE_URL` جزو `BOOT_SECRET_KEYS` شد — از زنجیرهٔ escrow سه‌لایه (db/.runtime → upload/.runtime → env.escrow.enc رمزنگاری‌شده) زنده می‌ماند و env.platform.json در هر بازنشانی محیط بازسازی می‌شود. جزو fail-fast بوت نیست (تولید تصادفی هم ممنوع — URL واقعیت دارد، ساخت نمی‌شود).

## ۴) تولید مجدد (فاز ۳)

- **ابطال:** کد قدیمی `cff39acd…` رسماً باطل + دو دستگاه یتیم همان دوران (`poco-f3-420b75` · `poco-f3-232079`) ابطال — هیچ رازی هرگز آن‌ها را ترک نکرده بود
- **صدور تازه:** دستگاه `poco-f3-1c663e` (برچسب Poco F3) از **خودِ روت واقعی و از URL عمومی** — عین دکمهٔ «راه‌اندازی رله» در تنظیمات؛ کد یک‌بارمصرف ۳۰دقیقه‌ای
- **QR:** PNG (۶۴۰px) + SVG — همان پیکربندی روت QR برنامه — در `download/pn031-hotfix/qr-install-command.{png,svg}`
- **شاهد:** `download/pn031-hotfix/regenerated.json`
- نکته: دکمهٔ راه‌اندازی در تنظیمات هم اکنون URL عمومی می‌سازد — اگر کد منقضی شد، مالک همان‌جا دکمه را دوباره می‌زند

## ۵) تست زنده (فاز ۴) — مسیر کامل واقعی مالک از اینترنت

اسکریپت ماندگار: `scripts/pn031-hotfix/live-test.sh` — همهٔ درخواست‌ها فقط از URL عمومی:

| گام | انتظار | نتیجه |
|-----|--------|-------|
| ۱) bootstrap با کد ساختگی | 403 | ✅ 403 |
| ۲) ورود مدیر (کد مستر از env) | 200 | ✅ 200 |
| ۳) ثبت دستگاه (عین دکمهٔ مالک) | 200 + فقط URL عمومی در دستور | ✅ 200 · صفر 0.0.0.0/localhost |
| ۴) دانلود اسکریپت (عین curl گوشی) | 200 + SERVER_URL عمومی + bash -n معتبر | ✅ همه سبز + wake-lock موجود |
| ۵) تلاش دوم با همان کد | 403 (یک‌بارمصرف) | ✅ 403 |
| ۶) ابطال دستگاه آزمایشی | 200 | ✅ 200 (hotfix-live-test-050c22) |

شاهد: `download/pn031-hotfix/live-test.json` — **VERDICT: PASS**

## ۶) دروازهٔ کیفیت

| بند | نتیجه |
|-----|-------|
| tsc (`bunx tsc --noEmit`) | **صفر خطا** (رفع یک تایپ پیشین TS2749 در تست pn031 — ازپیش‌موجود، درزمانی) |
| lint | **صفر خطا** (۶ هشدار ازپیش‌موجود، هم‌سان HEAD) |
| تست ×۲ (دو-سبز) | **۲۶۳۰ pass · 0 fail ×۲** (رکورد تازه؛ قبلی ۲۶۱۷) — شامل ۱۳ تست تازهٔ pn031-hotfix |
| گاردها | **۴۲/۴۲ سبز** — گارد audit-mobile-relay بند ۹ تازه گرفت: «قانون URL عمومی جلسهٔ ۰۳۸» (نقطهٔ یگانه + صفر آدرس داخلی در دو روت + اولویت‌ها + fail-closed + بقا در escrow) |
| بیلد + ری‌استارت | BUILD_ID = HEAD = `7a3b414-20261012-1004` · health 200 · env زنده: MELK_PUBLIC_BASE_URL اعمال‌شده در بوت ✓ |
| تکرارپذیری | audit-reproducibility: **REPRODUCIBLE ✓** (سرور = کد) |
| قفل ترتیب | `MELK_ARM_OFFLINE=1` پابرجا — رله گارد آفلینی را دور نمی‌زند؛ برداشتن فقط پس از تست تونل زندهٔ گوشی مالک (رویهٔ چهارگامهٔ online-mode.json) |

## ۷) فایل‌های تغییر‌یافته

| فایل | تغییر |
|------|-------|
| `src/lib/http/public-url.ts` | **تازه** — getPublicBaseUrl + isPublicHost + PublicBaseUrlError |
| `src/app/api/admin/relay/enroll/route.ts` | nextUrl.origin → getPublicBaseUrl (پیش از ساخت دستگاه) |
| `src/app/api/mobile-relay/bootstrap/route.ts` | nextUrl.origin → getPublicBaseUrl (پیش از مصرف کد) |
| `src/lib/auth/boot-secrets.ts` | MELK_PUBLIC_BASE_URL جزو BOOT_SECRET_KEYS (بقای سه‌لایه) |
| `tests/pn031-hotfix-public-url.test.ts` | **تازه** — ۱۳ تست (A اولویت‌ها · B رگرسیون روت‌ها · C ثبت env · D سازگاری) |
| `tests/platform-env-fallback.test.ts` | WATCHED_KEYS + MELK_PUBLIC_BASE_URL (درس ۲) |
| `tests/pn011-boot-secrets.test.ts` | ENV_KEYS + MELK_PUBLIC_BASE_URL |
| `tests/pn031-mobile-relay.test.ts` | رفع تایپ پیشین TS2749 (drive-by) |
| `env.platform.json.example` | مستندسازی MELK_PUBLIC_BASE_URL |
| `scripts/audit-mobile-relay.sh` | بند ۹ — قانون URL عمومی جلسهٔ ۰۳۸ |
| `scripts/pn031-hotfix/{live-test.sh,regenerate-owner.ts}` | **تازه** — اسکریپت‌های ماندگار |
| `docs/LESSONS-LEARNED.md` | **تازه** — درس‌های ۳ تا ۶ |
| `download/pn031-hotfix/*` | شاهدها: diagnosis · live-test · regenerated + QR |

## ۸) اقدام مالک (دقیقهٔ صفر تا دو)

1. **Termux را باز کنید** (نصبش از قبل کامل و سالم است — کاری لازم نیست)
2. **این دستور تازه را پیست کنید و Enter بزنید:**

```
pkg install -y curl openssl jq && curl -fsSL "https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai/api/mobile-relay/bootstrap?code=46a377085260db22d010ec9357ee6a0eb221" -o ~/melka-relay.sh && chmod 600 ~/melka-relay.sh && bash ~/melka-relay.sh
```

3. صبر کنید تا پیام «رلهٔ ملکا فعال است» را ببینید — از آن پس گوشی رله است
4. در تنظیمات ملکا ← اتصال به ملک تبریز ← رلهٔ موبایل ← **«تست تونل»** را بزنید — سبز شدنش یعنی کامل
5. خبر بدهید تا رویهٔ چهارگامه را کامل کنم: برداشتن `MELK_ARM_OFFLINE` ← ری‌استارت ← ورود شما با کد پرسنلی و OTP

**نکتهٔ اعتبار:** کد بالا ۳۰ دقیقه اعتبار دارد (تا ~۱۰:۳۹ UTC). اگر منقضی شد، هیچ خطری نیست: در همان تنظیمات، دکمهٔ «راه‌اندازی رله (ثبت دستگاه + QR)» را دوباره بزنید — آن دکمه هم اکنون نشانی عمومی می‌سازد و دستور تازه می‌دهد.

---

*امضای اجرا: GLM (Super Z) — به سفارش جلسهٔ فوری ۰۳۸ شورای عالی ملکا · ۱۴۰۵/۰۷/۲۲*
