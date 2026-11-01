// PN-049 — صحت‌سنجی دامنه‌بندی حساب کاربری روی دیتای واقعی
import { PrismaClient } from '@prisma/client';
import { normalizeFilterInput } from './norm-helper.mjs';
const p = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } });

const sarmastiNorm = normalizeFilterInput('بهمن سرمستی القو');
console.log('sarmasti nameNorm:', JSON.stringify(sarmastiNorm));

// requests: his own records via actorNameNorm
const hisReqs = await p.requestRecord.count({ where: { tenantId: 'melketun', actorNameNorm: sarmastiNorm } });
const bogusReqs = await p.requestRecord.count({ where: { tenantId: 'melketun', actorNameNorm: normalizeFilterInput('کاربر آزمایشی ساختگی') } });
console.log('melketun requests by Sarmasti (actorNameNorm match):', hisReqs, '| bogus name:', bogusReqs);

// listings: his own via realtorNameNorm
const hisListings = await p.propertyRecord.count({ where: { tenantId: 'melketun', realtorNameNorm: sarmastiNorm } });
console.log('melketun listings by Sarmasti (realtorNameNorm match):', hisListings);

// PII rows ownership: 50 filings with rawOwnerName — all his?
const piiWrong = await p.propertyRecord.count({ where: { tenantId: 'melketun', rawOwnerName: { not: null }, NOT: { realtorNameNorm: sarmastiNorm } } });
console.log('filings with owner data NOT registered by Sarmasti:', piiWrong);
const piiWrongReq = await p.requestRecord.count({ where: { tenantId: 'melketun', customerMobile: { not: null }, NOT: { actorNameNorm: sarmastiNorm } } });
console.log('requests with applicant mobile NOT registered by Sarmasti:', piiWrongReq);

// tabriz: does realtorNameNorm equality work? (e.g. top realtor)
const t = await p.propertyRecord.findFirst({ where: { tenantId: 'melk-tabriz', realtorNameNorm: { not: null } }, select: { ownerName: true, realtorNameNorm: true } });
const tMatch = await p.propertyRecord.count({ where: { tenantId: 'melk-tabriz', realtorNameNorm: t.realtorNameNorm } });
console.log('tabriz realtor sample:', JSON.stringify(t), '→ rows with exact norm match:', tMatch);
await p.$disconnect();
