
---

# فصل ۹ — سیستم طراحی (Design System)

> مرجع کد: `DESIGN-SYSTEM.md` (ریشه) + `src/app/globals.css` (توکن‌های CSS) + `src/lib/palette13.json` (پالت ۱۳×۵) + `tailwind.config.ts` (نگاشت) — قانون حاکم: **قانون ظاهر فاخر ۰۳۵-B (جلسهٔ ۰۳۳)**.

## ۹٫۱ — نظام رنگ: ۱۳ بخش × ۵ سایه

**۱۳ رنگ اختصاصی** (یک رنگ به ازای هر بخش/کاشی اصلی) با پنج سایهٔ **50 / 100 / 300 / 500 / 700** به‌علاوهٔ رنگ متن (`fg`). ویژگی‌های کلیدی:

- **تخصیص بهینه DP:** رنگ‌ها با الگوریتم برنامه‌نویسی پویا (بیت‌مَسک) روی چرخهٔ حداکثر-فاصله تخصیص یافتند؛ کمینهٔ فاصلهٔ hue = **۲۷٫۷°** که سقف ریاضی برای ۱۳ رنگ است (قید ≥۳۰° فقط با ≤۱۲ رنگ ممکن است — سند صادقانهٔ `honestNote` در `palette13.json:8`).
- **کنتراست WCAG AA:** همهٔ جفت‌های متنی الزامی ≥ ۴٫۵:۱ — با **کنتراست خودتنظیم** (اگر سایهٔ ۵۰۰ روی پس‌زمینه کم‌کنتراست شد، متن به سایهٔ ۷۰۰ یا رنگ روشن جابه‌جا می‌شود).
- **صفر رنگ خالص** (no `#FF0000`-style raw colors در کد؛ همه از توکن‌ها).
- **هارمونی فیلتر↔فهرست:** رنگ گزینهٔ فیلتر = رنگ همان مقدار در ستون فهرست؛ گارد عدم‌تکرار رنگ در `value-colors.ts`.

### جدول کامل پالت (از `src/lib/palette13.json`)

| # | کلید | بخش | hue° | 50 | 100 | 300 | 500 | 700 | fg |
|---|---|---|---|---|---|---|---|---|---|
| ۱ | `login` | صفحهٔ ورود | 304.6 | #f7f0ff | #eee2fe | #c2acdf | #8758b9 | #4f2e6f | #FAFBFC |
| ۲ | `home` | صفحهٔ هوم | 221.5 | #e2f8ff | #cceffb | #80c3da | #0084b0 | #004c6a | #0A0E1A |
| ۳ | `finder` | فایل‌یابی ملکا | 193.8 | #e1f9f8 | #caf1f0 | #7cc7c5 | #008c8c | #005152 | #0A0E1A |
| ۴ | `melka-listing` | آگهی ملکا | 110.8 | #f4f5e2 | #e9ebcd | #b9bc84 | #747500 | #424200 | #FAFBFC |
| ۵ | `melka-request` | درخواست ملکا | 27.7 | #ffeeea | #ffded9 | #e4a69d | #bb483f | #70231e | #FAFBFC |
| ۶ | `settings` | تنظیمات عمومی | 249.2 | #e7f5ff | #d4ebff | #92bce6 | #0c76c6 | #004378 | #FAFBFC |
| ۷ | `mgmt` | داشبورد مدیریتی | 83.1 | #fcf2e1 | #f5e6ca | #cfb480 | #9d6700 | #5d3900 | #FAFBFC |
| ۸ | `m1` | M1 آگهی ملک تبریز | 138.5 | #ebf8e8 | #dbefd5 | #a0c395 | #3b821e | #1b4b04 | #FAFBFC |
| ۹ | `m2` | M2 درخواست ملک تبریز | 55.4 | #fff0e4 | #fee2cf | #deab89 | #b35500 | #6b2c00 | #FAFBFC |
| ۱۰ | `m3` | M3 معاملات ملک تبریز | 0.0 | #ffedf3 | #ffdde7 | #e0a4b5 | #b5466f | #6d213f | #FAFBFC |
| ۱۱ | `m4` | M4 کارشناسان ملک تبریز | 166.2 | #e5f9f0 | #d0f1e2 | #88c7ad | #008d5e | #005233 | #0A0E1A |
| ۱۲ | `consultant` | صفحهٔ مشاور (ایجنت) | 332.3 | #feeefb | #f9dff4 | #d5a6cd | #a44c99 | #61265a | #FAFBFC |
| ۱۳ | `ai` | هوش مصنوعی/گزارش‌ها | 276.9 | #eff2ff | #e1e6ff | #abb4e8 | #5f67c9 | #34387a | #FAFBFC |

