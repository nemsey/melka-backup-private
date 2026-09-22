import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  // کارگزاری: چند تا propertyCode دارند؟
  const sp = await db.specialPropertyRecord.findMany({ select: { propertyCode: true, propertyId: true, realtorName: true, payPercent: true } });
  const withCode = sp.filter(s => s.propertyCode).length;
  const withPropId = sp.filter(s => s.propertyId).length;
  console.log(`کارگزاری: ${sp.length} total · with propertyCode: ${withCode} · with propertyId: ${withPropId}`);
  // تطبیق با معاملات
  const txs = await db.transactionRecord.findMany({ select: { propertyCode: true } });
  const txPropCodes = new Set(txs.map(t => t.propertyCode));
  const spCodes = new Set(sp.map(s => s.propertyCode).filter(Boolean) as string[]);
  let matched = 0;
  for (const c of spCodes) if (txPropCodes.has(c)) matched++;
  console.log(`کارگزاری codes matching transactions: ${matched}/${spCodes.size}`);
  // پرسنل PM: نمونه
  const pm = await db.pmPersonnelRecord.findMany({ take: 3, select: { code: true, fullName: true, mobileNumber: true, roleTitle: true } });
  console.log('PM samples:', JSON.stringify(pm, null, 1));
  // قرارداد با مبلغ
  const ct = await db.contractRecord.findFirst({ select: { contractPrice: true, rawContractPrice: true, contractType: true, businessId: true, realtorListJson: true } });
  console.log('contract:', JSON.stringify({ ...ct, realtorListJson: ct?.realtorListJson?.slice(0, 200) }, null, 1));
  // کارشناسان: موبایل نمونه
  const ex = await db.expertRecord.findMany({ take: 3, select: { fullName: true, mobile: true, personnelCode: true } });
  console.log('experts:', JSON.stringify(ex, null, 1));
  // تطبیق PM↔ARM کل
  const pmIds = new Set((await db.pmPersonnelRecord.findMany({ select: { id: true } })).map(p => p.id));
  const armExperts = await db.expertRecord.findMany({ select: { id: true, fullName: true } });
  const idMatch = armExperts.filter(e => pmIds.has(e.id)).length;
  console.log(`PM↔ARM _id match: ${idMatch}/${armExperts.length}`);
}
main().finally(() => db.$disconnect());
