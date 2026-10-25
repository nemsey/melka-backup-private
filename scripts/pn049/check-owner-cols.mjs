import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } });
const total = await p.propertyRecord.count({ where: { tenantId: 'melketun' } });
const ownerFilled = await p.propertyRecord.count({ where: { tenantId: 'melketun', ownerName: { not: null } } });
const rawOwnerFilled = await p.propertyRecord.count({ where: { tenantId: 'melketun', rawOwnerName: { not: null } } });
const ownerMobileFilled = await p.propertyRecord.count({ where: { tenantId: 'melketun', ownerMobile: { not: null } } });
const sample = await p.propertyRecord.findMany({ where: { tenantId: 'melketun' }, select: { propertyCode: true, ownerName: true, rawOwnerName: true, ownerMobile: true }, take: 6 });
console.log('M7 ملکتون:', { total, ownerNameFilled: ownerFilled, rawOwnerNameFilled: rawOwnerFilled, ownerMobileFilled });
console.log('sample:', JSON.stringify(sample, null, 1));
// requests M8
const rTotal = await p.requestRecord.count({ where: { tenantId: 'melketun' } });
const cName = await p.requestRecord.count({ where: { tenantId: 'melketun', customerName: { not: null } } });
const cMobile = await p.requestRecord.count({ where: { tenantId: 'melketun', customerMobile: { not: null } } });
console.log('M8 ملکتون:', { rTotal, customerNameFilled: cName, customerMobileFilled: cMobile });
// expert names for melketun filings
const sarmasti = await p.propertyRecord.count({ where: { tenantId: 'melketun', ownerName: { contains: 'سرمستی' } } });
console.log('melketun filings ownerName contains سرمستی:', sarmasti);
await p.$disconnect();
