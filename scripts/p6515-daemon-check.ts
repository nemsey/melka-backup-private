import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const props = await db.propertyRecord.count();
  const propsEnr = await db.propertyRecord.count({ where: { extractionBatchId: { not: null } } });
  const reqs = await db.requestRecord.count({ where: { source: 'arm' } });
  const reqEnr = await db.requestRecord.count({ where: { source: 'arm', OR: [{ customerName: { not: null } }, { customerMobile: { not: null } }] } });
  console.log(JSON.stringify({ props, propsEnr, armRequests: reqs, reqEnr }));
}
main().finally(() => db.$disconnect());
