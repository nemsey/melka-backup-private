import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } });
const since = new Date(Date.now() - 40 * 60 * 1000);

const badProps = await p.propertyRecord.count({ where: { id: { startsWith: 'import-' }, updatedAt: { gte: since } } });
const badReqs = await p.requestRecord.count({ where: { id: { startsWith: 'import-' }, updatedAt: { gte: since } } });
const badExps = await p.expertRecord.count({ where: { id: { startsWith: 'import-' }, createdAt: { gte: since } } });
const oldProps = await p.propertyRecord.count({ where: { id: { startsWith: 'import-' }, updatedAt: { lt: since } } });
const oldReqs = await p.requestRecord.count({ where: { id: { startsWith: 'import-' }, updatedAt: { lt: since } } });
const oldExps = await p.expertRecord.count({ where: { id: { startsWith: 'import-' }, createdAt: { lt: since } } });
console.log(JSON.stringify({ window40min: { props: badProps, reqs: badReqs, experts: badExps }, older: { props: oldProps, reqs: oldReqs, experts: oldExps } }, null, 1));

const sample = await p.propertyRecord.findMany({ where: { id: { startsWith: 'import-' }, updatedAt: { gte: since } }, select: { id: true, propertyCode: true, tenantId: true, title: true }, take: 3 });
console.log('sample bad props:', JSON.stringify(sample, null, 1));
const sampleReq = await p.requestRecord.findMany({ where: { id: { startsWith: 'import-' }, updatedAt: { gte: since } }, select: { id: true, requestCode: true, tenantId: true }, take: 3 });
console.log('sample bad reqs:', JSON.stringify(sampleReq, null, 1));
const sampleExp = await p.expertRecord.findMany({ where: { id: { startsWith: 'import-' }, createdAt: { gte: since } }, select: { id: true, personnelCode: true, fullName: true, tenantId: true }, take: 4 });
console.log('sample bad experts:', JSON.stringify(sampleExp, null, 1));
await p.$disconnect();
