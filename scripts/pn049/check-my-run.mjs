import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } });
// rows touched in the last 20 minutes (my direct sync attempt window)
const since = new Date(Date.now() - 20 * 60 * 1000);
const [f, r] = await Promise.all([
  p.propertyRecord.count({ where: { tenantId: 'melketun', extractedAt: { gte: since } } }),
  p.requestRecord.count({ where: { tenantId: 'melketun', extractedAt: { gte: since } } }),
]);
console.log('rows extracted in last 20min (my run):', { filings: f, requests: r });
const allRuns = await p.propertyRecord.groupBy({ by: ['sourceRunId'], where: { tenantId: 'melketun' }, _count: true, orderBy: { _count: { sourceRunId: 'desc' } }, take: 3 });
console.log('top runs:', JSON.stringify(allRuns.map(x => ({ run: x.sourceRunId, n: x._count }))));
// connection state now
const fs = await import('fs');
console.log('connection state:', fs.readFileSync('upload/.runtime/melketun-connection-state.json', 'utf8'));
await p.$disconnect();
