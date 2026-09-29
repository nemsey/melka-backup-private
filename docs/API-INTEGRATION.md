# مستند یکپارچه‌سازی API — اتصال واقعی به سامانه‌های ملک تبریز

**مالک و برنامه‌نویس و طراح: سید نعمت اله سیدی**

این سند نحوه‌ی اتصال واقعی داشبورد به سامانه‌های ملک تبریز را مستند می‌کند: Endpoint ها، فرمت درخواست/پاسخ، احراز هویت و مدیریت خطا.

---

## ۰) ✅ کشف واقعی API (نه فرض!)

مشخصات رسمی API عمومی نبود؛ بنابراین **قرارداد واقعی با مهندسی معکوس باندل‌های رسمی دو سامانه (`arm.melketabriz.ir` و `pm.melketabriz.ir`) + تست زنده‌ی HTTP** استخراج شد:

| سامانه | فرانت | API واقعی (کشف‌شده) |
|---|---|---|
| ARM — سامانه مدیریت آگهی و درخواست | `https://arm.melketabriz.ir` | `https://arus-api.melketabriz.ir/api/apm/` |
| ARM — بخش عمومی | — | `https://arus-api.melketabriz.ir/api/public/` |
| PM — سامانه مدیریت پرسنلی | `https://pm.melketabriz.ir` | `https://pm-api.melketabriz.ir/api/` |

فناوری سمت سرور هر دو: **NestJS + Mongoose (MongoDB) + nginx** (تأییدشده با پاسخ‌های واقعی).

همه Endpoint ها در `src/lib/melk-api/endpoints.ts` متمرکز شده‌اند — با تغییر سامانه فقط همین فایل و آداپتور `adapters.ts` ویرایش می‌شود.

## ۱) معماری اتصال (BFF)

```
کلاینت (مرورگر/اندروید)  ──مسیرهای نسبی /api/*──▶  Next.js BFF  ──HTTPS──▶  arus-api.melketabriz.ir
                                                                     pm-api.melketabriz.ir
```

- کلاینت **هرگز** مستقیماً به سامانه‌های خارجی وصل نمی‌شود؛ بنابراین توکن ARM هرگز به مرورگر نمی‌رسد.
- توکن‌های ARM به‌صورت **رمزنگاری‌شده AES-256-GCM** در جدول نشست ذخیره می‌شوند (`MELK_TOKEN_KEY`).
- Timeout: `MELK_API_TIMEOUT_MS` (پیش‌فرض ۲۵ ثانیه — میزبانی ایرانی کند است) با AbortController؛ retry نمایی برای خطاهای شبکه/5xx تا `MELK_API_MAX_RETRIES`.
- همگام‌سازی خودکار پس‌زمینه هر `MELK_SYNC_INTERVAL_MINUTES` دقیقه (پیش‌فرض ۵) از طریق `src/instrumentation.ts`.

## ۲) رجیستری Endpoint ها (✅ واقعی — استخراج‌شده از باندل‌ها)

| کلید | مسیر واقعی | متد | شرح |
|---|---|---|---|
| `arm.requestOtp` | `authentication/otp/{code}` | GET | **ارسال پیامک** — کد پرسنلی در مسیر URL |
| `arm.verifyOtp` | `authentication/otp/login` | POST | تأیید کد ۴ رقمی: `{code, otpCode}` |
| `arm.refreshToken` | `authentication/refresh-token` | POST | `{refreshToken}` → توکن جدید |
| `arm.logout` | `authentication/logout` | GET | خروج از ARM |
| `arm.tradedTotal` | `realtor-reports/traded-count-total` | GET | گزارش معاملات (صفحه‌بندی + بازه تاریخ) |
| `arm.tradedCount` | `realtor-reports/traded-count` | GET | شمارش معاملات: `{count, totalPages}` |
| `arm.realtorInteractions` | `realtor-reports/realtor-interactions` | GET | تعاملات کارشناسان |
| `arm.realtorsList` | `realtors/list` | GET | فهرست کارشناسان (realtor = کارشناس املاک) |
| `arm.badgeCount` | `count/badge` | GET | شمارش اعلان‌ها |
| `armPublic.enums` | `statics/enums-persian` | GET | مقادیر شمارشی فارسی (بدون توکن) — ✅ تست‌شده با پاسخ ۲۰۰ واقعی |
| `pm.portalInfo` | `public/portalInfo` | GET | اطلاعات پورتال پرسنلی |
| `pm.requestOtp` | `authentication/otp/{code}` | GET | پیامک سامانه پرسنلی |
| `pm.verifyOtp` | `authentication/otp/login` | POST | ورود سامانه پرسنلی |
| `pm.refreshToken` | `authentication/refreshToken` | POST | تمدید توکن پرسنلی |

