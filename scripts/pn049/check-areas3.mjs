import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const rows = await p.requestRecord.findMany({ where: { tenantId: 'melketun', NOT: { OR: [{ areaNamesJson: null }, { areaNamesJson: '[]' }] } }, select: { requestCode: true, areaNamesJson: true }, take: 8 });
console.log('sample area values:');
for (const r of rows) console.log(' ', r.requestCode, '→', r.areaNamesJson);
// check long area strings (possibly comma-separated lists stored as one)
const long = await p.requestRecord.findMany({ where: { tenantId: 'melketun', areaNamesJson: { contains: '،' } }, select: { requestCode: true, areaNamesJson: true }, take: 5 });
console.log('rows with ، inside area value:', long.length);
for (const r of long) console.log(' ', r.requestCode, '→', r.areaNamesJson?.slice(0, 200));
// filings (M7) — areas for listings?
const fArea = await p.propertyRecord.findMany({ where: { tenantId: 'melketun', areaName: { not: null } }, select: { propertyCode: true, areaName: true }, take: 5 });
console.log('filings sample areas:', JSON.stringify(fArea.map(f => ({ c: f.propertyCode, a: f.areaName })), null, 0));
await p.$disconnect();
