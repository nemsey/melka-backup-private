process.env.DATABASE_URL = "file:/home/z/my-project/db/custom.db";
export {};
async function main() {
  const { db } = await import("@/lib/db");
  const rows = await db.auditLog.findMany({ where: { action: "owner.read" }, orderBy: { createdAt: "desc" }, take: 8 });
  for (const r of rows) console.log("OWNER.READ:", r.createdAt.toISOString(), "|", r.actor, "|", r.detail);
  process.exit(0);
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
