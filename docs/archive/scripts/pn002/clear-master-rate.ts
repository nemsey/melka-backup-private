// scripts/pn002/clear-master-rate.ts — پاکسازی تلاش‌های ورود تستی خودم (نکته ۱ — تست سه‌لایه)
process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:/home/z/my-project/db/custom.db';
export {};

async function main() {
  const { db } = await import('@/lib/db');
  const res = await db.otpAttempt.deleteMany({ where: { personnelCode: '000000000', kind: 'MASTER_LOGIN' } });
  console.log(`تلاش‌های ورود مستر پاک شد: ${res.count} ردیف`);
  process.exit(0);
}
main().catch((e) => { console.error('FATAL:', e?.message ?? e); process.exit(1); });