> کاشی‌های M5-M8 که پس از پالت ۱۳ اصلی افزوده شدند، توکن‌های موازی `sec-m5..m8` در `tailwind.config.ts:71-74` دارند (بنفش ارغوانی/لیمویی/آبی/فیروزه‌ای).

### تم روشن و تاریک

| توکن | روشن | تاریک |
|---|---|---|
| پس‌زمینهٔ صفحه | `#FAFBFC` | `#0F1419` |
| کارت | `#FFFFFF` | `#1A1F2E` |
| مرز | `#E5E7EB` | `#2D3446` |
| متن اصلی | `#0A0E1A` | `#FAFBFC` |
| متن فرعی | `#4B5563` | `#9CA3AF` |

- سه حالت تم: **روشن (پیش‌فرض) / تاریک / سیستم** (`prefers-color-scheme`) — سوییچ در تنظیمات عمومی.
- انتقال تم نرم ۳۰۰ms با کلاس `theme-transition` و احترام `prefers-reduced-motion` (`src/lib/theme-transition.ts`).
- دارک‌مود از کلاس Tailwind `darkMode: "class"` (`tailwind.config.ts:5`).

## ۹٫۲ — تایپوگرافی

| مورد | انتخاب |
|---|---|
| خانوادهٔ فونت | **وزیرمتن (Vazirmatn)** — بومی و خودمیزبان در `public/fonts/` (۴ وزن عربی/فارسی: 400/500/700/800 + ۳ وزن لاتین) |
| بارگذاری | `font-display: swap`؛ فقط woff2؛ بدون CDN خارجی |
| اندازهٔ بدنه | `text-sm` (۱۴px) برای متن جاری؛ `text-xs` (۱۲px) سلول‌های جدول (قانون فهرست) |
| عناوین | مقیاس: `text-2xl` عنوان کاشی · `text-lg` بخش · `text-sm font-bold` کارت |
| ارقام | **ارقام فارسی** همه‌جا (`faNumber`)؛ اعداد لاتین فقط در شناسهٔ فنی (BUILD_ID) |
| جهت | `dir="rtl"` و `lang="fa"` در ریشهٔ `layout.tsx` |

## ۹٫۳ — کامپوننت‌های مشترک (۱۵+)

| کامپوننت | مسیر | نقش |
|---|---|---|
| TileCard / TileShell | `components/app/` | کارت کاشی / پوستهٔ صفحهٔ کاشی (هدر+بازگشت+محتوا) |
| AppHeader | `components/app/` | هدر بخش با رنگ و آیکون همان بخش |
| SplashScreen | `components/app/SplashScreen.tsx` | اسپلش برند کم‌موج در بوت |
| BottomNav | `components/app/BottomNav.tsx` | ناوبری پایین ۵آیتمی: safe-area + رنگ بخش فعال + ARIA + هدف لمس ≥۴۴px |
| AgentPanel | `components/app/AgentPanel.tsx` | پنل بینش‌ها + بازخورد + سیاست ایجنت |
| KpiCard | `components/app/shared/kpi-card.tsx` | شاخص عددی با برچسب و رنگ |
| CoverageTable | `components/app/shared/coverage-table.tsx` | جدول پوشش ستون‌ها |
| TopRankingTable | `components/app/shared/top-ranking-table.tsx` | جدول Top-N استاندارد |
| ListStates | `components/app/shared/list-states.tsx` | Skeleton / Empty / Error / Offline طراحی‌شده مشترک |
| DataSource | `components/app/shared/data-source.tsx` | برچسب «منبع داده + آخرین بروزرسانی» |
| StepReportList | `components/app/shared/step-report-list.tsx` | گزارش گام‌های همگام‌سازی |
| JalaliDatePicker | `components/ui/jalali-date-picker.tsx` | تقویم ماهانهٔ RTL شنبه‌محور + «امروز» |
| BottomSheet | `components/ui/bottom-sheet.tsx` | کشوی پایینی (vaul) — فایل مناطق و... |
| Table (primitives) | `components/ui/table.tsx` | قانون‌ساز فهرست‌ها + `TableBodyVirtual` |
| InstallButton / OfflineBadge / VersionBadge / ConnectionIndicators | `components/app/` | اجزای PWA وضعیت |
| OpenInNewTabButton | `components/app/` | باز کردن کاشی در تب جدید |

