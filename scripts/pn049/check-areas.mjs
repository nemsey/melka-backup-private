import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const total = await p.requestRecord.count({ where: { tenantId: 'melketun' } });
const withAreas = await p.requestRecord.count({ where: { tenantId: 'melketun', areaNamesJson: { not: null } } });
const nonEmpty = await p.requestRecord.count({ where: { tenantId: 'melketun', NOT: { OR: [{ areaNamesJson: null }, { areaNamesJson: '' }, { areaNamesJson: '[]' }] } } });
const tTotal = await p.requestRecord.count({ where: { tenantId: 'melk-tabriz' } });
const tNonEmpty = await p.requestRecord.count({ where: { tenantId: 'melk-tabriz', NOT: { OR: [{ areaNamesJson: null }, { areaNamesJson: '' }, { areaNamesJson: '[]' }] } } });
console.log('melketun requests:', total, '| with areaNamesJson non-empty:', nonEmpty);
console.log('tabriz requests:', tTotal, '| with areaNamesJson non-empty:', tNonEmpty);
// sample melketun rows
const sample = await p.requestRecord.findMany({ where: { tenantId: 'melketun' }, select: { requestCode: true, areaNamesJson: true }, take: 5 });
console.log('sample melketun:', JSON.stringify(sample, null, 1));
// how many melketun have >3 areas
const all = await p.requestRecord.findMany({ where: { tenantId: 'melketun' }, select: { areaNamesJson: true } });
let gt3 = 0, cnt = 0;
for (const r of all) { try { const a = JSON.parse(r.areaNamesJson || '[]'); if (a.length > 3) gt3++; if (a.length > 0) cnt++; } catch {} }
console.log('melketun: rows with >3 areas (file mode):', gt3, '| rows with >=1 area:', cnt);
await p.$disconnect();
