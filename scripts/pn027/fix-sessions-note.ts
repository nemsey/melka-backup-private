// PN-027 · ۵-الف-۵ — شاهد نهایی هرس (اصلاح‌شده با روایت صادقانهٔ crm-sync)
import fs from 'node:fs';

const prev = JSON.parse(fs.readFileSync('/home/z/my-project/download/pn027/fix-sessions.json', 'utf8'));

prev.honestNote_crmSync = {
  finding: 'مابه‌التفاوت زمانی: PN-026 رکورد crm-sync را failed@2026-10-09T15:08 مشاهده کرد؛ در لحظهٔ اجرای PN-027 daemon پیش‌تر آن را به done@2026-10-10T02:10 به‌روز کرده بود (خوددرمانی چرخهٔ Worker).',
  action: 'با وجود خوددرمانی، طبق قرارداد جلسهٔ ۰۳۴ وضعیت به «done (stale)» تنظیم شد — علامت‌گذاری صریح که دورهٔ کهنه بسته شده است.',
  effect: 'گذرا — daemon در چرخهٔ موفق بعدی وضعیت تازهٔ واقعی (done + جزئیات) را بازمی‌نویسد؛ صفر حذف رکورد ✓',
};

fs.writeFileSync('/home/z/my-project/download/pn027/fix-sessions.json', JSON.stringify(prev, null, 1));
console.log('✓ fix-sessions.json — یادداشت صادقانهٔ crm-sync افزوده شد');
console.log('   خلاصه: حذف ۱۶۰ نشست probe (۱۵ فعال + ۱۴۵ منقضی) · ۳۵ نشست واقعی محفوظ · crm-sync: «done (stale)» بدون حذف');
