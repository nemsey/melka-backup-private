# آرشیو موتورهای Sync قدیمی — PN-051 · فرمان ۳

> «کدهای sync قبلی را حذف نکن، بلکه به آرشیو منتقل کن تا منطق‌های کشف‌شده
> (مثل پارس HTML) از دست نروند.» — DIR-PN051-SUPREME · فرمان ۳

## وضعیت:ACTIVE-LEGACY (بازاستفاده‌شده — نه کپی)

موتورهای قدیمی **حذف نشدند** — همچنان زنده‌اند و ماژول‌های جدید LCPP از آن‌ها
**واردات رسمی** می‌کنند (صفر کپی کد). جابجایی فیزیکی فایل‌ها به این پوشه عمداً
انجام نشد چون importهای زندهٔ dیمن catalog و مسیرهای bootstrap به آن‌ها گره خورده‌اند؛
جدول زیر «نقشهٔ آرشیو» رسمی است (ADR-051-01).

| فهرست LCPP جدید | منطق کشف‌شدهٔ بازاستفاده‌شده (legacy) | نمونه کشف ارزشمند |
|---|---|---|
| `src/sync/lists/arm-listings.ts` (M1) | `src/lib/melk-api/arm-catalog.ts` — `mapArmPropertyListRow` · `composeLocationAddress` · گارد صفحهٔ معیوب ×۳ · Fresh-Head pass | کشف ۱۴۰۵/۰۶/۲۹: مسیر واقعی `properties/list` (بدون /list = 404) |
| `src/sync/lists/arm-requests.ts` (M2) | همان فایل — `mapArmRequestListRow` · `extractNameArray` · `extractRequestInputs` | کشف P6547: area/line آرایه‌های خود ردیف (بدون نیاز به details که 500 می‌دهد) |
| `src/sync/lists/transactions.ts` (M9) | `adapters.mapArmContractRow` · `tx-info-enrichment.mapTxInfoPayload` | کشف: مبلغ فروش = contractPrice · اجاره = contractRent |
| `src/sync/lists/melketun-listings.ts` (M7) | `src/lib/integrations/melketun/sync.ts` — `crmLogin` · `CookieJar` · `extractInertiaProps` (پارس HTML) · `filingToProperty` · `syncMelketunRows` | کشف PN-047: `/MelketunPublicFilingPlus` (فرم بدون پسوند = 404) |
| `src/sync/lists/melketun-requests.ts` (M8) | همان فایل — `potentialToRequest` · `KNOWN_BAD_POTENTIAL_PAGES` (صفحات ۵۰۰ پایدار) | کشف: صفحات معیوب پایدار 339/372/385/390 |
| هستهٔ مشترک | `src/sync/lists/kernel.ts` + `src/sync/lists/melketun-common.ts` | محافظ قانون ۰۴ در SQL CASE |

## چرا نگاشت نگهداشته شد (ADR-051-01)

قانون بقا ۱ (تثبیت: هیچ تغییر بدون ADR + build=HEAD): جابجایی فیزیکی فایل‌های
در حال سرویس‌دهی = شکستن importهای زنده (catalog-daemon · instrumentation ·
bootstrap). راه‌حل: LCPP پوشهٔ تازه است و از legacy **واردات** می‌کند؛
legacy در محل خود مستند-به‌آرشیو است. اگر شورا جابجایی فیزیکی را هم خواست،
گامش: (۱) shim re-export در مسیر قدیمی (۲) build سبز (۳) تست ۳۷گانی gate.

## یافتهٔ فرمان ۶ (خالی بودن فهرست معاملات ملکتون)

`sync.ts` قدیمی در خطوط 627/859-860 معاملات ملکتون را **hardcoded صفر** نگه می‌داشت
(`transactions: 0`) — مسیر /Deals · /Contracts هرگز کاویده نشده بود. ماژول M9
این کاوش را با `probeMelketunDeals()` انجام می‌دهد (شاهد: `upload/.runtime/lcpp-m9-melketun-probe.json`).

## تصمیم نگاشت M7/M8 (ADR-051-02 — صادقانه)

انبوه ARM (M1/M2/M9) → better-sqlite3 خام (خط قرمز: Prisma-در-حلقه ممنوع).
M7/M8 ملکتون → مسیر قانونی `syncMelketunRows` (merge.ts · قاعدهٔ ب Law 05) باقی ماند
زیرا: (۱) قانون برتری متخصص در SQL CASE قابل‌ بیان نیست (provenance + fieldChanges)
(۲) حجم ملکتون ~صدها ردیف — گلوگاه نیست (۳) قانون دادهٔ مقدس بر سرعت مقدم است.
