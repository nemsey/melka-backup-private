import { PrismaClient } from "@prisma/client";
const db = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } } });
async function main() {
  const total = await db.transactionRecord.count();
  const enrich = await db.transactionEnrichment.count();
  const types = await db.transactionEnrichment.groupBy({ by: ["contractType"], _count: true });
  console.log(JSON.stringify({ totalTransactions: total, totalEnrichments: enrich, types: types.map(t => [t.contractType ?? "«null»", t._count]) }));
}
main().finally(() => db.$disconnect());
