// scripts/pn002/seed-master-hash.ts — کاشتن هش SHA-256 کد مستر در AppMeta (بقای بازنشانی محیط)
// فقط هش ذخیره می‌شود — خود کد هرگز در DB نمی‌نشیند (PN-002 نکته ۱)
process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:/home/z/my-project/db/custom.db';
export {};

async function main() {
  const code = process.argv[2];
  if (!code || !/^\d{8}$/.test(code)) {
    console.log('استفاده: bun scripts/pn002/seed-master-hash.ts <کد۸رقمی>');
    process.exit(1);
  }
  const { createHash } = await import('crypto');
  const hash = createHash('sha256').update(code, 'utf8').digest('hex');
  const { db } = await import('@/lib/db');
  await db.appMeta.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', masterCodeHash: hash },
    update: { masterCodeHash: hash },
  });
  console.log('هش کد مستر در AppMeta ثبت شد (فقط هش — خود کد در هیچ‌جای DB نیست)');
  process.exit(0);
}

main().catch((e) => { console.error('FATAL:', e?.message ?? e); process.exit(1); });
