# مستند یکپارچه‌سازی API — اتصال به سامانه‌های ملک تبریز

**مالک و برنامه‌نویس و طراح: سید نعمت اله سیدی**

این سند نحوه‌ی اتصال داشبورد به `https://arm.melketabriz.ir` (CRM) و `https://pm.melketabriz.ir` (مدیریت درخواست‌ها) را مستند می‌کند: Endpoint ها، فرمت درخواست/پاسخ، احراز هویت و مدیریت خطا.

---

## ۰) فرض مستند (تصریح الزامی)

مشخصات رسمی و عمومی API سامانه‌های ملک تبریز در دسترس نبود؛ بنابراین **الگوی Endpoint ها مطابق قراردادهای REST رایج سامانه‌های CRM املاک تعریف شده است** و به‌صورت «فرض مستند» در `src/lib/melk-api/endpoints.ts` متمرکز شده است. پس از دریافت مستندات رسمی، **فقط همین فایل و نگاشت پاسخ‌ها در `provider.ts`** باید هم‌تراز شوند — هیچ بخش دیگری از اپلیکیشن تغییری نمی‌کند (این همان لایه انتزاعی الزامی سند طرح است).

## ۱) معماری اتصال (BFF)

```
کلاینت (مرورگر/اندروید)  ──مسیرهای نسبی /api/*──▶  Next.js BFF  ──HTTPS──▶  arm.melketabriz.ir
                                                                     pm.melketabriz.ir
```

- کلاینت **هرگز** مستقیماً به سامانه‌های خارجی وصل نمی‌شود؛ بنابراین توکن CRM هرگز به مرورگر نمی‌رسد.
- همه درخواست‌های کلاینت مسیر نسبی هستند (سازگار با Caddy/gateway و PWA).
- Timeout: `MELK_API_TIMEOUT_MS` (پیش‌فرض ۱۵ ثانیه) با AbortController؛ retry نمایی برای خطاهای شبکه/5xx تا `MELK_API_MAX_RETRIES` (پیش‌فرض ۲).

## ۲) رجیستری Endpoint ها

| کلید | مسیر (فرض) | متد | شرح |
|---|---|---|---|
| `auth.requestOtp` | `/api/v1/auth/request-otp` | POST | صدور کد پیامکی برای کد پرسنلی |
| `auth.verifyOtp` | `/api/v1/auth/verify-otp` | POST | تأیید کد و صدور توکن |
| `auth.refresh` | `/api/v1/auth/refresh` | POST | تمدید نشست |
| `auth.logout` | `/api/v1/auth/logout` | POST | خروج |
| `crm.transactions` | `/api/v1/deals` | GET | فهرست معاملات |
| `crm.experts` | `/api/v1/agents` | GET | فهرست کارشناسان |
| `pm.requests` | `/api/v1/requests` | GET | درخواست‌های خرید (pm) |

## ۳) احراز هویت

**مرحله ۱ — درخواست OTP**
```http
POST https://arm.melketabriz.ir/api/v1/auth/request-otp
Content-Type: application/json

{ "personnelCode": "410031320" }
```
پاسخ موفق:
```json
{ "ok": true, "expiresInSeconds": 180 }
```

**مرحله ۲ — تأیید OTP**
```http
POST https://arm.melketabriz.ir/api/v1/auth/verify-otp
Content-Type: application/json

{ "personnelCode": "410031320", "otp": "123456" }
```
پاسخ موفق:
```json
{
  "token": "<token-crm>",
  "expiresInHours": 12,
  "user": { "personnelCode": "410031320", "displayName": "پریسا ملکی", "role": "CONSULTANT" }
}
```

**استفاده از توکن**: همه فراخوانی‌های داده با هدر `Authorization: Bearer <token-crm>` — این هدر فقط سمت سرور BFF ساخته می‌شود.

**دو لایه نشست**: توکن CRM در BFF نگهداری/تمدید می‌شود؛ در مقابل، کلاینت یک **توکن داشبورد** جداگانه (صادرشده از `/api/auth/verify-otp` همین اپ) دریافت می‌کند که هش آن در SQLite ذخیره شده است. این جداسازی باعث می‌شود نشست داشبورد مستقل از جزئیات سامانه ملک تبریز مدیریت شود.

## ۴) فرمت داده

