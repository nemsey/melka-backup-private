import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } });
// check detailsJson labels present across melketun filings
const rows = await p.propertyRecord.findMany({ where: { tenantId: 'melketun' }, select: { detailsJson: true, rawOwnerMobile: true }, take: 2000 });
const labelCount = {}; let phoneInDetails = 0, mobileInDetails = 0;
for (const r of rows) {
  try {
    const d = JSON.parse(r.detailsJson || '[]');
    for (const item of d) { labelCount[item.label] = (labelCount[item.label] || 0) + 1; if (/موبایل|تلفن|تماس|مالک/.test(item.label) && item.value) { if (/^\d+$/.test(item.value.replace(/\s/g,''))) mobileInDetails++; } }
  } catch {}
}
console.log('detailsJson label frequency:', JSON.stringify(labelCount, null, 1));
console.log('mobile-like values in details:', mobileInDetails);
const rawMobile = await p.propertyRecord.count({ where: { tenantId: 'melketun', rawOwnerMobile: { not: null } } });
console.log('rawOwnerMobile filled:', rawMobile);
await p.$disconnect();
