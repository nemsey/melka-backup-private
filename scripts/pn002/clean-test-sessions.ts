// scripts/pn002/clean-test-sessions.ts — پاکسازی نشست‌های تست OWNER (نگهداری نشست OTP خود مالک)
process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:/home/z/my-project/db/custom.db';
export {};

async function main() {
  const { db } = await import('@/lib/db');
  const res = await db.session.deleteMany({ where: { personnelCode: 'OWNER', role: 'OWNER' } });
  console.log('نشست‌های تست OWNER پاک شد:', res.count);
  process.exit(0);
}
main().catch((e) => { console.error('FATAL:', e?.message ?? e); process.exit(1); });