**معامله (`CrmTransaction`)**:
```json
{
  "id": "TR-00635",
  "dealDate": "2026-09-12T02:38:33.296Z",
  "listingCode": "MT-94719",
  "requestCode": "RF-33447",
  "expertCode": "410031315",
  "expertName": "سعید موحدی",
  "price": 54900000000,
  "district": "ولیعصر",
  "propertyType": "باغ",
  "area": 1593,
  "commission": 274500000
}
```
- `price/commission`: عدد صحیح تومان (بدون جداکننده).
- `requestCode`: null وقتی معامله از مسیر درخواست رسمی نبوده (برای محاسبه نرخ تبدیل).

**کارشناس (`CrmExpert`)**:
```json
{
  "id": "EX-021",
  "personnelCode": "410031321",
  "fullName": "آرش صابری",
  "mobile": "09147636801",
  "address": "تبریز، خیابان صمدیه، پلاک 106",
  "branch": "شعبه ائل‌گلی",
  "active": true,
  "joinedAt": "2020-05-19T02:17:07.283Z"
}
```

**صفحه‌بندی**: پاسخ لیست‌ها `{ "rows": [...], "total": 640 }` و درخواست با `limit`/`offset` (پیش‌فرض ۵۰، حداکثر ۲۰۰۰ برای تحلیل).

**فیلترهای پشتیبانی‌شده معاملات** (query string): `from`، `to`، `expertName`، `expertCode`، `listingCode`، `requestCode`، `priceMin`، `priceMax`، `district`، `propertyType`، `sort`، `dir`.

**فیلترهای کارشناسان**: `fullName`، `mobile`، `personnelCode`، `address`، `branch`، `active`.

## ۵) مدیریت خطا (نرمال‌شده)

`MelkApiError` با کدهای استاندارد و پیام فارسی:

| کد | HTTP | معنی | رفتار UI |
|---|---|---|---|
| INVALID_PERSONNEL_CODE | 404/400 | کد پرسنلی در سامانه نیست | پیام خطا روی فرم ورود |
| OTP_EXPIRED | 410 | کد منقضی/صادرنشده | درخواست مجدد |
| OTP_INVALID | 401 | کد غلط | شمارنده تلاش |
| RATE_LIMITED | 429 | محدودیت نرخ/قفل | پیام + زمان صبر |
| TIMEOUT | 504 | عدم پاسخ در مهلت | retry خودکار BFF سپس پیام |
| NETWORK_ERROR | 0 | قطعی شبکه | راهنمای اتصال |
| UNAUTHORIZED | 401 | نشست منقضی | خروج خودکار → ورود |
| SERVER_ERROR | 5xx | خطای سامانه ملک تبریز | retry خودکار + پیام |

## ۶) روشن‌کردن حالت اتصال واقعی

1. در `.env`:
```env
MELK_API_MODE=real
MELK_ARM_BASE_URL=https://arm.melketabriz.ir
MELK_PM_BASE_URL=https://pm.melketabriz.ir
MASTER_ACCESS_CODE=<کد-جدید-۸-رقمی>
SESSION_TTL_HOURS=12
MELK_API_TIMEOUT_MS=15000
MELK_API_MAX_RETRIES=2
```
2. `bun run dev` و تست از «تنظیمات عمومی ← مدیریت اتصال ← تست اتصال».
3. در حالت Real، کد OTP **هرگز** به کلاینت برگردانده نمی‌شود (فقط در Mock برای دمو).

## ۷) همگام‌سازی داده (Extract-and-Cache)

- اولین درخواست داده پس از بالا آمدن، اگر کش خالی باشد، کل داده را می‌کشد (`ensureSeeded`).
- فیلتر و تحلیل همیشه روی SQLite محلی — کاهش بار سامانه ملک تبریز و سرعت بالا.
- دکمه «ریست اتصال»: نشست را ابطال، کش را پاک و `resyncAll` را اجرا می‌کند.
- پیشنهاد برای استقرار تولید: cron/فیلتر تاریخ «فقط تغییرات از آخرین همگام‌سازی» — ساختار `sync.ts` برای افزودن `since` پارامتر آماده است.

## ۸) نکات امنیتی یکپارچه‌سازی

- کلاینت فقط توکن داشبورد (نقطه‌گذاری‌شده و رمزنگاری‌شده) می‌بیند؛ توکن CRM در حافظه سرور BFF.
- همه‌ی پاسخ‌های خطای BFF ساختار یکسان `{ok, code, message, retryable}` دارند — بدون لو رفتن جزئیات داخلی.
- Rate limiting روی هر سه مسیر احراز هویت (درخواست پیامک، تأیید، ورود مدیر) فعال است.
- رخدادهای امنیتی (ورود موفق/شکست، قفل، ریست) در `AuditLog` ثبت می‌شوند.
