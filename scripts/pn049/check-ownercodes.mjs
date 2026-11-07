import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } });
const rows = await p.propertyRecord.findMany({ where: { tenantId: 'melk-tabriz', NOT: [{ ownerCode: null }] }, select: { propertyCode: true, ownerCode: true, ownerName: true }, take: 8 });
console.log('tabriz properties WITH ownerCode:', JSON.stringify(rows, null, 1));
// distribution of ownerName (realtor names) for tabriz
const names = await p.propertyRecord.groupBy({ where: { tenantId: 'melk-tabriz' }, by: ['ownerName'], _count: true, take: 8, orderBy: { _count: { ownerName: 'desc' } } });
console.log('top tabriz ownerName (realtor) values:', JSON.stringify(names.map(n => ({ n: n.ownerName, c: n._count })), null, 0));
const rNames = await p.requestRecord.groupBy({ where: { tenantId: 'melk-tabriz' }, by: ['actorName'], _count: true, take: 8, orderBy: { _count: { actorName: 'desc' } } });
console.log('top tabriz request actorName values:', JSON.stringify(rNames.map(n => ({ n: n.actorName, c: n._count })), null, 0));
await p.$disconnect();
