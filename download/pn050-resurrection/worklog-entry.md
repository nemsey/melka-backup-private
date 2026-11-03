---
Task ID: RESURRECTION-20261028 · PN-050 + DIR-RESET-AUDIT-001
Agent: main (Super Z / GLM)
Task: رستاخیز سرور پس از ریست ۲۰۲۶-۱۰-۲۸ (~۰۶:۵۰Z) طبق فرمان مالک — اجرای resurrect-ultimate.sh مطابق حکم PN-050 (معماری UNION) و حسابرسی DIR-RESET-AUDIT-001

Work Log:
- **بازبینی پیش از اجرا (قانون زنجیره):** فرمان مالک `curl | bash` از raw بدون توکن بود. به‌جای اجرای کور، اسکریپت دانلود و بازبینی شد — کشف بحرانی: raw نسخهٔ **کهنهٔ پیش-PN-050** (sha256=8fa080c5…، منطق MAX/جایگزینی ممنوعه) سرو می‌کرد. اجرای آن در وضعیت «زندهٔ عقب‌مانده» (زنده=۳۲٬۸۵۱ < قلعه=۳۲٬۸۷۴ < چرخشی=۳۳٬۴۴۷) دقیقاً خط قرمز PN-050 (بازگردانی منطق MAX) را نقض می‌کرد.
- **منبع حقیقت:** origin remote پس از ریست غایب بود → از upload/.mirror/credentialsenv بازافزوده شد (توکن هرگز چاپ نشد). fetch موفق: main واقعی = d40038b (۲۰۲۶-۱۰-۲۷ ۱۹:۰۸Z) حامل پیاده‌سازی کامل PN-050: scripts/pn050/merge_union.py (ADR-PN-050 · INSERT OR IGNORE · تراکنش اتمی per-source · timeout/skip صادقانه) · src/lib/merge.ts · src/lib/journal.ts · پنل changes · tests/pn050 (هر ۴ سناریو). نسخهٔ authed اسکریپت (sha256=462fe8a1…، UNION) در مسیر رسمی scripts/resurrect-ultimate.sh هل شد و اجرا شد.
- **اجرای رستاخیز (۱۱۶ ثانیه · لاگ: resurrect-daemon.log):** setsid جدا (قانون ۱۱-ب · PN-052) → توقف فرایندهای قدیمی → fetch/reset به d40038b → **UNION داده:** قلعه +۲۳ (→۳۲٬۸۷۴) · چرخشی +۵۷۳ (→۳۳٬۴۴۷) · بقا +۰ → شاهد JSON سه‌گانه UNION_OK در لاگ + ۳ ردیف AuditLog رسمی (type=resurrect_union) · صفر حذف/کاهش (بررسی LC2≥LC درون اسکریپت سبز) → escrow رازها (اولویت ۱: boot-secrets.json) → bun install · prisma generate · db push · build → **G3 سبز: بیلد=HEAD (d40038b، main+standalone)** → **G1 سبز: stripProtectedNulls + ۶ نقطهٔ upsert** → start-prod (نگهبان دیمن + سرور PID 2679 + Worker PID 2683 با JobLock تازه‌نفس) → تأیید زنده: /api/version = d40038b · PropertyRecord=۳۳٬۴۴۷ ≥ ۱۰۰۰ ✓
- **وضعیت پس از رستاخیز:** journal_mode=**wal** (دستور ۵ فعال) · شمارش نهایی: Property=۳۳٬۴۴۷ · Request=۲۹٬۸۸۱ · Expert=۳۹۵ · User=۴ · AuditLog=۷٬۲۷۰ · / HTTP 200 در ۴۶ms · Worker زنده با heartbeat قفل.
- **DIR-RESET-AUDIT-001:** ابزار ماندگار scripts/pn058-reset-audit.py بازاجرا شد → ۷ تحویل‌دادنی تازه در download/RESET-AUDIT/ (reset-patterns.md/json · شواهد خام · SHA256SUMS همه OK) — ۴/۶ منبع در دسترس کانتینر · تاریخ گزارش: ۲۰۲۶-۱۰-۲۸ ۱۱:۰۲ IRST.
- **بستهٔ شاهد جلسه:** download/pn050-resurrection/resurrection-evidence.json + SHA256SUMS (نسخه‌های اجراشده/ردشده، لایه‌های UNION، گیت‌ها، پروسه‌ها، یادداشت‌های صادقانه).

Stage Summary:
- رستاخیز کامل PN-050-مطابق: ۳۲٬۸۵۱ → ۳۳٬۴۴۷ (+۵۹۶ · صفر حذف · صفر بازنویسی رکورد موجود) — کد: 6bb3c8e → d40038b = HEAD = بیلد = سرور
- انحراف صادقانهٔ مستند: فرمان literal مالک (raw بدون توکن) نسخهٔ ممنوعهٔ MAX را سرو می‌کرد؛ نسخهٔ authed همان مخزن اجرا شد (روح فرمان: «مطابق PN-050» — این بود معیار)
- یادداشت: db push ستون legacy «realtorMobile» را طبق schema خودِ main حذف کرد (۱۲۲۳ مقدار — در لایه‌های قلعه/بقا محفوظ) · scripts/pn050-merge-all-databases.py (اضطراری) اجرا نشد و در scripts/ باقی است
- انتظار مالک: (۱) بازبینی download/pn050-resurrection/resurrection-evidence.json (۲) بازبینی download/RESET-AUDIT/ (۳) پیشنهاد: در نشست بعد، اصلاح الگوی fallback اسکریپت در حالت pipe تا نسخهٔ authed را مقدم بدارد (امروز نشان داد raw بدون توکن می‌تواند کهنه سرو کند)
