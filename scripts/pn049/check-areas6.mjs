import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const rows = await p.requestRecord.findMany({ where: { tenantId: 'melketun', NOT: { OR: [{ areaNamesJson: null }, { areaNamesJson: '[]' }] } }, select: { id: true, areaNamesJson: true }, take: 4000 });
function parseAreas(raw) {
  if (!raw) return [];
  return String(raw).split(/[،,]/).map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
}
const dist = {}; let max = 0, gt3 = 0, ge1 = 0, totalAreas = 0;
for (const r of rows) {
  try {
    const stored = JSON.parse(r.areaNamesJson);
    const parsed = parseAreas(stored[0] ?? '');
    if (stored.length > 1) console.log('ALREADY MULTI:', r.id);
    dist[parsed.length] = (dist[parsed.length] || 0) + 1;
    if (parsed.length > max) max = parsed.length;
    if (parsed.length > 3) gt3++;
    if (parsed.length >= 1) ge1++;
    totalAreas += parsed.length;
  } catch {}
}
console.log('AFTER PARSE distribution:', JSON.stringify(dist));
console.log('rows with >3 areas (file mode like tabriz):', gt3, '/', rows.length, `(${(gt3/rows.length*100).toFixed(1)}%)`);
console.log('max areas per row:', max);
await p.$disconnect();
