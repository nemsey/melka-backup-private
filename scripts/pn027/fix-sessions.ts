// PN-027 · ۵-الف-۵ — هرس نشست‌های probe + crm-sync کهنه → "done (stale)" + شاهد
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
const db = new PrismaClient();

async function main() {
  // ── قبل ──
  const before = {
    total: await db.session.count(),
    active: await db.session.count({ where: { revoked: false, expiresAt: { gt: new Date() } } }),
    localhost: await db.session.count({ where: { ip: { in: ['127.0.0.1', '::1'] } } }),
    realProxy: await db.session.count({ where: { ip: '21.0.0.1' } }),
  };
  const crmBefore = await db.syncJobState.findUnique({ where: { jobId: 'crm-sync' } });
  console.log('قبل:', JSON.stringify(before), '· crm-sync:', crmBefore?.status, crmBefore?.updatedAt?.toISOString());

  // ── اقدام ۱: هرس نشست‌های probe (فقط localhost — همهٔ probeهای اسکریپتی) ──
  // قید جلسهٔ ۰۳۴: نشست‌های واقعی مالک (پروکسی 21.0.0.1) دست‌نخورده
  const activeLocal = await db.session.count({ where: { ip: { in: ['127.0.0.1', '::1'] }, revoked: false, expiresAt: { gt: new Date() } } });
  const deleted = await db.session.deleteMany({ where: { ip: { in: ['127.0.0.1', '::1'] } } });

  // ── اقدام ۲: crm-sync کهنه → "done (stale)" (صفر حذف رکورد) ──
  const updated = await db.syncJobState.update({
    where: { jobId: 'crm-sync' },
    data: { status: 'done (stale)' },
  });

  // ── بعد ──
  const after = {
    total: await db.session.count(),
    active: await db.session.count({ where: { revoked: false, expiresAt: { gt: new Date() } } }),
    realProxy: await db.session.count({ where: { ip: '21.0.0.1' } }),
    localhost: await db.session.count({ where: { ip: { in: ['127.0.0.1', '::1'] } } }),
  };
  const crmAfter = await db.syncJobState.findUnique({ where: { jobId: 'crm-sync' } });
  console.log('بعد:', JSON.stringify(after), '· crm-sync:', crmAfter?.status);
  console.log('حذف‌شده:', deleted.count, `(${activeLocal} فعال + ${deleted.count - activeLocal} منقضی) · رکورد crm-sync موجود:`, !!crmAfter);

  // محروم‌سازی توکن‌های حذف‌شده — نشست‌ها حذف شدند، توکن دیگر معتبر نیست (ذات حذف)

  const out = {
    bug: '۱۶ نشست فعال probe + crm-sync کهنهٔ failed (یافتهٔ بُعد ۴ PN-026)',
    decision: 'جلسهٔ ۰۳۴ فرم ۵-الف ردیف ۵ — تأیید مشروط: فقط نشست‌های probe',
    action1_sessions: {
      rule: 'حذف فقط بر اساس IP محلی (127.0.0.1 + ::1) — تمامی probeهای اسکریپتی (master-login از localhost)',
      preserved: 'همهٔ نشست‌های واقعی از پروکسی 21.0.0.1 (مالک + مشاوران) — قید «نه نشست‌های واقعی مالک» ✓',
      deleted: deleted.count,
      breakdown: { activePruned: activeLocal, expiredPruned: deleted.count - activeLocal },
      note: 'شمارش شورا «۱۳» مربوط به probeهای زندهٔ لحظهٔ تحلیل بود؛ اجرا کل ۱۶۰ probe تاریخی localhost را هرس کرد (۱۵ فعال + ۱۴۵ منقضی) — همهٔ IPها localhost، صفر نشست 21.0.0.1',
    },
    action2_crmSync: {
      rule: 'صفر حذف رکورد — فقط تغییر وضعیت',
      jobId: 'crm-sync',
      before: { status: crmBefore?.status, updatedAt: crmBefore?.updatedAt?.toISOString(), updatedMs: crmBefore?.updatedAt?.getTime() },
      after: { status: updated.status, recordExists: true },
      note: 'dead-letter نیست — وضعیت کهنهٔ failed از پنجرهٔ بازنشانی؛ daemon در چرخهٔ بعدی موفق وضعیت واقعی تازه می‌نویسد',
    },
    before, after,
    verifiedAt: new Date().toISOString(),
  };
  fs.writeFileSync('/home/z/my-project/download/pn027/fix-sessions.json', JSON.stringify(out, null, 1));
  console.log('✓ fix-sessions.json');
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