## ۹٫۴ — انیمیشن‌ها و تعامل

- **Ripple لمسی** روی همهٔ دکمه‌ها/کارت‌ها (CSS `active:scale-[0.98]` + ripple class).
- **Haptic** (`src/lib/haptics.ts`): بازخورد لرزشی با گارد `navigator.vibrate` — خاموش روی دستگاه‌های بدون پشتیبانی.
- **Pull-to-Refresh** در چهار فهرست M1-M4 (`use-pull-to-refresh.tsx`).
- **framer-motion** برای Splash/انتقال‌ها با `MotionConfig reducedMotion="user"`.
- **CLS ≤ ۰٫۱:** چیدمان‌های ثابت پیش از داده (Skeleton هم‌هندسهٔ محتوا) — سنجش Lighthouse: CLS=۰٫۰۰۱.

## ۹٫۵ — Safe Area و موبایل‌اولی

- `viewport-fit=cover` + `env(safe-area-inset-*)` در BottomNav و BottomSheet و هدر.
- نقطهٔ شکست: `<768px` موبایل (`use-mobile.ts`) — گرید فیلتر ۲ ستونه، آکاردئون فیلترها، جدول با اسکرول افقی و سرستون sticky.

## ۹٫۶ — دسترس‌پذیری (WCAG AA)

- کنتراست ≥۴٫۵:۱ همهٔ جفت‌های متنی (سنجش خودکار در تولید پالت).
- حلقهٔ فوکوس واضح روی همهٔ عناصر تعاملی؛ ترتیب منطقی تب.
- آیکون‌ها `aria-hidden`؛ جدول‌ها با `caption/aria`؛ ناوبری با `role/aria-current`.
- Lighthouse Accessibility = **۱۰۰** (شاهد P6549 — بیلد production).

## ۹٫۷ — PWA — متن کامل Manifest

```json
{{FILE:public/manifest.json}}
```

**نکات کلیدی manifest:** نام رسمی «اکوسیستم هوشمند ملک ایران (ملکا)» · `dir: rtl`, `lang: fa` · `display: standalone`, `orientation: portrait-primary` · آیکون any+maskable در ۱۹۲/۵۱۲ · ۳ میان‌بر (M1/M2/M3 با `?tile=`) · ۲ اسکرین‌شات واقعی (narrow 412×915 + wide 1280×800).

## ۹٫۹ — متن کامل پالت (`src/lib/palette13.json`)

> عین فایل — شامل متادیتای تولید (الگوریتم DP، فاصلهٔ hue، قاعدهٔ کنتراست، یادداشت صادقانهٔ سقف ریاضی ۱۳ رنگ) و همهٔ ۱۳ بخش با پنج سایه + رنگ متن.

```json
{{FILE:src/lib/palette13.json}}
```

## ۹٫۸ — Service Worker (استراتژی کش)

- نسخهٔ فعال: **`public/sw-v5.js`** (نسخه‌های قبلی sw.js/sw-v3/sw-v4 برای سازگاری حاضرند).
- استراتژی: **App Shell پیش‌کش** (shell دقیق با نسخه‌بندی) + **Network-first برای API** با fallback به کش آفلاین + **stale-while-revalidate برای asset های ایستا**.
- **بنر آپدیت پیام‌محور:** پیام SW جدید → بنر «نسخهٔ تازه آماده است» با دکمهٔ تازه‌سازی (نه reload ناگهانی) — `SwRegister.tsx`.
- حالت آفلاین: نشانگر `OfflineBadge` + صفحهٔ آفلاین طراحی‌شده در `list-states.tsx`.
- دکمهٔ نصب غیرمزاحم: `InstallButton` فقط وقتی `beforeinstallprompt` واقعی رخ دهد.

## ۹٫۱۰ — سند ریشهٔ سیستم طراحی (DESIGN-SYSTEM.md)

> عین سند ریشهٔ پروژه (که در بستهٔ سورس هم همراه است):

```markdown
{{FILE:DESIGN-SYSTEM.md}}
```
