# PN-050 — گزارش نهایی پذیرش (DIR-PN050-001 · اجرا کامل: هر ۷ دستور)

تاریخ گلوبال: ۲۰۲۶-۱۰-۲۷ · HEAD: a43c2a0 · سرو = HEAD (G3 ✓)

## معیارهای پذیرش دستورها

| دستور | معیار | شاهد | حکم |
|---|---|---|---|
| ۱ — UNION | live=3, rolling=5 → live=5 · live={A,B,C,D}∪{A,B,E,F}={A,B,C,D,E,F} · صفر حذف | tests/pn050/union-merge.test.ts (۷/۷) + تمرین واقعی ۳۲,۸۵۱→۳۳,۴۴۴ (+۵۹۳ · audit resurrect_union) | ✅ |
| ۲ — provenance | migrate موفق · فیلدها در schema · صفر رکورد از دست‌رفته | migration.sql (۱۰ ستون+۴ ایندکس) · ۳۳,۴۴۴/۲۹,۸۷۹ ثابت · بکاپ گرم SHA256 5942822… | ✅ |
| ۳ — قانون متخصص | ۵/۵ تست: null رد · enrichment قبول · متخصص 0.90>ARM 0.95 قبول · قدیمی رد · تعارض→confidence | merge-law.test.ts + سناریوی B DB واقعی (گام ۱-۷) + ۳ expert_override واقعی در production (field=rawOwnerName · صفر PII در audit) | ✅ |
| ۴ — پنل تغییرات | تغییرات ۲۴h قابل مشاهده · بازگردانی کار می‌کند · badge به‌روز · audit هر revert | /dashboard/melketun/changes زنده (badge پس از سینک Worker فعال) · مرورگر-آزمایی + اسکرین‌شات · revert با audit در تست DB (manual_revert) | ✅ |
| ۵ — WAL/Journal | .db-wal بلافاصله خالی · kill وسط batch → replay | PROD journal_mode=wal · checkpoint TRUNCATE (log=0 شاهد) · journal-replay.test.ts (۶/۶ — سناریوی D) | ✅ |
| ۶ — تست نهایی | ۴ سناریو پاس · هیچ رکورد گم · audit کامل | ۴۸ تست pn050 سبز + ۳۰۲۴/۳۰۳۹ کل (۹۹.۵۱٪) | ✅ |
| ۷ — تثبیت‌بقا‌لینک | tests ≥۹۵٪ · build=HEAD · push · evidence SHA256 | ۹۹.۵۱٪ · سرو a43c2a0=HEAD · پوش آینه در هر گام · SHA256SUMS همین بسته | ✅ |

## خطوط قرمز (همگی محترم)

- بازگشت به MAX: خیر — بخش ۳ resurrect کاملاً UNION (کاهش شمارش = توقف)
- حذف رکورد live بدون audit: خیر — صفر DELETE در merge_union.py
- null روی پر: خیر — قانون الف + گارد G1/G2 + revert هم 409 می‌دهد
- رد متخصص به‌خاطر confidence پایین‌تر: خیر — قاعدهٔ ب قبل از ج
- deploy بدون build=HEAD: خیر — گیت G3 زنده سبز
- پوش بدون SHA256: خیر — SHA256SUMS همراه بسته
- تغییر DB بدون بکاپ گرم: خیر — بکاپ ۹۲۵MB با SHA256 ثبت در migration_label.json
- PII خام در log: خیر — audit فقط نام فیلد/شناسه (تست قانون ۱۰ سبز)

## محدودیت‌های صادقانه

- ossfs در این جلسه بیمار بود (بازکردن فایل ۱۵–۲۵ ثانیه) → UNION هر منبع با timeout مستقل ۲۴۰s و skip صادقانه؛ اتحاد در رستاخیز بعدی ادامه می‌یابد.
- ۱۵ شکست باقی‌ماندهٔ مجموعهٔ کامل همگی محیطی/قدیمی‌اند (APK/env.platform پاک‌شده در ریست‌ها · probe timeout) — مستند در PN-058 و همین جلسه.
- fieldChanges سقف ۱۰۰ مدخل (نمایش)؛ AuditLog رویدادهای حساس را کامل نگه می‌دارد.
- سینک زندهٔ دستی در این نشست روی کندی CRM گیر کرد؛ سینک زمان‌بندی‌شدهٔ Worker همان شب اجرا شد و کل زنجیره را زنده اثبات کرد.

## تحویل‌دادنی‌ها (D-01..D-08)

- D-00 ADR کامل معماری — docs/adr/ADR-PN-050-union-resurrect-expert-law.md
- D-01 scripts/pn050/merge_union.py + بخش ۳ بازنویسی‌شدهٔ resurrect-ultimate.sh
- D-02 prisma/migrations/20261027_pn050_add_provenance/ (SQL + label با SHA256 بکاپ)
- D-03 src/lib/merge.ts (قانون برتری متخصص — ۶۳۷ سطر)
- D-04 پنل /dashboard/melketun/changes + سه API + سرویس RecordsChanges + badge
- D-05 src/lib/journal.ts (intent/committed/replay)
- D-06 tests/pn050/ (۴ فایل · ۴۸ تست · ۱۵۵+ expect)
- D-07 worklog.md — ردیف PN-050 با شاهد کامل
- D-08 SHA256SUMS — همین بسته
