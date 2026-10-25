import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } });
const fresh = await p.propertyRecord.findFirst({ where: { tenantId: 'melketun' }, orderBy: { extractedAt: 'desc' }, select: { propertyCode: true, extractedAt: true, sourceRunId: true } });
const freshReq = await p.requestRecord.findFirst({ where: { tenantId: 'melketun' }, orderBy: { extractedAt: 'desc' }, select: { requestCode: true, extractedAt: true, sourceRunId: true } });
console.log('freshest filing:', JSON.stringify(fresh));
console.log('freshest request:', JSON.stringify(freshReq));
const runIds = await p.propertyRecord.groupBy({ by: ['sourceRunId'], where: { tenantId: 'melketun' }, _count: true, orderBy: { _count: { sourceRunId: 'desc' } }, take: 5 });
console.log('recent runs:', JSON.stringify(runIds.map(r => ({ run: r.sourceRunId, n: r._count })), null, 0));
await p.$disconnect();