**پارامترهای صفحه‌بندی گزارش‌ها** (رفتار خود سامانه ARM): `page`, `limit`, `startDate`, `endDate` — تاریخ‌ها در قالب **جلالی «YYYY/MM/DD»**.

## ۳) احراز هویت واقعی (تست‌شده)

**مرحله ۱ — درخواست OTP (پیامک از سمت سامانه ARM)**
```http
GET https://arus-api.melketabriz.ir/api/apm/authentication/otp/410031320
```
پاسخ موفق (پوشه NestJS):
```json
{ "statusCode": 200, "status": true, "data": { "verificationMinutesLimit": 3 }, "message": "..." }
```
- کد تأیید **۴ رقمی** است (کشف از `numInputs:4` فرم ورود خود سامانه ARM).
- عمر کد: ۱۸۰ ثانیه (شمارش معکوس خود سامانه).
- خطای ۴12: پیش‌نیاز ورود برقرار نیست (مثلاً نیاز به تکمیل ثبت‌نام).

**مرحله ۲ — تأیید OTP**
```http
POST https://arus-api.melketabriz.ir/api/apm/authentication/otp/login
Content-Type: application/json

{ "code": "410031320", "otpCode": "1234" }
```
پاسخ موفق:
```json
{
  "statusCode": 200, "status": true,
  "data": {
    "token": "<access-token>",
    "refreshToken": "<refresh-token>",
    "user": { "_id": "...", "type": "realtor", "fullName": "...", "code": "..." },
    "globalSettings": { ... }
  }
}
```
داشبورد این توکن‌ها را رمزنگاری‌شده ذخیره می‌کند و برای استخراج داده استفاده می‌کند؛ در صورت انقضا (۴۰۱) با `refresh-token` به‌طور خودکار تمدید می‌شود.

**فراخوانی داده‌ها**
```http
GET https://arus-api.melketabriz.ir/api/apm/realtor-reports/traded-count-total?page=1&limit=100
Authorization: Bearer <access-token>
```

## ۴) پوشه پاسخ و خطاها (NestJS)

```
موفق:  { statusCode, status: true,  data, message? }
خطا:   { statusCode, status: false, data: { error, stack }, message }
```

خطاهای شناسایی و ترجمه فارسی در `client.ts`:

| وضعیت HTTP / نشانه | کد داشبورد | پیام فارسی |
|---|---|---|
| 502/504 HTML nginx | `DB_DOWN` | «سرویس پشتیبان سامانه ملک تبریز موقتاً از دسترس خارج شده است» |
| 500 + `MongooseError` (buffering timed out) | `DB_DOWN` | «پایگاه داده سامانه ملک تبریز در حال حاضر در دسترس نیست» |
| 401 | `UNAUTHORIZED` | «اعتبار نشست سامانه ملک تبریز منقضی شده است» |
| 412 | `PRECONDITION_FAILED` | «پیش‌نیاز ورود در سامانه ملک تبریز برقرار نیست» |
| 429 | `RATE_LIMITED` | «درخواست بیش از حد مجاز» |
| تایم‌اوت AbortController | `TIMEOUT` | «پاسخ سامانه ملک تبریز در مهلت مقرر دریافت نشد» |

## ۵) همگام‌سازی داده واقعی (Extract & Cache)

- `POST /api/sync` (دستی — دکمه «همگام‌سازی داده‌ها» در تنظیمات): استخراج کامل معاملات (`traded-count-total`) و کارشناسان (`realtors/list`) با صفحه‌بندی خودکار؛ ذخیره اتمیک در SQLite.
- حلقه پس‌زمینه `instrumentation.ts`: هر ۵ دقیقه در صورت نبود داده یا خطای قبلی، تلاش مجدد — **به‌محض بازیابی سرورهای ملک تبریز، داده واقعی خودکار جایگزین می‌شود.**
- `dataSource` در پاسخ API‌های CRM: `lastSuccessAt`، `liveError`، تعداد تلاش‌ها — UI منبع داده را شفاف نشان می‌دهد.
- `GET /api/connection/status`: پروب زنده‌ی هر سه سرویس (قابل‌دسترسی + سلامت پایگاه داده + تأخیر).

## ۶) وضعیت زنده‌ی سامانه‌ها (تاریخ بررسی)

