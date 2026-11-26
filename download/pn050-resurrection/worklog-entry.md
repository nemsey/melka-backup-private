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

---

Task ID: DIR-OWNER-4STEPS-001 (دستور چهارسگامی مالک ۱۴۰۵/۰۹/۰۵ · ۲۰۲۶-۱۱-۲۶)
preview_build_id: 83e5e5b-20261126-0842 (گارد تازگی نهایی: PASS — buildId=gitSha=live=edge · پس از هر کامیت مستندات، بیلد پایین‌دستی b294a19/206e92b بازسازی شد تا پنج‌واحدی همیشه برقرار بماند)

حادثهٔ صادقانهٔ پایانی + درمان: قطع عمدی next-server حین نوشتِ در جریان RelayQueue → سه ایندکس sqlite زنده دچار «wrong # of entries» شد. درمان (قانون دادهٔ مقدس): بکاپ گرم VACUUM INTO (db/backups/pre-reindex-20261126-084220.db) → REINDEX همان سه ایندکس (بازسازی از دادهٔ جداول — صفر تغییر رکورد) → integrity_check=ok · شمارش‌ها: P=29,157 · R=26,392 · T/User=۵ — صفر اتلاف (فقط رشد طبیعی +۳۴/+۱ از آخرین ثبت).

- گام اول: کامیت dangling جلسهٔ قبل (32e6967 — چهار ترمیم DIR-RELAY-ACTIVATE-001) پس از ریست سکاپرداز بازیابی شد (fe0774c) + خودآزمای ۱۷-سنجه‌ای تازه (bash -n ×۲ · هر ۵ دلیل رد · احیای محلی · تصدیب tmux · تماشای فعال‌سازی ۱۵۰ث · CONNECT_OK هر دو مسیر Poll).
- گام دوم: بخش «حالت تمام‌ظرفیت ترموکس» به‌طور کامل از کاشی فایل‌یابی حذف (FileFinderPage + RegisterDialog + رجیستری + تنظیم autoFullCapacity) · رله-اول: shouldRouteViaRelay (proxy.ts — منبع یگانه) نشست‌محور + client.ts مهلت رله‌آگاه · users/create در خانوادهٔ اولویت ۱۰ · روت‌های تغییرات/ثبت هر دو ensureChangesSessionForOperation پیش از اجرا · ولاغیر: اسکن صفر رله.
- گام سوم: ArmRegionPicker مشترک (دو دراپ‌داون وابسته عین فرم ثبت آگهی آرم) در تنظیمات ایجنت + AreaLineFilter پوششی روی همان — رجیستری یگانه ۱۳۰×۹۲۶.
- گام چهارم: حذف «پیش‌فرض ۱۷ منطقه» (UI + API fields + config/store) + سازوکار تثبیت آخرین تنظیم مالک (ذخیرهٔ سرور · E2E: انتخاب → reload → تثبیت).
- تست: سوئیت تازه ۲۹/۲۹ · نوسازی ۸ گارد · کامل ×۲: ۳۲۲۱/۳۳۳۰ سبز، شکست‌ها ۲۹/۳۰ یکتا = کلاس محیطی مستند (APK/QR · env.platform/ALT · Worker/v1 · seed · B-1 flake پیش‌موجود — تفاوت دو اجرا فقط B-1) · tsc صفر · بیلد سبز.
- شواهد: download/DIR-OWNER-4STEPS-001/ (FINAL-REPORT + ۵ JSON شاهد + ۳ PNG + SHA256SUMS).
- commits: fe0774c (restore) + b294a19 (feat) → push به origin/melka-backup.

---

Task ID: DIR-RELAY-ULTRA-001 (دستور مالک ۱۴۰۵/۱۰/۰۵ · ۲۰۲۶-۱۱-۲۶ · «رفع مشکلات و تنظیم دستور نصب فوق پیشرفته»)
preview_build_id: ec1e0f5-20261126-1002 (گارد تازگی: PASS — buildId=gitSha=live=edge · بیلد رسمی ws-build-daemon + ری‌استارت Blue/Green)

- گام اول (تحلیل فراژرف اجزا + ریشهٔ «آمار در ترموکس نمایش داده نمی‌شود»): جدول ۹-جزئی هر جزء در برابر فلسفهٔ وجودی — هیچ جزء مرده نبود؛ نقص ریشه‌ای = تنها ضربان هر ~۸ دقیقه بیکاری · بدون شمارندهٔ پیام دریافتی/درخواست ارسالی · بدون بقا/ابزار · بدون راهنمای مشاهده در مسیر موفق. درمان نسل R در relay-script.ts: خط «📊 آمار» هر ≤۳۰ث در همهٔ حالت‌ها (MSG_RECV/MSG_SENT تازه) + بقا stats.json + ابزار status.sh (تولید توسط هسته) + print_stats_guide هر دو شاخه + شاهد آمار در تماشای فعال‌سازی.
- گام دوم (ثبت آگهی واقعی از مسیر رله — ✓): E2E زنده ۲۰/۲۰ — ثبت آگهی واقعی → ۳ آیتم صف اولویت ۱۰ → اجرای رله (curl 28 صادقانه سندباکس) + **گوشی واقعی مالک (poco-f3-c04686) همان دقایق آیتم‌ها را با IP ایرانی روی ARM واقعی اجرا کرد (ARM 401 صادقانه — توکن sandbox منقضی؛ با ورود تازه مالک ثبت کامل می‌شود)** → ۵۰۲ صادقانه به کاربر · آمار دریافت/ارسال ۱/۱ + status.sh.
- گام سوم (تغییر کدآگهی واقعی از مسیر رله — ✓): change-owner کد 54402 → ۱۷ آیتم اولویت ۱۰ → properties/info/by-code روی گوشی واقعی (ARM 401 صادقانه) → ۴۲۲ گزارش صادقانه · آمار recv→6.
- حادثهٔ جانبی مهم (قانون دادهٔ مقدس): خرابی فیزیکی sqlite در RelayQueue/AuditLog (میراث قطع حین نوشتن + ریست سکاپرداز — «database disk image is malformed») → جراحی نجات سطر‌به‌سطر: RelayQueue ۵۰۳۵ · AuditLog ۲۹۹۴۴ · فقط ۱ responseBody نامعتبر→NULL · DDL استاندارد Prisma · integrity_check=ok · تعویض کنترل‌شده + ری‌استارت صفر-قطعی · شمارش‌های کلیدی یکسان (Session 352 · User 5 · DivarAd 50).
- ترمیم محیطی: MELK_RELAY_ALT_URL در env.platform.json بازگردانی شد (قربانی ریست).
- تست: سوئیت تخصصی ۱۹ تستی (ساختاری + رفتاری: اجرای تابع stats_line تولیدی + status.sh فارسی) · گاردهای نسل قبل همگی سبز (~۵۰۰ پاس) · tsc صفر · نوسان‌های محیطی مستند: pn035 B-1/B-2 · APK gitignored قربانی ریست.
- شواهد: download/DIR-RELAY-ULTRA-001/ (REPORT.md + e2e-live-relay.json 20/20 + relay-run.log نسل R + stats.json + status-output.txt).
- commits: ec1e0f5 (feat نسل R) + کامیت مستندات پایانی.
