# نقشهٔ نقاط اتصال کشف‌شدهٔ سامانه‌های ملک تبریز — P6546

> سند شاهکار گام ششم دستور مالک (۱۴۰۵/۰۷/۱۲): «کشف endpoint مناسب جهت استخراج اطلاعات ستون‌های فهرست‌های چهارگانه شاهکار تو خواهد بود؛ هیچ ستونی بدون اطلاعات نباشد»
>
> تاریخ: ۱۴۰۵/۰۷/۱۲ · پرونده: P6546 · شواهد زنده: `download/p6546/systems-discovery-*.json`

## ۱. سامانه‌ها و رابط‌های برنامه‌نویسی کشف‌شده

| سامانه | فرانت | رابط (API) | احراز هویت | کشف |
|---|---|---|---|---|
| ARM — آگهی و درخواست | arm.melketabriz.ir | `https://arus-api.melketabriz.ir/api/apm/` | OTP کدپرسنلی + توکن | P6.5 (موجود) |
| ARM — بخش عمومی | — | `https://arus-api.melketabriz.ir/api/public/` | بدون توکن | P6.5 (موجود) |
| **ARM — بخش apu (سامانهٔ عمومی)** | **melketabriz.com** | **`https://arus-api.melketabriz.ir/api/apu/`** | **بدون توکن** | **P6546 (تازه)** |
| PM — پرسنلی | pm.melketabriz.ir | `https://pm-api.melketabriz.ir/api/` | OTP + توکن | P6.5 (موجود) |
| **GAP — گفت‌وگوی آنلاین** | **gap.melketabriz.ir** | **`https://gap-api.melketabriz.ir/api/`** | الگوی خانواده (OTP) | **P6546 (تازه)** |
| ACC — مالی | — | `https://fm-api.melketabriz.ir/` | توکن ARM | P6.5 (موجود) |

### کشف‌های کلیدی P6546 (شاهد پروب زنده)
- `apu/properties/list?page=&limit=` → **بدون توکن**؛ ۳٬۶۷۷ آگهی منتشرشدهٔ عمومی با رکورد غنی (کد، عنوان، قیمت کل، قیمت هر متر، نوع ملک، نوع معامله، منطقه، وضعیت + رنگ، کارشناس کامل با کد و موبایل، بازدید، تصویر/ویدیو)
- `apu/properties/info/by-code/{code}` → **بدون توکن**؛ جزئیات برچسب‌دار کامل (`details[]`: متراژ/اتاق/طبقه/سال ساخت/موقعیت/ساناد/...) + `inputs` + منطقه/خط + فهرست کارشناسان + توضیحات مشتری + امتیاز فایل + معاوضه
- `apu/realtors/info/by-code/{code}` → اطلاعات عمومی کارشناس با کد
- `gap-api.melketabriz.ir` → سرور Express زنده (پاسخ 404 استاندارد = در دسترس)؛ پایهٔ قابل تنظیم با `MELK_GAP_API_BASE`
- PM `realtors/info/personnelInfo/{id}` → **تاریخ استخدام واقعی** در `employeementInfo.date` + نقش + شعبهٔ PM + مدیر + مزایا (کشف کامل ساختار — شاهد `pm-hire-date-proof.json`)

## ۲. نقشهٔ ستون ← نقطهٔ اتصال بهینه (فهرست چهارگانه)

### M1 — آگهی ملک تبریز (۱۶ ستون)
| ستون | نقطهٔ اتصال بهینه | لایه |
|---|---|---|
| کد آگهی | `properties/list` | ۱ — فهرست |
| عنوان | `properties/list` + `apu/properties/list` | ۱ |
| کارشناس | `properties/list` (relatedRealtor) + `apu/properties/list` (کد+موبایل) | ۱ |
| شعبه | زنجیرهٔ تفکیک (نقشهٔ مالک → `businesses/info/own`) | ۱ |
| مالک (نام/موبایل) | `properties/owner/{id}` | ۲ — تکمیل جزئیات |
| **قیمت** | `properties/list` (totalPrice) + `apu/properties/list` | ۱ |
| **قیمت هر متر** | `apu/properties/list` (pricePerMeter) + `properties/details/{id}` | ۱+۲ |
| آدرس ملک | `properties/details/{id}` (آدرس دقیق) | ۲ |
| منطقه | `apu/properties/list` (area.name) + `properties/details/{id}` | ۱+۲ |
| **نوع ملک** | `apu/properties/list` (propertyType.name) + `properties/details/{id}` | ۱+۲ |
| **متراژ** | `apu/properties/info/by-code/{code}` (space) + `properties/details/{id}` | ۲ |
| **اتاق** | `apu/info/by-code` (room_whole) + `properties/details/{id}` | ۲ |
| **طبقه** | `apu/info/by-code` (floor) + `properties/details/{id}` | ۲ |
| **ساخت** | `apu/info/by-code` (year) + `properties/details/{id}` | ۲ |
| دسته‌بندی | `apu/properties/list` (tradeType.name) + `properties/details/{id}` | ۱+۲ |
| وضعیت (ده‌حالته) | `properties/list` (currentStatus) + `apu/properties/list` | ۱ |