| سرویس | وضعیت |
|---|---|
| ARM public (`statics/enums-persian`) | ✅ 200 — داده واقعی استخراج شد |
| ARM auth (`authentication/otp/{code}`) | ⚠️ 500 Mongoose — **پایگاه داده MongoDB سمت ملک تبریز قطع است** (علت عدم ارسال پیامک) |
| PM (`public/portalInfo`) | ⚠️ 502/تایم‌اوت — سرویس پشتیبان قطع |

> این قطعی **سمت سرورهای ملک تبریز** است. اپلیکیشن به‌درگری متصل است و به‌محض بازگشت پایگاه داده، پیامک‌ها و استخراج داده به‌صورت خودکار فعال می‌شوند (حلقه همگام‌سازی پس‌زمینه).

---

## ۷) ساختار داده واقعی گزارش‌ها (کشف کامل از صفحات رسمی — بازنگری ۲)

ستون‌ها و فیلدهای هر گزارش، **عین تجزیه باندل صفحات رسمی سامانه ARM** استخراج و در آداپتورها پیاده شد:

### گزارش تطابق معاملات (TradedStatisticsPage — «گزارش تطابق معاملات»)

| ستون خود سامانه | فیلد API | مدل داشبورد |
|---|---|---|
| کد ملک/مالک | `propertyCode` + `propertyCustomer` | `propertyCode`, `propertyCustomer` |
| کد درخواست/درخواست‌دهنده | `requestCode` + `requestCustomer` | `requestCode`, `requestCustomer` |
| تاریخ معامله | `contractDate` (جلالی `YYYY/MM/DD`) | `contractDate` (ISO) |
| شماره هولوگرام | `contractHolo` | `contractHolo` |
| آگهی پیشنهادی | `suggestedPropertyCount` | `suggestedPropertyCount` |
| رویداد | `eventsCount` | `eventsCount` |

خلاصه چهارگانه بالای گزارش خود سامانه (`data`): `totalCount`, `hasRequestEvent`, `hasSuggestedProperty`, `hasBoth` — در داشبورد به‌علاوه `withHolo` و `withRequest` محاسبه می‌شود.

### فهرست کاربران (users-list-page — realtors/list)

| ستون خود سامانه | فیلد API | مدل داشبورد |
|---|---|---|
| نام و نام خانوادگی | `fullName` | `fullName` |
| شماره موبایل | `mobile` | `mobile` |
| نقش مشتری | `role.name` | `role` |
| کسب و کار | `businessId.title` | `businessTitle` |
| ثبت کننده | `creator.fullName` | `creator` |
| زمان ثبت | `createdAt` | `createdAt` |
| فعال | `active` | `active` |

### تعاملات مشاوران (realtor-interactions-page)

| ستون خود سامانه | فیلد API | مدل داشبورد |
|---|---|---|
| مشاور درخواست | `requestRealtorName` | `requestRealtorName` |
| مشاور آگهی | `propertyRealtorName` | `propertyRealtorName` |
| تعداد | `count` | `count` |

فیلترهای خود سامانه: `page`, `limit`, `startDate`, `endDate`, `realtor`, `hasMatch`.

### سایر گزارش‌های کشف‌شده (آماده کاشی‌های آینده)

- `trade-overviews` (+ `add-realtor`, `authenticate-realtor`, `confirm`, `contribution`) — چرخه قرارداد: پیش‌نویس → در انتظار افزودن مشاور → در انتظار تایید مشاوران → تایید حق السهم → در انتظار تایید مالی → تایید شده مالی → در انتظار تنظیم سند؛ با حق‌السهم/درصد مشاوران قرارداد، تاریخ سند/قرارداد/تحویل و خریداران.
- `realtor-reports/suggested-usage` (+ `-total`, `/request`) — گزارش تعامل مشاور با سیستم (آگهی پیشنهادی سیستم در برابر رویداد مشاور).
- `realtor-reports/property-statistics` / `request-statistics` — ماتریس وضعیت×مشاور (statusData) با فیلترهای عکس/فیلم/بیعانه/کارگزاری، اینستاگرام/دیوار (realtorAddToInsta/realtorAddToDivar)، tradeType/propertyType/buildingType و جستجوی آدرس regex.
- `configs/current-prices` — شاخص قیمت روز (جزئیات مشخصات و مناطق). *(P6530/گام ۵: کاشی M5 حذف شد — مسیر منبع صرفاً سند تاریخی)*
- `visits` — بازدیدها (کد آگهی، نام و شماره درخواست‌دهنده، زمان درخواست/تأیید، وضعیت).
- `api/apu/statistics/total` + `businesses/info/own` — محاسبه کمیسیون (تعرفه خرید و فروش، اجاره، شماره هولوگرام، صدور قبض).
- `price-evaluations` — لیست دلایل فروش، قیمت فایل، مطلوبیت فایل.
- SupplyDemandRanges — رنج عرضه و تقاضا. *(P6530/گام ۵: کاشی M6 حذف شد — مسیر منبع صرفاً سند تاریخی)*

