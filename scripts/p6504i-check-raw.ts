process.env.DATABASE_URL = "file:/home/z/my-project/db/custom.db";
export {};
async function main() {
  const { db } = await import("@/lib/db");
  const txTotal = await db.transactionRecord.count();
  const txRaw = await db.transactionRecord.count({ where: { rawDate: { not: null } } });
  const txProv = await db.transactionRecord.count({ where: { extractedAt: { not: null } } });
  const exTotal = await db.expertRecord.count();
  const exRaw = await db.expertRecord.count({ where: { rawFullName: { not: null } } });
  const sample = await db.transactionRecord.findFirst({ orderBy: { contractDate: "asc" } });
  console.log(JSON.stringify({ txTotal, txRaw, txProv, exTotal, exRaw, oldest: sample?.contractDate?.toISOString(), oldestRaw: sample?.rawDate }));
  process.exit(0);
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
