# گزارش انتخاب منبع داده برای هر ستون (PN-051 · فرمان ۲)
تولید: 2026-10-28T22:31:45.994Z

## قرارداد انتخاب منبع
هر Job ابتدا **primary** را امتحان می‌کند؛ اگر مقدار نال/خالی بود، سراغ **fallback** می‌رود.
قانون ۰۵ (دادهٔ مقدس): به‌روزرسانی متخصص (`crm_private`) همیشه برنده است — اجرای قانون در `src/lib/merge.ts` (قاعدهٔ ب).
قانون ۰۴: null هرگز روی مقدار پر نمی‌نشیند — محافظ درگاه SQL در `src/sync/lists/kernel.ts`.

## لایه‌های اولویت
- **critical (P0)** → فاز A «Fast-Pass»: ستون‌های حیاتی (مالک · آدرس · متقاضی) — هدف ≤۱ دقیقه
- **standard (P1)** → فاز B «Deep-Pass»: متادیتا · قیمت · نوع
- **deep (P2)** → فاز B: تصاویر · جزئیات کامل

### آگهی‌ها (PropertyRecord — M1 ملک‌تبریز · M7 ملکتون)

| ستون | ستون‌های DB | primary | fallback | لایه |
|---|---|---|---|---|
| owner | `ownerName`, `ownerMobile`, `rawOwnerName`, …` | **arm_owner** | public_site | critical |
| address | `address`, `areaName`, `lineName`, …` | **arm_details** | arm_list | critical |
| customer | `customerName`, `customerMobile` | **crm_private** | title_nlp | critical |
| ownerCode | `ownerCode`, `ownerName` | **arm_list** | crm_private | critical |
| price | `price`, `rawPrice`, `rawPriceUnit`, …` | **arm_list** | arm_details | standard |
| metadata | `meterage`, `rooms`, `floor`, …` | **arm_list** | arm_details | standard |
| propertyType | `propertyTypeId`, `propertyTypeName`, `tradeTypeId`, …` | **arm_list** | arm_details | standard |
| images | `imageCount`, `publicUrl` | **arm_list** | public_site | deep |
| ownerNote | `ownerNote` | **crm_private** | — | deep |

### درخواست‌ها (RequestRecord — M2 · M8)

| ستون | ستون‌های DB | primary | fallback | لایه |
|---|---|---|---|---|
| customer | `customerName`, `customerMobile` | **arm_owner** | crm_private | critical |
| ownerCode | `ownerCode` | **arm_list** | crm_private | critical |
| areas | `areasJson` | **arm_details** | arm_list | standard |
| priceRange | `priceFrom`, `priceTo` | **arm_list** | arm_details | standard |

### معاملات (TransactionRecord + TransactionEnrichment — M9)

| ستون | ستون‌های DB | primary | fallback | لایه |
|---|---|---|---|---|
| parties | `propertyCustomer`, `requestCustomer`, `buyerName`, …` | **tx_info** | tx_overview | critical |
| amount | `contractPrice`, `rawContractPrice` | **tx_info** | — | critical |
| date | `contractDate`, `documentDate`, `deliveryDate`, …` | **tx_overview** | tx_info | critical |
| expert | `ownerCode`, `realtorSharesJson` | **tx_info** | tx_overview | critical |
| status | `status`, `contractType` | **tx_info** | tx_overview | standard |
| propertyRef | `propertyCode`, `propertyTitle`, `propertyAddress` | **tx_overview** | tx_info | standard |


## آدرس فیزیکی Endpointها (Law 03)
- `arm_list` → ARM: properties/list · requests/list · trade-overviews/list (صفحه‌بندی؛ خودِ فهرست — صفر هزینهٔ اضافه)
- `arm_details` → ARM: properties/details/{id} · requests/details/{id} (آدرس دقیق + مشخصات)
- `arm_owner` → ARM: properties/owner/{id} · requests/applicant/{id} (نام/موبایل مالک یا متقاضی)
- `crm_private` → Melketun CRM: myFilings funnel (نمای خصوصی کارشناس — ویرایش مستقیم؛ Law 05 برنده)
- `crm_public` → Melketun CRM: filings module (نمای عمومی آگهی‌ها)
- `public_site` → melketabriz.com/apu — صفحات عمومی ملک تبریز (پوشش کدهای غایب از فهرست ARM)
- `title_nlp` → پارس عنوان آگهی (بدون فراخوانی شبکه — استخراج محلی)
- `tx_overview` → ARM: trade-overviews/list (ردیف فهرست صورت‌وضعیت — طرفین پایه)
- `tx_info` → ARM: trade-overviews/info/{id} (نوع/مبلغ/خریدار/فروشنده/مشاوران/وضعیت — ۱۰۰٪ ستون‌ها)

## مصرف‌کننده‌ها
- `src/sync/lists/arm-listings.ts` (M1) · `arm-requests.ts` (M2) · `transactions.ts` (M9) — مسیر ARM
- `src/sync/lists/melketun-listings.ts` (M7) · `melketun-requests.ts` (M8) — مسیر CRM ملکتون
- هستهٔ اجرا: `src/sync/lists/kernel.ts` (bulk upsert · همزمانی ۳ · تأخیر تطبیقی · delta)
