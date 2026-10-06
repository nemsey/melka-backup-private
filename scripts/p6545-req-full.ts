import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  const r = await db.requestRecord.findFirst({ where: { source: 'arm', status: 'فرصت' } });
  if (r) console.log(JSON.stringify(r, null, 1).slice(0, 2200));
}
main().finally(() => db.$disconnect());
