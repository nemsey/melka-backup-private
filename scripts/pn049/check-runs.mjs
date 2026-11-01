import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } });
const fRuns = await p.propertyRecord.groupBy({ by: ['sourceRunId'], where: { tenantId: 'melketun', extractedAt: { gte: new Date('2026-10-22T20:00:00Z') } }, _count: true, orderBy: { _count: { sourceRunId: 'desc' } } });
const rRuns = await p.requestRecord.groupBy({ by: ['sourceRunId'], where: { tenantId: 'melketun', extractedAt: { gte: new Date('2026-10-22T20:00:00Z') } }, _count: true, orderBy: { _count: { sourceRunId: 'desc' } } });
console.log('tonight filing runs:', JSON.stringify(fRuns.map(r => ({ run: r.sourceRunId, n: r._count })), null, 0));
console.log('tonight request runs:', JSON.stringify(rRuns.map(r => ({ run: r.sourceRunId, n: r._count })), null, 0));
await p.$disconnect();
