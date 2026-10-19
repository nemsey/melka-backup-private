import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const [tx, contracts] = await Promise.all([
  db.transactionRecord.count(),
  db.contractRecord.count(),
]);
console.log(JSON.stringify({ transactionRecords: tx, contractRecords: contracts }));
const sample = await db.transactionRecord.findFirst({ orderBy: { contractDate: "desc" } });
console.log("latest:", sample ? `${sample.propertyCode} @ ${sample.contractDate.toISOString()}` : "NONE");
await db.$disconnect();
process.exit(0);
