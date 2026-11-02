# قانون دادهٔ مقدس — Sacred Data Guard (PN-038 · شورا-ن۰۶۳)

> سند رسمی: ملکا-شورا-ن۰۶۳-نهایی-۱۴۰۵ · جلسهٔ ۰۶۳ · تاریخ ۱۴۰۵/۰۷/۲۷
> سطح: بحرانی · راهبردی

## ۱. ریشهٔ حادثه

تشخیص مالک (**درست بود**): «در ریست سرور GLM این اتفاق می‌افتد» — وقتی پلتفرم
ابری (Alibaba) کانتینر را ریست می‌کند، دو عامل هم‌زمان داده را تهدید می‌کردند:

1. **عامل زیرساختی**: اسکریپت‌های بازیابی (`restore.sh` / `recovery-guard.sh` /
   `p6549-recovery.sh`) دیتابیس زنده را با بکاپ قدیمیِ بستهٔ بقا جایگزین
   می‌کردند (`cp -a package/custom.db db/custom.db`) — دادهٔ تازه‌تر بلعیده می‌شد.
2. **عامل نرم‌افزاری**: مسیر legacy همگام‌سازی (`syncMode()=legacy`) شش جدول
   کش CRM را `deleteMany` + `createMany` می‌کرد — اگر درج‌های بعدی ناقص
   می‌شدند، جدول خالی می‌ماند. روت «ریست اتصال» نیز همین الگو را داشت
   (حادثهٔ P6527: ۷۳۹ معامله + ۲۹۱ کارشناس در یک کلیک از دست رفت).

## ۲. راهکار سه‌لایه

| لایه | سازوکار | فایل |
|------|---------|------|
| ۱. تایم‌استمپ گارد | پیش از هر جایگزینی DB، داوری mtime + شمارش ردیف + سلامت؛ زندهٔ پرتر/جدیدتر = BLOCK | `scripts/recovery/sacred-data-guard.ts` |
| ۲. حذف پاک‌سازی (Zero-Delete) | مسیر legacy سینک حذف شد؛ فقط upsert افزودنی؛ ریست = بازسازی روی داده | `src/lib/melk-api/sync.ts` + `sync-mode.ts` |
| ۳. بکاپ پیوسته | هر ۱۵ دقیقه `VACUUM INTO` اتمی + مانیفست شمارش + هرس ۴ نسلی | `src/core/runtime/jobs.ts` (`sacred-backup`) |

## ۳. داوری گارد مقدس (sacred-data-guard.ts)

- **exit 0 (ALLOW)**: نامزد تازه‌تر/برابر است — جایگزینی مجاز.
- **exit 2 (BLOCK)**: زنده مقدس است (پرتر روی هر جدول شاهد، یا جدیدتر با
  نوشته‌های بی‌شاهد) — جایگزینی ممنوع، زنده می‌ماند.
- **exit 1 (ERROR)**: خطای اجرا — محافظه‌کارانه: زنده حفظ می‌شود.
- Env: `SACRED_DATA_GUARD=disabled` (خاموشی)، `SACRED_GUARD_OVERRIDE=1`
  (نادیده‌گیری داوطلبانه با ثبت شاهد کامل)، `MELK_SACRED_GRACE_SECONDS`
  (پیش‌فرض ۳۶۰۰ — VACUUM/بکاپ خودشان mtime را تازه می‌کنند؛ دلتای زیر آستانه
  به‌تنهایی داوری نمی‌کند؛ داور اصلی شمارش ردیف است).
- شاهد: `upload/.runtime/sacred-data-guard.json` + لاگ `upload/.survival/recovery-log.jsonl`.

جدول‌های شاهد شمارش: `PropertyRecord` · `RequestRecord` · `TransactionRecord` ·
`ExpertRecord` · `GraphNode`.

## ۴. نقاط اتصال (۴ مسیر)

| نقطه | رفتار |
|------|-------|
| `scripts/recovery-034/restore.sh` (گام ۴) | BLOCK ⇒ جایگزینی DB رد می‌شود؛ فقط کد بازیابی می‌شود؛ زنده در بکاپ موقت نگه داشته می‌شود |
| `scripts/pn005c/recovery-guard.sh` (گام ۵) | BLOCK ⇒ DB و WAL/SHM دست‌نخورده می‌مانند؛ expected-counts از زنده تازه می‌شود |
| `scripts/p6549-recovery.sh` (گام ۵) | BLOCK ⇒ زنده حفظ می‌شود |
| `scripts/recovery/auto-recovery.sh` (`do_recover`) | گارد پیش از بازیابی صدا زده می‌شود + لاگ BLOCK؛ `reset-guard.sh` شاهد مقدس پس از بازگردانی درخت ثبت می‌کند |

## ۵. قانون صفر-حذف در سینک

- `syncMode()` همیشه `incremental` — مقدار `legacy` بی‌اثر (پارامتر حفظ شد).
- `sweepFamilyStale` فقط **گزارش** ردیف‌های محوشده می‌دهد (`sacred-stale-report`)
  و هرگز حذف نمی‌کند (`sacredNoDelete`).
- `clearCrmCacheTables` = `mode: "sacred-keep"` — بکاپ شاهد + داده سر جای خود؛
  سینک مجدد با upsert روی همان داده.
- مستثنای مجاز: `relay-jobs.ts` (پاکسازی TTL کارهای گذرای صف — داده نیست).

## ۶. گارد و بست

- **گارد**: `scripts/audit-data-sacred.sh` (۶ وارسی — عضو جدید مجموعهٔ گاردها).
- **کار Worker**: `sacred-backup` — هر ۱۵ دقیقه (env: `MELK_SACRED_BACKUP_INTERVAL_MINUTES`،
  خاموشی: `MELK_SACRED_BACKUP=disabled`، نگهداری: `MELK_SACRED_BACKUP_KEEP=4`).
- **شاهد چرخهٔ بکاپ**: `upload/.runtime/sacred-backups.json` + `AuditLog(action=SACRED_BACKUP)`.

## ۷. جملهٔ شورا

> «داده‌های شما از این پس در قلعه‌ای محافظت‌شده قرار می‌گیرند؛ ریست سرور
> هرگز نمی‌تواند آن‌ها را از بین ببرد.»
