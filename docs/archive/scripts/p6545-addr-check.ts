import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  const noLat = 0;
  const noOwnerMobile = await db.propertyRecord.count({ where: { ownerMobile: null } });
  const noDesc = await db.propertyRecord.count({ where: { description: null } });
  const noPrice = await db.propertyRecord.count({ where: { price: null } });
  const reqNoPrice = await db.requestRecord.count({ where: { priceFrom: null, priceTo: null } });
  console.log(`propertyRecord: noLat=${noLat} noOwnerMobile=${noOwnerMobile} noDesc=${noDesc} noPrice=${noPrice}`);
  console.log(`requestRecord بدون بازهٔ قیمت: ${reqNoPrice}`);
  // کهنگی داده: رکوردهای کهنه‌تر از ۹۰ روز
  const cutoff = new Date(Date.now() - 90*86400000);
  const oldProps = await db.propertyRecord.count({ where: { syncedAt: { lt: cutoff } } });
  const oldSessions = await db.session.count({ where: { expiresAt: { lt: cutoff } } });
  console.log(`propertyRecord کهنه>۹۰روز(syncedAt): ${oldProps} | session منقضی>۹۰روز: ${oldSessions}`);
}
main().finally(() => db.$disconnect());