## ۸) APIهای داشبورد (BFF)

| مسیر | شرح |
|---|---|
| `GET /api/crm/transactions` | گزارش تطابق با فیلتر تاریخ (جلالی در UI → ISO)، کد ملک/درخواست، هولوگرام، نوع تطبیق + خلاصه چهارگانه بازه |
| `GET /api/crm/experts` | فهرست کاربران با فیلتر نام/موبایل/کد/نقش/کسب‌وکار/ثبت‌کننده/وضعیت + مجموع تعامل هر کاربر |
| `GET /api/crm/interactions` | تعاملات مشاوران + درجه همکاری هر مشاور + ۱۰ نفر برتر |
| `GET /api/crm/meta` | نقش‌ها، کسب‌وکارها، ثبت‌کنندگان (از داده واقعی کش‌شده) |
| `POST /api/sync` | همگام‌سازی سه‌گانه: معاملات + کاربران + تعاملات + خلاصه چهارگانه |

## ۹) وضعیت زنده‌ی سامانه‌ها (بازنگری ۲ — پس از بازیابی)

| سرویس | وضعیت |
|---|---|
| ARM public (`statics/enums-persian`) | ✅ ۲۰۰ — داده واقعی |
| ARM auth (`authentication/otp/{code}`) | ✅ ۲۰۰ — **«کد تایید ارسال شد»** — ارسال پیامک واقعی تأیید شد؛ پایگاه داده MongoDB بازیابی شد |
| PM (`public/portalInfo`) | ⚠️ ۵۰۲ — سرویس پشتیبان پرسنلی همچنان قطع |

> ✅ جریان OTP واقعی اکنون کامل و فعال است: با ورود کد پرسنلی در اپلیکیشن، پیامک واقعی از سامانه ملک تبریز ارسال می‌شود و پس از تأیید، توکن ARM ذخیره و استخراج سه‌گانه داده واقعی (معاملات + کاربران + تعاملات) به‌صورت خودکار/دستی انجام می‌شود.

## ۱۲. یکپارچه‌سازی دیوار — کاشی فایل‌یابی (فاز ۱: تبریز)

### اعتبارنامه‌ها (تنظیمات عمومی → اتصال به دیوار)
| روش | مسیر | وضعیت |
|------|------|--------|
| کنارِ دیوار (رسمی) | `open-api.divar.ir` — `POST /v2/open-platform/finder/post` (SEARCH_POST) و `GET /v1/open-platform/finder/post/:token` (GET_POST) با هدر `x-api-key` | کلید پس از ثبت برنامه در divar.ir/kenar — آزمون زنده داخلی |
| موبایل + پیامک دیوار | `POST api.divar.ir/v8/auth/authenticate {phone}` → پیامک دیوار → `POST /v8/auth/confirm {phone, code}` → توکن نشست | ✅ زنده تست‌شده (AUTHENTICATION_VERIFICATION_CODE_SENT) |
| API عمومی وب (پیش‌فرض بدون کلید) | `POST api.divar.ir/v8/postlist/w/search` (city_ids=["5"]) و `GET /v8/posts-v2/web/{token}` | ✅ زنده تست‌شده — منبع پیش‌فرض موتور اسکن |

### موتور اسکن (زمان واقعی انتشار)
- شکل درخواست جستجو از وب‌سایت رسمی دیوار رهگیری شد: `category.str.value` + `sort_date`
- **فیلتر زمان بر «انتشار آگهی» از جزئیات هر آگهی** اعمال می‌شود (نه ترتیب نردبان/پله دیوار) — متن «انتشار آگهی: ۱۹ شهریور ۱۴۰۵، ۱۴:۰۲» با هسته جلالی تست‌شده تجزیه می‌شود
- آگهی‌های بیرون از بازه هرگز ذخیره نمی‌شوند (رد سیستم بدون آرشیو)
- تکراری‌ها: کلید تغییر (توکن+قیمت) — فقط تغییر قیمت یا صعود ≥۵ امتیاز به‌روز می‌شود