### M2 — درخواست ملک تبریز (۱۲ ستون)
| ستون | نقطهٔ اتصال بهینه | لایه |
|---|---|---|
| کد درخواست / عنوان / کارشناس / وضعیت / تاریخ ثبت | `requests/list` | ۱ |
| متقاضی (نام/موبایل) | `requests/applicant/{id}` | ۲ |
| **قیمت (از/تا)** | `requests/details/{id}` (inputs فرم پویا) | ۲ |
| مناطق | `requests/details/{id}` | ۲ |
| **نوع ملک درخواستی** | `requests/details/{id}` (propertyCategory.propertyType) — کشف P6546 | ۲ |
| **نوع ساختمان** | `requests/details/{id}` (propertyCategory.buildingType) — کشف P6546 | ۲ |
| دسته‌بندی | `requests/details/{id}` (propertyCategory.tradeType) | ۲ |

### M3 — معاملات ملک تبریز (۱۱ ستون)
| ستون | نقطهٔ اتصال بهینه | لایه |
|---|---|---|
| کد ملک / کد درخواست / تاریخ معامله / رویدادها | `realtor-reports/traded-count` | ۱ |
| نوع قرارداد / **قیمت** / خریدار / فروشنده / هولوگرام / حق‌السهم | `trade-overviews/info/{id}` (غنی‌سازی صورت‌وضعیت) | ۲ |
| فایل قرارداد | `trade-overviews/list` + `special-properties/info/{id}` | ۲ |

### M4 — کارشناسان و کارکنان (۱۰ ستون)
| ستون | نقطهٔ اتصال بهینه | لایه |
|---|---|---|
| نام / موبایل / وضعیت | `realtors/list` (ARM) | ۱ |
| کد پرسنلی | `pm/realtors/list` (PM — منبع حقیقت) | ۱ |
| شعبه | زنجیرهٔ تفکیک + `pm/personnelInfo` (branchId) | ۱+۲ |
| **نقش پرسنلی** | `pm/realtors/list` (role.title) + `pm/personnelInfo` (jobTitle) | ۱+۲ |
| **تاریخ استخدام** | `pm/realtors/info/personnelInfo/{id}` → `employeementInfo.date` — کشف P6546 | ۲ |
| مبایعه‌نامه / اجاره‌نامه | تجمیع `traded-count` + `trade-overviews/list` (realtorList) | ۱+۲ |

## ۳. لایه‌های بروزرسانی (دستور گام پنجم-پ)
| لایه | اندازهٔ هر کلیک | نقطهٔ اتصال |
|---|---|---|
| فهرست آگهی‌ها | **≈ ۵٬۰۰۰ رکورد** (۱۰ صفحه × ۵۰۰) | `properties/list` + `apu/properties/list` |
| فهرست درخواست‌ها | **۵۰ صفحه** (≈ ۲٬۵۰۰ رکورد) | `requests/list` |
| تکمیل جزئیات | **≈ ۵۰۰ رکورد** | `properties/owner` + `properties/details` + `requests/applicant` + `requests/details` |
| معاملات | پس‌زمینه‌ای با پیشرفت (فوری، بدون مهلت) | `/api/crm/transactions/sync` (۴ مرحله) |

## ۴. پایداری (دستور گام پنجم-پ-۳ و گام ششم-۲)
- **دیمون پایدارساز** (هر ۳ دقیقه، درون‌فرایندی): برش کاتالوگ + غنی‌سازی + **tx-info** + **استخدام PM** + **چرخهٔ ساعتی سامانهٔ عمومی** + خنک‌ساز تطبیقی
- **تاب‌آوری کلاینت** (`apiSync`): تا ۳ تلاش خودکار روی 502/504/مهلت — هر تلاش از checkpoint ادامه می‌یابد (قانون داده اول، سپس checkpoint)
- **بروزرسانی پس‌زمینه‌ای M3**: پاسخ فوری + پیشرفت پایدار در SyncJobState + پایش زندهٔ UI

## ۵. قوانین محترم‌شده
- صفر حذف داده — همهٔ upsertها merge-non-null (دادهٔ ARM موجود هرگز بازنویسی نمی‌شود)
- صفر تغییر در ۱۱ موتور مغز — مدل=پیکربندی، engineSet=SHARED-11 قفل نوعی
- هر ستونِ بدون داده، مسیر پر شدنش را صادقانه در جدول پوشش اطلاعات فهرست همان کاشی نشان می‌دهد
