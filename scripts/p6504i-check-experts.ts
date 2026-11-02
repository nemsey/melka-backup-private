process.env.DATABASE_URL = "file:/home/z/my-project/db/custom.db";
export {};
async function main() {
  const { db } = await import("@/lib/db");
  const sample = await db.expertRecord.findMany({ take: 5, orderBy: { syncedAt: "desc" } });
  for (const s of sample) console.log(JSON.stringify({ id: s.id.slice(0, 24), pc: s.personnelCode, name: s.fullName, mobile: s.mobile, role: s.role, biz: s.businessTitle, rawName: s.rawFullName }));
  const empty = await db.expertRecord.count({ where: { personnelCode: "" } });
  const total = await db.expertRecord.count();
  const distinctNames = await db.expertRecord.groupBy({ by: ["fullName"], _count: true }).then((g) => g.length);
  console.log(JSON.stringify({ total, emptyCode: empty, distinctNames }));
  process.exit(0);
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
