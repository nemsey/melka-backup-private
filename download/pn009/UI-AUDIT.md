# UI_AUDIT_COMPLETE — مرحله A (ملکا-شورا-ن۰۰۹-۱۴۰۵)

تاریخ: ۲۰۲۶-۱۰-۰۶ · دامنه: M1/M2/M3/M4 · تغییر سورس: صفر (فقط بررسی)

## نگاشت ماژول‌ها

| ماژول | کاشی | مسیر | خطوط |
|---|---|---|---|
| M1 | آگهی ملک تبریز (arm-listings) | src/core/tiles/tiles/arm-listing/ArmListingsPage.tsx | 1086 |
| M2 | درخواست ملک تبریز (arm-requests) | src/core/tiles/tiles/arm-request/ArmRequestsPage.tsx + AreasFileCell.tsx | 1047+101 |
| M3 | معاملات ملک تبریز | transactions-contracts/{TransactionsContractsPage 242, TransactionsTab 806, ContractFileDialog 284} | 1332 |
| M4 | کارشناسان ملک تبریز | experts/ExpertsPage.tsx | 563 |

## ۱. زیرساخت رنگ فعلی

- **رجیستری نیمه‌موجود:** src/lib/value-colors.ts (121 خط) — PALETTE دوازده‌خانه (emerald, sky, violet, amber, rose, teal, indigo, lime, orange, cyan, fuchsia, stone) + CANONICAL (فروش/خرید/مبایعه‌نامه→emerald، پیش‌فروش→sky، رهن و اجاره→violet، مشارکت→amber، تمدید اجاره→cyan، شعبه‌ها: ارتش→rose، باغلارباغی→teal، ملکی تبریزی→indigo، هتل مرمر→lime) + هش پایدار FNV-1a برای مقادیر ناشناخته + hasDistinctColors (گارد قانون عدم تکرار رنگ)
- **مصرف‌کنندگان رجیستری:** فقط همین ۴ ماژول (فیلتر چیپ + ستون جدول)
- **تم:** Tailwind v4 (@theme inline در globals.css) + پالت ۱۳بخشی sec-m1..m8 با Light/Dark + chart-1..5 متغیر CSS

## ۲. مشکلات کشف‌شده (فهرست کامل)

### A. رنگ‌های خارج از رجیستری (نقض قانون طلایی)
1. **STATE_BADGE_CLASS محلی ×۲** — ArmListingsPage.tsx:160-171 (۱۰ وضعیت: teal/emerald/fuchsia/amber/rose/violet/sky/orange/lime/stone) و ArmRequestsPage.tsx:166-173 (۶ وضعیت: teal/amber/sky/violet/rose/stone) — هماهنگ طراحی شده ولی مستقل نگهداری می‌شوند (ریشهٔ «سبز ۷ در M1 و سبز ۱۲ در M3»)
2. **M3 KPI هاردکد:** مبایعه‌نامه bg-teal-100/amber (نقض قانون Filter↔List — چیپ مبایعه‌نامه emerald است ولی KPI آن teal!) · اجاره amber (چیپش violet است)
3. **M3 لینک‌های موبایل** text-teal-700 ×۲ · نشان تجمیع حق‌السهم bg-teal-100 · آیکون هولوگرام text-teal-600 — همه بیرون از سیستم معنایی
4. **M2 AreasFileCell:** آیکون MapPin text-rose-500 ×۲ + text-teal-600 — تزئینی بی‌معنا
5. **M4 دکمهٔ بروزرسانی:** variant پیش‌فرض (بدون رنگ sec-m4) — تنها ماژول ناهماهنگ
6. **نمودار M3:** سری‌ها از --chart-1/2/3 (turquoise/copper/jade) — نه از رنگ معنایی مبایعه/اجاره (قانون ۱۴: هماهنگی چارت با فیلتر/فهرست)

