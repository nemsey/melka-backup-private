# گزارش حسن فراژرف — PN-053 (گام اول: Audit Phase)

> شناسه: DIR-PN053-OPTIMIZE · تاریخ: ۱۴۰۵/۰۸/۱۷ (۲۰۲۶-۱۱-۰۸ ۰۷:۱۰Z) · ابزار: `scripts/pn053/audit-deadcode.py` (بستار ارجاعی)
> معیار پایه (baseline) پیش از هر تغییری ثبت شد — همهٔ ارقام زیر قابل بازتولیدند.

---

## ۱-۱. کد مرده و زواید

### اسکریپت‌های مرده (Dead Scripts)
| سنجه | مقدار |
|---|---|
| کل فایل‌های scripts/ | ۸۵۴ |
| زنده (در بستار ارجاعی از src/tests/واچ‌داگ/بیلد/رستاخیز) | ۲۴۲ |
| **مرده (نامزد حذف)** | **۶۱۲ فایل · ۲٫۴MB · ۴۷٬۷۸۸ LOC** |
| LOC زندهٔ باقیمانده | ۲۶٬۰۸۱ |

روش: بستار ارجاعی از ریشه‌های قطعیِ حیات — `prod-watchdog.sh`، `start-prod.sh`، `build-with-parking.sh`، `resurrect-ultimate.sh`، `scripts/recovery/**`، `scripts/mirror/**`، `scripts/runtime/**`، پوشه‌های ارجاع‌شده از tests (pn008/pn012/pn041/pn048/…)، `package.json`، `.zscripts/`، `.github/` و کانفیگ‌های ریشه. هر فایل خارج از بستار = یک‌بارمصرف جلسات گذشته (p6*/p65*/pn0XX قدیمی، analyze_*.py، extract_*.py و…).

فهرست کامل ماشین‌خوان: `download/PN-053/audit-deadcode.json`

### پکیج‌های بلااستفاده
| پکیج | حکم | دلیل |
|---|---|---|
| `embedded-postgres` + `@embedded-postgres/linux-x64` | **حذف** | پروژه SQLite است (ENGINE: sqlite-only در کل کد)؛ کاوش PG آرشیو شده؛ ۶۰MB باینری |
| `@types/pg` | **حذف** | صفر import از ماژول `pg` در کل کد زنده |
| `sharp` + `@img/sharp-linux-x64` | **حذف** | صفر `next/image`، صفر `images` در next.config، صفر import در src/tests — ۳۳MB |
| `prisma`, `eslint`, `@types/react*`, `bun-types`, `tailwind*`, `tw-animate-css`, `@tailwindcss/postcss` | نگه‌داری | مثبت کاذب — مصرف CLI/کانفیگ/ضمنی (postcss.config.mjs، tailwind.config.ts، tsconfig، bun globals) |
| `qrcode`/`@types/qrcode` | نگه‌داری | استفادهٔ زنده در `src/app/api/admin/relay/qr/route.ts` |

### کاوش مردهٔ PostgreSQL
- `scripts/pg-migrate/` (۳ فایل TS) + `scripts/audit-postgres-compat.sh` — مرده؛ تنها ارجاع: `tests/pn022-infra.test.ts` که «وجود فایل» را چک می‌کند (شاهد صرف، نه کارکرد). با حذف، تست به‌روز می‌شود.
- `src/sync/legacy/` — فقط README.md (۸KB)؛ کد قبلاً در PN-051 آرشیو شده بود. README به docs منتقل و پوشه حذف می‌شود.

## ۱-۲. حافظه (RAM)

| سنجه | مقدار | تحلیل |
|---|---|---|
| RAM کل | ۴٬۰۴۱MB | — |
| سرور idle | ۲۰۴–۳۵۲MB | رشد پایدار زیر ترافیک relay (قلهٔ مشاهده‌شده ۱٬۳۵۱MB / VmHWM ۲.۱GB) — نشتی نیست، رشد heap تا GC؛ درمان: سقف heap |
| ورکر idle | ۱۲۸–۱۷۴MB | پایدار |
| mmap دیتابیس در RSS | ۳.۹MB (اندازه‌گیری smaps) | پراگمای mmap_size=256MB صرفاً آدرس‌فضاست — دست نمی‌خورد |
| Prisma connection_limit | **۱ (از قبل)** | از قبل بهینه — پروژه اتصال یگانه دارد؛ نیاز به کاهش به ۵ ندارد (۱ < ۵) |
| کش IndexedDB | سمت مرورگر | خارج از حیطهٔ سرور |

## ۱-۳. گلوگاه‌های CPU استارتاپ

| مورد | وضعیت | درمان PN-053 |
|---|---|---|
| rebuild واچ‌داگ (chunk-guard/G3) | بدون اولویت — با nice=0 رقابت می‌کند | `nice -n 19` روی هر دو مسیر rebuild |
| بکاپ چرخشی (VACUUM ۵۳۶MB) | ۱۵ ثانیه پس از بوت | تأخیر به ۶۰s (استگر) |
| بکاپ مقدس (VACUUM ۵۳۶MB) | ۳۰ ثانیه پس از بوت | تأخیر به ۱۲۰s (استگر) |
| LCPP | concurrency=3 از ثانیهٔ ۹۰ | نخستین چرخه با concurrency=1 (سازوکار env/تابع) |
| prewarm هوش | ۲۰s پس از بوت | نگه‌داری (ویژگی UX — ۱۶ موتور گرم) |
| استگر کلی کارهای ورکر | از قبل تدریجی (۱۵s تا ۱۰m) | تقویت دو مورد سنگین فوق |

## کشف ویژه — ۹۰۲MB کپی زائد در هر بیلد

`.next/standalone/.git` = **۹۰۲MB** — file-tracing نکست کل `.git` را داخل بستهٔ standalone کپی می‌کند. اثبات زائدبودن: `api/version` و همهٔ گاردها گیت را از `MELKA_REPO_DIR=/home/z/my-project` (ریشهٔ اصلی) می‌خوانند، نه از standalone. درمان: افزودن `./.git/**` به `outputFileTracingExcludes` → کاهش .next از ۱.۲GB به ~۳۰۰MB (**۷۵٪**) + هر بیلد ~۹۰۰MB IO کمتر.

## جمع‌بندی نامزدهای اجرا (گام ۲)

1. حذف ۶۱۲ اسکریپت مرده (git rm — تاریخچه در گیت محفوظ)
2. حذف pg-migrate + audit-postgres-compat.sh + به‌روزرسانی تست pn022
3. `bun remove embedded-postgres @types/pg sharp` (~۹۳MB از node_modules)
4. `./.git/**` در outputFileTracingExcludes (−۹۰۰MB از .next)
5. `--smol` روی سرور (واچ‌داگ) و ورکر (supervisor) — سقف رشد heap
6. استگر بکاپ‌ها + nice روی rebuild ها + LCPP concurrency=1 در نخستین چرخه
7. پاک‌سازی لاگ‌های >۷ روز در log-rotate.sh
