// scripts/pn002/backup-db.ts — بکاپ VACUUM INTO دیتابیس داده (نکته ۳ — داده در GLM، نه گیت‌هاب)
process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:/home/z/my-project/db/custom.db';
export {};

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dest = `/home/z/my-project/upload/dataset-backups/pn002-${stamp}.db`;
  const { db } = await import('@/lib/db');
  await db.$executeRawUnsafe(`VACUUM INTO '${dest}'`);
  const fs = await import('node:fs');
  const crypto = await import('node:crypto');
  const size = fs.statSync(dest).size;
  const hash = crypto.createHash('md5').update(fs.readFileSync(dest)).digest('hex');
  console.log(`بکاپ داده (GLM): ${dest}`);
  console.log(`اندازه: ${(size / 1024 / 1024).toFixed(1)}MB · md5=${hash}`);
  process.exit(0);
}
main().catch((e) => { console.error('FATAL:', e?.message ?? e); process.exit(1); });
