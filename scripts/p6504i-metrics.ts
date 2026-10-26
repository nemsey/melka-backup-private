process.env.DATABASE_URL = "file:/home/z/my-project/db/custom.db";
export {};
async function main() {
  const { db } = await import("@/lib/db");
  const txTotal = await db.transactionRecord.count();
  const txRaw = await db.transactionRecord.count({ where: { rawDate: { not: null } } });
  const txValidDate = await db.transactionRecord.count({ where: { contractDate: { gt: new Date("2000-01-01") } } });
  const txHasEvents = await db.transactionRecord.count({ where: { eventsCount: { gt: 0 } } });
  const txHasSuggested = await db.transactionRecord.count({ where: { suggestedPropertyCount: { gt: 0 } } });
  const txHasBoth = await db.transactionRecord.count({ where: { AND: [{ eventsCount: { gt: 0 } }, { suggestedPropertyCount: { gt: 0 } }] } });
  const exTotal = await db.expertRecord.count();
  const exRawName = await db.expertRecord.count({ where: { rawFullName: { not: null } } });
  const st = await db.syncState.findUnique({ where: { id: "singleton" } });
  console.log(JSON.stringify({
    tx: { total: txTotal, rawDate: txRaw, validDate: txValidDate, hasEvents: txHasEvents, hasSuggested: txHasSuggested, hasBoth: txHasBoth },
    experts: { total: exTotal, rawName: exRawName },
    summaryJson: st?.summaryJson?.slice(0, 200),
  }, null, 1));
  process.exit(0);
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
