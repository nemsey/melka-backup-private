import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } });
const row = await p.refListCache.findUnique({ where: { key: 'melketun-funnel' } });
if (row) {
  console.log('M9 funnel cache: fetchedAt =', row.fetchedAt.toISOString());
  const v = JSON.parse(row.dataJson || '{}');
  console.log('keys:', Object.keys(v).slice(0, 10).join(','));
} else console.log('funnel cache: NULL (M9 بینش از دادهٔ M7/M8 محاسبه می‌شود)');
await p.$disconnect();
