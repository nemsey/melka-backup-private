import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const rows = await p.requestRecord.findMany({ where: { tenantId: 'melketun', NOT: { OR: [{ areaNamesJson: null }, { areaNamesJson: '[]' }] } }, select: { areaNamesJson: true }, take: 4000 });
const seps = { ',': 0, '|': 0, '/': 0, ' - ': 0, ' و ': 0, '؛': 0 };
const uniq = new Set();
for (const r of rows) { try { const v = JSON.parse(r.areaNamesJson)[0] || ''; uniq.add(v); for (const s of Object.keys(seps)) if (v.includes(s)) seps[s]++; } catch {} }
console.log('separator occurrences in raw area strings:', JSON.stringify(seps));
console.log('unique area values:', uniq.size, '→ sample:', JSON.stringify([...uniq].slice(0, 25)));
await p.$disconnect();
