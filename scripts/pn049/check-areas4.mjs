import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const rows = await p.requestRecord.findMany({ where: { tenantId: 'melketun' }, select: { requestCode: true, inputsJson: true, areaNamesJson: true }, take: 3 });
for (const r of rows) console.log(r.requestCode, '| areas:', r.areaNamesJson, '| inputs:', (r.inputsJson || '').slice(0, 300));
// tabriz sample for comparison
const t = await p.requestRecord.findMany({ where: { tenantId: 'melk-tabriz' }, select: { requestCode: true, areaNamesJson: true }, take: 3 });
console.log('tabriz sample:', JSON.stringify(t.map(x => ({ c: x.requestCode, a: JSON.parse(x.areaNamesJson || '[]').length })), null, 0));
// tabriz distribution
const all = await p.requestRecord.findMany({ where: { tenantId: 'melk-tabriz' }, select: { areaNamesJson: true }, take: 30000 });
const dist = {};
for (const r of all) { try { const a = JSON.parse(r.areaNamesJson || '[]'); const k = a.length > 3 ? '>3 (file)' : String(a.length); dist[k] = (dist[k] || 0) + 1; } catch {} }
console.log('tabriz area count distribution:', JSON.stringify(dist));
await p.$disconnect();
