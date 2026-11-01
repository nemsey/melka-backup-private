import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } });
const since = new Date(Date.now() - 50 * 60 * 1000);

// ۱) کدهای تبریز که با ارقام خالص کدهای ملکتون هم‌پوشانی دارند
const melkCodes = await p.propertyRecord.findMany({ where: { tenantId: 'melketun' }, select: { propertyCode: true } });
const digitSet = new Set(melkCodes.map(r => r.propertyCode.replace(/\D/g, '')).filter(c => c.length > 0));
console.log('melketun digit variants:', digitSet.size, 'samples:', [...digitSet].slice(0, 5));

// کدهای تبریز که در این مجموعه‌اند (قربانیان بالقوهٔ listings)
const victims = await p.propertyRecord.findMany({
  where: { tenantId: 'melk-tabriz', propertyCode: { in: [...digitSet] } },
  select: { id: true, propertyCode: true, title: true, price: true, ownerName: true, updatedAt: true, extractedAt: true, sourceRunId: true },
  take: 4000,
});
console.log('TABRIZ PROPERTY VICTIMS (potential):', victims.length);

const melkReqCodes = await p.requestRecord.findMany({ where: { tenantId: 'melketun' }, select: { requestCode: true } });
const reqDigitSet = new Set(melkReqCodes.map(r => (r.requestCode ?? '').replace(/\D/g, '')).filter(c => c.length > 0));
const reqVictims = await p.requestRecord.findMany({
  where: { tenantId: 'melk-tabriz', requestCode: { in: [...reqDigitSet] } },
  select: { id: true, requestCode: true, title: true, customerName: true, updatedAt: true, sourceRunId: true },
  take: 4000,
});
console.log('TABRIZ REQUEST VICTIMS (potential):', reqVictims.length);

// ۲) آیا این قربانیان در پنجرهٔ من آپدیت شده‌اند؟ (نشانهٔ بازنویسی)
const propUpdated = victims.filter(v => v.updatedAt && v.updatedAt >= since);
const reqUpdated = reqVictims.filter(v => v.updatedAt && v.updatedAt >= since);
console.log('property victims updated in window:', propUpdated.length);
console.log('request victims updated in window:', reqUpdated.length);
console.log('sample prop victims:', JSON.stringify(propUpdated.slice(0, 3), null, 1));
console.log('sample req victims:', JSON.stringify(reqUpdated.slice(0, 3), null, 1));

// ۳) experts تبریز — رکوردهای موجود آپدیت شدند یا همه create شدند؟
// (قبلاً دیدیم created=143 — یعنی هیچ existing match نشد؛ پس تخریبexisting نداریم — فقط ۲۲۷ رکورد زائد)
// ۴) شمارش کل ملکتون-exportهای عددی که در DB تبریز موجودند
await p.$disconnect();
