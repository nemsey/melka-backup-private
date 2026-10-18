# بستهٔ بقا ۳۸ — PN-034 (شورای عالی ملکا · جلسهٔ ۰۵۵)

## چه گذشت؟
- گزارش مالک (جلسهٔ ۰۵۵): اتصال Termux برقرار نیست؛ بخش «ورود مجدد به ملک
  تبریز» خطای «مکانیزم OTP تک‌باره (PN-029): این کد پرسنلی تا ۴ ساعت و
  ۳۹ دقیقه دیگر قفل است» می‌دهد؛ دکمهٔ تولید کد نصب رله حذف شده است.
- درس ماندگار ۰۵۴ (ثبت در تاریخ شورا): «پاکسازی بیش از حد، به اندازهٔ
  ناکافی بد است.» — PN-033 دکمهٔ تولید کد نصب را هم حذف کرده بود.
- قانون مالک (بالاتر از هر مکانیزم امنیتی قبلی): «صفر محدودیت اتصال».
- اجرای GLM — سه بازگردانی + یک حذف:
  · احیای «تولید کد نصب» (RelaySetupSection · POST /api/admin/relay/enroll)
    + راهنمای ۳ خطی مسیر اثبات‌شدهٔ PN-031-I: pkg install -y openssl-tool
    → پیست کد نصب → Enter. buildInstallCommand و اسکریپت رله هر دو
    openssl-tool (بستهٔ CLI واقعی Termux) نصب می‌کنند.
  · احیای «اتصال به حساب شخصی سامانه ARM» (ArmConnectionSection embedded —
    فرم مستقیم: کدپرسنلی → دریافت پیامک → تأیید؛ بدون هیچ قفلی).
  · حذف کامل «ورود مجدد» + مکانیزم تک‌باره: OtpReloginSection.tsx + روت
    /api/admin/otp-burn (اصلی + آینهٔ v1) + src/lib/auth/otp-lock.ts + مدل
    OtpRateLimit از هر دو اسکیما (جدول از custom.db و test.db دراپ —
    قفل ۶ساعتهٔ code:410031320 با خود جدول نابود شد).
  · حذف سقفهای نرخ محلی از ۵ مسیر اتصال (request-otp · verify-otp ·
    arm/pm/gap connection) — recordAttempt فقط رد حسابرسی، هرگز سپر.
- حادثهٔ بازگشت دوازدهم: reset-guard در BUILD-STALE (بیلد کهنه در برابر
  HEAD) دستور reset --hard داد و کارهای کامیت‌نشده را پاک کرد (۱۲:۰۹Z).
  بازیابی: بازپخش کامل تغییرات + کامیت فوری + پوش فوری آینه (درس ۵
  PN-032: پنجرهٔ کامیت→آینه بسته شد) + قفل نرخ موقتِ صادقانه در فعال-کاری.
- دروازه‌ها: دو-سبز ۲۷۷۸/۰×۲ · tsc صفر · lint صفر خطا · گارد ۴۴/۴۴ ·
  BUILD_ID=HEAD=آینه (30fab64) · اثبات DOM زنده: ARM بازگشت + ورود مجدد
  حذف + دکمهٔ تولید کد نصب موجود.

## چگونه بازیابی کنیم؟
پس از بازیابی: (۱) bun install + prisma generate + prisma db push با
schema.prisma همین بسته (۶۸ مدل — OtpRateLimit حذف) · (۲) env.platform.json
همین بسته (فیوز خاموش · رلهٔ mobile) · (۳) بیلد با bun run build + بوت
scripts/prod-watchdog.sh · (۴) Worker: bun scripts/runtime/worker.ts (قفل
runtime:worker با TTL ۹۰ث خودآزاد است) · (۵) کد تازهٔ مالک:
recovery-scripts/issue-owner-code.ts یا از UI «تولید کد نصب» · (۶) مسیر
مالک: Termux → pkg install -y openssl-tool → پیست کد نصب → Enter.
کلیدهای حیاتی: env.platform.json + custom.db + repo.bundle +
hardened-relay/ (relay-script.ts با openssl-tool) + recovery-scripts/.
