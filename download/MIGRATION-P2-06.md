# MIGRATION-P2-06 — متادیتای نسخه سیاست (فقط افزودنی)

> سند مهاجرت PHASE 2 / گام P2-06 — شاهد پشتیبان‌گیری/بازیابی طبق بند E.6

## ۱) طبیعت مهاجرت

- **فقط افزودنی (additive)**: ۸ ستون جدید به `AgentPolicyVersion`؛ هیچ ستون موجودی حذف/تغییر نوع/تغییر نام نشد
- **غیرمخرب**: `prisma db push` (بدون migration مخرب)؛ بازگشت با حذف ستون‌ها یا بازیابی بکاپ
- **صفر استفاده در PHASE 2**: ستون‌ها ساخته و برگشت داده می‌شوند؛ هیچ مسیر کدی نمی‌خواند/نمی‌نویسد (گواهی: تست سطح سورس + grep سراسری)

## ۲) ستون‌های جدید

| ستون | نوع | پیش‌فرض | مصرف آینده |
|---|---|---|---|
| `modelVersion` | String? | — | نسخه مدل یادگیری سازنده سیاست (PHASE 6) |
| `featureVersion` | String? | — | نسخه مجموعه ویژگی‌ها (PHASE 5) |
| `trainingWindow` | String? | — | پنجره آموزش ISO 8601 (مثل "P90D") |
| `evaluationWindow` | String? | — | پنجره ارزیابی ISO 8601 |
| `metricsJson` | String? | — | سنجه‌های ارزیابی نسخه (JSON) |
| `createdBy` | String? | — | کد پرسنلی سازنده |
| `approvedBy` | String? | — | کد پرسنلی تأییدکننده (گردش کار PHASE 9) |
| `status` | String? | `"active"` | چرخه عمر: active/retired/draft/archived |
| `rollbackTarget` | Int? | — | نسخه فعال‌شونده در صورت لغو |

## ۳) اصل دو‌راهه (Dual-Track)

- ستون قدیمی **`active: Boolean` حذف نشد** — منطق یادگیری PHASE 2 (ensurePolicy/rollbackPolicy/reviewPolicyIfNeeded + PolicyRepository.findActive/activateVersion) عین قبل فقط با `active` کار می‌کند
- `status` مسیر آینده است (PHASE 9 آن را منبع حقیقت می‌کند و `active` را بازنشسته)
- قاعده نگاشت: `active=true ⇒ status="active"` | `active=false ⇒ status="retired"`

## ۴) اجرا و شاهد (Witness)

### پشتیبان‌گیری (پیش از هر تغییر)
```
db/custom.db            →  db/custom.backup-pre-p206.db   (پیش از db push)
(بکاپ مرحله‌ای قبلی:    →  db/custom.backup-pre-p204.db   از P2-04)
```

### اعمال اسکیما
```
bunx prisma db push --skip-generate  →  custom.db      "in sync" (25ms)
DATABASE_URL=…test.db        db push  →  "in sync"
DATABASE_URL=…test-repository.db push →  "in sync"
bunx prisma generate                  →  کلاینت بازتولید
```

### backfill — نکته صادقانه
`db push` ستون `status` را با DEFAULT 'active' ساخت ⇒ **همه ۲۰ ردیف تولید ابتدا "active" گرفتند** (حتی ۷ ردیف غیرفعال). اسکریپت اصلاحی نهایی (idempotent) بر هر سه پایگاه اجرا شد:
```
custom.db:          total=20  set-active=13  set-retired=7   mismatch-after=0
test.db:            total=6   set-active=2   set-retired=4   mismatch-after=0
test-repository.db: total=0   (خالی)                          mismatch-after=0
```

### بازیابی (Rollback) — در صورت لزوم
1. **بازیابی کامل داده**: `cp db/custom.backup-pre-p206.db db/custom.db` (پیش از backfill؛ ستون‌ها با db push دوباره ساخته می‌شوند و backfill اصلاحی تکرار می‌گردد)
2. **حذف ستون‌ها (اگر PHASE 2 لغو شود)**: از این ستون‌ها در هیچ کد محصول استفاده نمی‌شود؛ حذف با `prisma db push` پس از برداشتن از schema بدون هیچ اثر رفتاری است
3. **صفر آسیب منطقی**: مسیر یادگیری `active` را می‌خواند؛ ستون‌های جدید نوشته نمی‌شوند

## ۵) پوشش تست (tests/phase2-policy-meta.test.ts — ۶ تست سبز)

۱. ساختار: create بدون ستون‌های جدید موفق؛ همه nullable؛ status پیش‌فرض "active"؛ active سالم
۲. create با متادیتای کامل (شبیه‌سازی PHASE 6/9) پذیرفته
۳. قاعده backfill (idempotent) روی ردیف‌های واقعی
۴. PolicyRepository.findActive (مسیر واقعی ایجنت‌ها) همچنان روی active قدیمی
۵. صفر ناهماهنگی active/status پس از backfill
۶. سطح سورس: base-agent هیچ نام ستون جدید را ندارد

## ۶) وضعیت نهایی

- تست کل: **522/522 سبز** (۶ جدید)؛ tsc صفر؛ regression-guard سبز
- صفر تغییر رفتاری؛ صفر Feature؛ صفر Migration مخرب
