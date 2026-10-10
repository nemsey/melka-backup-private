// PN-027 · ۵-الف-۵ — بررسی نشست‌های فعال (قبل از هرس)
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function main() {
  const now = new Date();
  const active = await db.session.findMany({
    where: { revoked: false, expiresAt: { gt: now } },
    select: { id: true, personnelCode: true, displayName: true, role: true, ip: true, createdAt: true, expiresAt: true },
    orderBy: { createdAt: 'desc' },
  });
  console.log('نشست‌های فعال:', active.length);
  for (const s of active) {
    const ageH = ((now.getTime() - new Date(s.createdAt).getTime()) / 3600000).toFixed(1);
    console.log(`  · ${s.id.slice(0, 8)} ${s.role} ${s.personnelCode} ip=${s.ip} سن=${ageH}ساخت=${s.createdAt.toISOString().slice(0, 16)} انقضا=${s.expiresAt.toISOString().slice(0, 16)}`);
  }

  // آیا Worker یا ابزاری نشست localhost فعال لازم دارد؟
  console.log('\n=== نشست‌های فعال localhost (کاندید probe) ===');
  const localActive = active.filter((s) => s.ip === '127.0.0.1' || s.ip === '::1');
  console.log('تعداد:', localActive.length);
  console.log('\n=== نشست‌های localhost کل (probe تاریخی) ===');
  const localAll = await db.session.count({ where: { ip: { in: ['127.0.0.1', '::1'] } } });
  console.log('تعداد:', localAll);
  console.log('\n=== نشست‌های 21.0.0.1 (کاربر واقعی — محفوظ) ===');
  const real = await db.session.count({ where: { ip: '21.0.0.1' } });
  console.log('تعداد:', real);
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