### B. فیلترها (قانون ۶)
7. M4: **۲۰ فیلد تخت بدون گروه‌بندی** — بلندترین فیلتر؛ mobile collapse دارد ولی گروه منطقی ندارد
8. M2/M1: چیپ‌ها + فرم بدون برچسب گروه («شناسه»/«کارشناس و شعبه»/«قیمت و بازه») — py-1.5 قابل فشرده‌سازی به py-1
9. شمارندهٔ «فیلترهای فعال» روی دکمهٔ باز/بسته در موبایل وجود ندارد
10. **جای‌نگهدارنده‌های قیمت با «٬» (U+066C)** در هر سه ماژول ولی خروجی faNumber با «،» (U+060C) — ناسازگاری

### C. قیمت (قانون ۹)
11. **M2 priceRangeLabel (L356-364): «از X / تا Y» تک‌خطی با اسلش** — الزام: دو خط «از X» / «تا Y»

### D. بروزرسانی (قانون ۱۳)
12. **M3 هنوز توضیحات بلند زیر عنوان دارد** (TransactionsContractsPage.tsx:158-160): «گزارش تطابق معاملات... بدون مهلت ۹۰ ثانیه...» + دو بج توضیحی «ازسرگیری از آخرین نقطهٔ کامل» / «پاسخ فوری — بدون مهلت ۹۰ ثانیه» (L218-223) — M1/M2 در PN-003 حذف کردند؛ M3 جا مانده بود
13. وابستگی تست: pn002-tiles.test.ts فقط «حضور نداشتن» توضیحات M1/M2 را قفل کرده؛ برای M3 هیچ تستی متن توضیح را پین نکرده (حذف ایمن) — شواهد: جستجو در tests/ انجام شد

### E. هماهنگی ظاهری (قانون ۱۵)
14. M4 native type=date (تنها ماژول بدون JalaliDatePicker) — ظاهر ناهماهنگ؛ تغییر به جلالی = تغییر فرمت ارسالی به API → طبق قانون STOP فقط ظاهر یکدست می‌شود، نوع ورودی حفظ می‌شود
15. Chips وضعیت M1/M2 الگوی مشترک دارند ولی در دو فایل تکرار شده‌اند (ریسک واگرایی)

### F. خوب‌های موجود (حفظ می‌شوند)
- جدول‌ها: virtualized، p-2 text-xs، header چسبان، بدون صفحه‌بندی (قانون فهرست)
- سلول‌های چندمقداری: AreasFileCell (+N با BottomSheet) · تجمیع مشاوران M3 (+N مشاور دیگر) · دسته‌بندی چیپ valueSoftClass
- فیلترها: normalizeFilterInput فارسی/عربی/لاتین · debounced auto-apply در M3 · matchMedia collapse در M1/M2
- خروجی اعداد فارسی با جداکننده (faNumber/faAmountFull)

## ۳. تست‌های مرتبط (باید همزمان به‌روز شوند)

pn002-tiles (ستون‌ها + حذف توضیحات M1/M2 + «-» M4) · p6530-color-system (پالت ۱۳بخشی + AA + اکسنت رجیستری) · p6549-luxury-law (ستون قیمت + «از»/«تا» M2 + آکاردئون + PALETTE) · p6530-architecture-guards (قانون فهرست) · p6527-mobile-list-performance (یک TableBodyVirtual) · phase1-* (KpiCard/useTileData) · pn008-experts

## ۴. طرح مرحله B (مصوب برای اجرا)

1. **گسترش رجیستری value-colors.ts به منبع یگانه:** ورود STATE_BADGE_CLASS دو ماژول به رجیستری (listingStateBadgeClass / requestStateBadgeClass) + valueChartVar(value) برای چارت (متغیر CSS هر خانهٔ پالت با نسخهٔ Light/Dark در globals.css: --sem-emerald و...)
2. **globals.css:** خانه‌های --sem-* با تنظیم روشنایی Dark فقط به اندازهٔ لازم
3. سپس M1 → Gate → M2 → Gate → M3 → Gate → M4 → Gate → Cross-Audit

حکم: **UI_AUDIT_COMPLETE** — هیچ تغییری در این مرحله اعمال نشد.
