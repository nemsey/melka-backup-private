import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const f = await p.propertyRecord.findMany({ where: { tenantId: 'melketun', areaName: { not: null } }, select: { areaName: true }, take: 5000 });
let sep = 0; const uq = new Set();
for (const r of f) { uq.add(r.areaName); if (r.areaName.includes(',') || r.areaName.includes('،')) sep++; }
console.log('melketun filings areas: total', f.length, '| with separators:', sep, '| unique:', uq.size);
await p.$disconnect();
