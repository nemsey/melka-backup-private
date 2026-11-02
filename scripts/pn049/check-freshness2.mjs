import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } });
const experts = await p.expertRecord.findFirst({ where: { tenantId: 'melketun' }, orderBy: { syncedAt: 'desc' }, select: { fullName: true, syncedAt: true, extractedAt: true } });
console.log('freshest melketun expert:', JSON.stringify(experts));
const exCount = await p.expertRecord.count({ where: { tenantId: 'melketun' } });
console.log('melketun experts total:', exCount);
// filings: how many were updated tonight vs older
const tonight = await p.propertyRecord.count({ where: { tenantId: 'melketun', extractedAt: { gte: new Date('2026-10-22T22:00:00Z') } } });
const week = await p.propertyRecord.count({ where: { tenantId: 'melketun', extractedAt: { gte: new Date('2026-10-20T00:00:00Z') } } });
console.log('filings updated since 22:00 tonight:', tonight, '| since Oct-20:', week, '| total:', await p.propertyRecord.count({ where: { tenantId: 'melketun' } }));
await p.$disconnect();
