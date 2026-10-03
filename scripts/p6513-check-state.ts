import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  const tx = await db.transactionRecord.count();
  const ex = await db.expertRecord.count();
  const exMobile = await db.expertRecord.count({ where: { mobile: { not: '—' } } });
  const ct = await db.contractRecord.count();
  const ctPrice = await db.contractRecord.count({ where: { contractPrice: { not: null } } });
  const props = await db.propertyRecord.count();
  const propsEnriched = await db.propertyRecord.count({ where: { extractionBatchId: { not: null } } });
  const propsOwner = await db.propertyRecord.count({ where: { OR: [{ ownerName: { not: null } }, { ownerMobile: { not: null } }] } });
  const reqs = await db.requestRecord.count({ where: { source: 'arm' } });
  const reqEnriched = await db.requestRecord.count({ where: { source: 'arm', OR: [{ customerName: { not: null } }, { customerMobile: { not: null } }] } });
  const reqActor = await db.requestRecord.count({ where: { source: 'arm', actorName: { not: null } } });
  const pm = await db.pmPersonnelRecord.count();
  const sp = await db.specialPropertyRecord.count();
  const spDetailed = await db.specialPropertyRecord.count({ where: { propertyCode: { not: null } } });
  console.log(JSON.stringify({
    tx, ex, exMobile, ct, ctPrice,
    props, propsEnriched, propsOwner,
    armReqs: reqs, reqEnriched, reqActor,
    pm, sp, spDetailed
  }, null, 1));
  // checkpoint state
  const cps = await db.syncCheckpoint.findMany();
  for (const cp of cps) console.log('CHECKPOINT', JSON.stringify(cp));
  // arm connection
  const arm = await db.armConnection.findFirst();
  console.log('ARM connection:', arm ? `ownerKey=${arm.ownerKey} updated=${arm.updatedAt}` : 'NONE');
  const pmc = await db.pmConnection.findFirst();
  console.log('PM connection:', pmc ? `updated=${pmc.updatedAt}` : 'NONE');
}
main().finally(() => db.$disconnect());
