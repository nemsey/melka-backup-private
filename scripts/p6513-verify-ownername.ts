import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  const total = await db.transactionRecord.count();
  const distinct = await db.transactionRecord.groupBy({ by: ['propertyCustomer'], _count: true, orderBy: { _count: { propertyCustomer: 'desc' } }, take: 8 });
  console.log(`total tx=${total}`);
  for (const d of distinct) console.log(`propertyCustomer="${d.propertyCustomer}" count=${d._count}`);
  // و رجیستری آگهی‌ها: rawOwnerName چقدر پر است؟
  const props = await db.propertyRecord.count();
  const rawOwner = await db.propertyRecord.count({ where: { rawOwnerName: { not: null } } });
  console.log(`properties=${props} with rawOwnerName=${rawOwner}`);
  // transactions route از چه فیلدی برای owner lookup استفاده می‌کند؟
}
main().finally(() => db.$disconnect());
