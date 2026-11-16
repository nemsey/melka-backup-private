-- PN-084 — ایندکس‌های افزودنی مسیر داغ موتور تطبیق (کاشی تطبیق/M5)
-- صفر تغییر ستون · صفر حذف — فقط دو ایندکس مرکب برای پرس‌وجوی کاندیداها
-- (پیش‌فیلتر SQL وضعیت + مرتب‌سازی تازگی با پوشش کامل فعال‌ها)
CREATE INDEX IF NOT EXISTS "PropertyRecord_status_syncedAt_idx" ON "PropertyRecord"("status", "syncedAt");
CREATE INDEX IF NOT EXISTS "RequestRecord_status_updatedAt_idx" ON "RequestRecord"("status", "updatedAt");