### منطقه‌بندی عین سامانه آرم
- منبع: `GET arus-api.melketabriz.ir/api/apm/areas/list` (عمومی، بدون توکن)
- ۱۳۰ منطقه و ۹۲۶ محله تبریز با مختصات جغرافیایی — فایل ایستا `src/lib/divar/tabriz-locations.data.json`
- تطبیق: متنی (با مرز واژگی پسین — جلوگیری از تطبیق کاذب «بینش»/«بی‌نشانه») + مختصات (هاورساین تا ۳ کیلومتر)
- نرمال‌سازی نام‌ها: ارقام فارسی/عربی ← لاتین، آ/أ/إ ← ا، حذف فاصله/ZWNJ — تا نام محاوره‌ای مالک («۳۵ متری سینا»، «الهی‌پرست»، «ولی عصر») مستقیماً به نام رسمی آرم حل شود

### فیلتر مکان ایجنت (منطبق با فیلتر مکان سامانه آرم)
- **۱۷ منطقة پیش‌فرض مالک** (دستور شهریور ۱۴۰۵): ولیعصر، ولیعصر جنوبی، استانداری، سپهر صادرات، میرداماد، زعفرانیه، الهی پرست، رجایی شهر، ویلاشهر، دادگستری (ایل گلی)، سهند (ایل گلی)، فردوس، باغچه بان، یاغچیان، ۳۵ متری سینا، گلشهر، پرواز — شناسه‌ها با `resolveAreaIdsByNames` حل می‌شوند (۱۷۲ محله)
- منطق: **اجتماع** (منطقه یا محله) — انتخاب کل منطقه همه محله‌هایش را می‌پوشاند؛ افزودن محله‌های خاص از مناطق دیگر ممکن است (`lineInSelection`/`locationAllowed`)
- اعمال دوسویه:
  - **زمان اسکن**: آگهی بیرون از انتخاب یا بدون تطبیق مکانی قابل اتکا هرگز ذخیره نمی‌شود (رد سیستم، شمارنده `outOfArea` در گزارش اسکن)
  - **زمان خواندن**: مسیر `ads` با `allowedLineIdsForSelection` فهرست و شمارنده‌ها را محدود می‌کند (آگهی‌های قدیمی بیرون از انتخاب فقط مخفی می‌شوند — حذف غیرمخرب)
- انتخاب خالی = «همه تبریز» (فیلتر خاموش)؛ مهاجرت یک‌بارة `locFilterInit` روی نصب‌های قدیمی ۱۷ منطقة پیش‌فرض را فعال می‌کند و پس از آن خالی‌سازی انتخاب آگاهانه است
- اعتبارسنجی: `validateLocationSelection` — هر شناسه باید در رجیستری آرم موجود باشد (PUT با ۴۰۰ رد می‌شود)

### امتیازدهی (پیش‌فرض ۵۰/۳۰/۲۰ قابل تنظیم)
| فیلتر | مبنای امتیاز |
|-------|---------------|
| شخصی‌بودن | واژگان مشاور (مشاور املاک/آژانس/فایل دربست…) و شخصی (بدون واسطه/مالک هستم/فوری…) + برچسب رسمی business کنار |
| زیرقیمت | درصد زیر بودن قیمت هر متر نسبت به میانه آگهی‌های مشابه همان محله (ترکیبی با آرم در صورت داده) |
| مکان | تطبیق متنی/مختصاتی با محله‌های آرم + محدوده انتخابی کاربر |

### APIهای داشبورد
| مسیر | کارکرد |
|-------|--------|
| `GET/POST /api/divar/connection` | وضعیت دو روش + ذخیره کلید کنار + شروع/تأیید پیامکی + ریست هر روش |
| `GET/POST /api/divar/scan` | گزارش اسکن‌ها + اجرای اسکن دستی (اسکن خودکار فرصت‌طلبانه) |
| `GET /api/divar/ads` | فایل‌ها بر اساس پنجره شکار/پیگیری/بررسی |
| `GET /api/divar/ads/{token}` | جزئیات کامل + تحلیل امتیاز + پیش‌بینی دلایل رد |
| `POST /api/divar/ads/{token}/reject` | رد با چک‌لیست دلایل — آگهی حذف، فقط سیگنال یادگیری می‌ماند |
| `GET/POST /api/divar/ads/{token}/register` | پیش‌نویس ۵ گامی ثبت آگهی آرم + ثبت نهایی `properties/create` با توکن ARM |
| `GET/PUT /api/divar/settings` | تنظیمات ایجنت (وزن‌ها/آستانه‌ها/بازه/دسته‌ها/مناطق فیلتر مکان — فقط مالک) |
| `GET /api/divar/locations` | رجیستری کامل ۱۳۰ منطقه/۹۲۶ محله آرم + ۱۷ منطقة پیش‌فرض مالک برای انتخابگر UI |
