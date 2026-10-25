import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const rows = await p.requestRecord.findMany({ where: { tenantId: 'melketun', NOT: { OR: [{ areaNamesJson: null }, { areaNamesJson: '[]' }] } }, select: { requestCode: true, areaNamesJson: true }, take: 4000 });
const dist = {};
let max = 0;
for (const r of rows) { try { const a = JSON.parse(r.areaNamesJson); dist[a.length] = (dist[a.length] || 0) + 1; if (a.length > max) max = a.length; } catch {} }
console.log('melketun area count distribution:', JSON.stringify(dist), '| max areas:', max);
// check raw source json for a request with null areas - what does the CRM give?
const nullRows = await p.requestRecord.findMany({ where: { tenantId: 'melketun', areaNamesJson: null }, select: { requestCode: true, armRegistrationJson: true }, take: 2 });
console.log('sample null-areas rows:', JSON.stringify(nullRows.map(r => ({ code: r.requestCode, reg: r.armRegistrationJson?.slice(0, 400) })), null, 1));
await p.$disconnect();
