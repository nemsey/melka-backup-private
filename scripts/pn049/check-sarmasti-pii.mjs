import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } });
// 50 filings with rawOwnerName — who is their expert/agency (ownerName)?
const f50 = await p.propertyRecord.findMany({ where: { tenantId: 'melketun', rawOwnerName: { not: null } }, select: { ownerName: true, armBranchTitle: true }, take: 100 });
const fExperts = [...new Set(f50.map(r => r.ownerName))];
console.log('50 filings with real owner data — expert/agency values:', JSON.stringify(fExperts));
// 19 requests with customerMobile — who registered them (actorName)?
const r19 = await p.requestRecord.findMany({ where: { tenantId: 'melketun', customerMobile: { not: null } }, select: { actorName: true, actorCode: true, armBranchTitle: true }, take: 100 });
const rActors = [...new Set(r19.map(r => `${r.actorName} (${r.actorCode})`))];
console.log('19 requests with applicant mobile — registrar (actorName/actorCode):', JSON.stringify(rActors));
// Sarmasti's expert record — which vtiger id is he?
const experts = await p.expertRecord.findMany({ where: { tenantId: 'melketun' }, select: { fullName: true, personnelCode: true, mobile: true }, take: 100 });
const sarmastiExperts = experts.filter(e => (e.fullName || '').includes('سرمستی'));
console.log('Sarmasti expert records:', JSON.stringify(sarmastiExperts, null, 1));
await p.$disconnect();
