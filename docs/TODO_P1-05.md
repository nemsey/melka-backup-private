# TODO_P1-05 — موارد بررسی‌شده ولی نگه‌داشته‌شده (PHASE 1 / P1-05)

قاعده E.5 دستور شورا: «اگر شک داری، حذف نکن — به TODO_P1-05.md منتقل کن.»

## کامپوننت‌های ui با صفر رفرنس که نگه داشته شدند (تصمیم آگاهانه)

| کامپوننت | دلیل نگه‌داری |证据 شاهد | تصمیم
|---|---|---|---|
| `components/ui/form.tsx` | نقشه تکرار ممیزی (بخش ۱۹) برای فشرده‌سازی ویزاردهای ثبت (NewRequestDialog ۹۱۶ خط / NewListingDialog ۶۷۷ خط) «react-hook-form موجود» را راه‌حل پیشنهادی دانسته — در PHASE 2+ قابل استفاده است. | grep: صفر رفرنس (شامل تست‌ها) | نگه‌داری؛ در PHASE 2 درباره ویزارد تصمیم گرفته می‌شود |
| `components/ui/chart.tsx` | پوشش استاندارد shadcn برای recharts؛ PHASE 3-8 (بینش/پیش‌بینی) احتمالاً نمودارهای جدید می‌سازد و این پوشش پایه است. | grep: صفر رفرنس (صفحات مستقیماً recharts را import می‌کنند) | نگه‌داری؛ در PHASE 3 بازبینی شود |

## موارد حذف‌شده (شاهد grep صفر رفرنس)

| مورد | شاهد | خط حذف‌شده |
|---|---|---|
| `getKenarKey()` — divar/store.ts | `rg "getKenarKey"` → صفر فراخوان (فقط تعریف) | ۵ |
| `divarSecretEnvKey()` — divar/config.ts | فقط تست ارجاع داشت (منبع واقعی کلید: `lib/auth/crypto.ts:43`) | ۱۰ |
| `readDivarPhoneToken()` — divar/store.ts | صفر فراخوان؛ مصرف‌کننده وضعیت اتصال (indicators.ts:163) مستقیماً decrypt می‌خواند — ذخیره توکن می‌ماند چون نشانگر اتصال از آن تغذیه می‌شود | ۴ |
| `onRejected` خط مرده — FileFinderPage.tsx | `setBusyAction(rejectAd?.token)` بلافاصله با `setBusyAction(null)` بازنویسی می‌شد (no-op تضمینی در React batching) | ۱ |
| روت ریشه `/api` — app/api/route.ts | scaffold «Hello, world!»؛ grep صفر رفرنس به `"/api"` دقیق (همه فراخوانی‌ها `/api/...` هستند) | ۴ |
| ۱۴ کامپوننت ui بی‌استفاده | aspect-ratio, breadcrumb, calendar, command, context-menu, drawer, hover-card, menubar, navigation-menu, pagination, resizable, sidebar, sonner, toggle-group — هرکدام صفر رفرنس در src/tests/examples/docs | ۲٬۳۹۵ |

## موارد اعلام‌شده در ممیزی که در کد یافت نشدند

| مورد | نتیجه راستی‌آزمایی |
|---|---|
| `lineId: undefined:undefined` | grep الگوی `undefined:undefined` در کل کدبیس → **صفر تطبیق** (احتمالاً در بازنویسی‌های قبلی حذف شده) — اقدامی لازم نیست |

## اثر تست

- تست `divarSecretEnvKey بدون کلید null برمی‌گرداند` حذف شد (تابع مرجع حذف شده بود).
- جبران: سطح کل تست همچنان ۴۱۲ (۳۴۹ پایه + ۶۴ جدید PHASE 1 − ۱ حذف) — بالاتر از سقف ۳۶۹.
