import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  // Properties: real owner enrichment = rawOwnerName/rawOwnerMobile/ownerMobile
  const props = await db.propertyRecord.count();
  const propsOwnerMobile = await db.propertyRecord.count({ where: { ownerMobile: { not: null } } });
  const propsRawOwner = await db.propertyRecord.count({ where: { rawOwnerName: { not: null } } });
  // Requests enrichment
  const reqs = await db.requestRecord.count({ where: { source: 'arm' } });
  const reqName = await db.requestRecord.count({ where: { source: 'arm', customerName: { not: null } } });
  const reqMobile = await db.requestRecord.count({ where: { source: 'arm', customerMobile: { not: null } } });
  const reqNoMobile = await db.requestRecord.count({ where: { source: 'arm', customerMobile: { not: null }, customerName: null } });
  console.log(`PROPS total=${props} ownerMobile=${propsOwnerMobile} rawOwnerName=${propsRawOwner} pending=${props - Math.max(propsOwnerMobile, propsRawOwner)}`);
  console.log(`REQS total=${reqs} customerName=${reqName} customerMobile=${reqMobile}`);
  // sample un-enriched property
  const sample = await db.propertyRecord.findFirst({ where: { ownerMobile: null, rawOwnerName: null }, select: { propertyCode: true, title: true, ownerName: true } });
  console.log('sample pending prop:', JSON.stringify(sample));
  // latest audit logs for sync
  const logs = await db.auditLog.findMany({ where: { OR: [{ action: { contains: 'SYNC' } }, { action: { contains: 'CATALOG' } }] }, orderBy: { createdAt: 'desc' }, take: 5, select: { action: true, createdAt: true, recordCount: true } });
  for (const l of logs) console.log('AUDIT', JSON.stringify(l));
}
main().finally(() => db.$disconnect());
