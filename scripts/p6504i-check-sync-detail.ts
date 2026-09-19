process.env.DATABASE_URL = "file:/home/z/my-project/db/custom.db";
export {};
async function main() {
  const { db } = await import("@/lib/db");
  const st = await db.syncState.findUnique({ where: { id: "singleton" } });
  console.log("cursor:", st?.lastSyncCursor);
  const dl = await db.syncDeadLetter.findMany({ take: 10 });
  console.log("deadLetters:", dl.length, dl.slice(0, 3).map(d => ({ entity: d.entity, key: d.naturalKey, err: (d.lastError||"").slice(0,80), resolved: !!d.resolvedAt })));
  const ex = await db.expertRecord.count();
  const exDistinct = await db.expertRecord.groupBy({ by: ["personnelCode"], _count: true }).then(g => g.length);
  const exEmpty = await db.expertRecord.count({ where: { OR: [{ personnelCode: "" }, { personnelCode: null }] } });
  console.log(JSON.stringify({ experts: ex, distinctCodes: exDistinct, emptyCodes: exEmpty }));
  process.exit(0);
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
