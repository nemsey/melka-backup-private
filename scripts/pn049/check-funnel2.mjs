import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } });
const row = await p.refListCache.findUnique({ where: { key: 'melketun-funnel' } });
if (row) {
  const v = JSON.parse(row.value ?? "{}");
  console.log('M9 funnel cache: updatedAt =', row.updatedAt, '| keys =', Object.keys(v).slice(0, 8).join(','));
} else console.log('funnel cache: NULL');
await p.$disconnect();
