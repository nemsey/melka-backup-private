import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } });
const r = await p.requestRecord.findFirst({ where: { tenantId: 'melketun', customerMobile: { not: null } }, select: { requestCode: true, customerName: true, customerMobile: true, actorName: true, sourceRunId: true, inputsJson: true } });
console.log(JSON.stringify(r, null, 1).slice(0, 600));
await p.$disconnect();
