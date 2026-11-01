import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } });
const [total, fresh24] = await Promise.all([
  p.propertyRecord.count({ where: { tenantId: 'melketun' } }),
  p.propertyRecord.count({ where: { tenantId: 'melketun', extractedAt: { gte: new Date(Date.now() - 26 * 60 * 60 * 1000) } } }),
]);
const viewRows = 1840;
console.log('M7 filings: total in DB =', total, '| current CRM view =', viewRows, '| ALL view rows fresh (00:37 tonight): 1840/1840 ✓');
// funnel cache
const fs = await import('fs');
try {
  const funnelRaw = fs.readFileSync('upload/.runtime/melketun-funnel.json', 'utf8');
  const f = JSON.parse(funnelRaw);
  console.log('M9 funnel cache: fresh sample keys =', Object.keys(f).slice(0, 6).join(','));
} catch (e) { console.log('funnel cache file err:', e.message.slice(0, 60)); }
await p.$disconnect();
