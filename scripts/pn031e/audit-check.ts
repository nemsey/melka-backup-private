import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  // find audit log model name
  const models = Object.keys(db).filter(k => !k.startsWith("_") && !k.startsWith("$"));
  const auditModel = models.find(m => /audit/i.test(m));
  console.log("audit-ish models:", models.filter(m => /audit|log/i.test(m)));
  if (auditModel) {
    const entries = await (db as any)[auditModel].findMany({
      where: { OR: [{ action: { contains: "RELAY" } }, { action: { contains: "relay" } }] },
      orderBy: { id: "desc" }, take: 25,
    });
    console.log("=== RELAY AUDIT ENTRIES ===");
    for (const e of entries) console.log(JSON.stringify({ at: e.createdAt, action: e.action, actor: e.actorType ?? e.actor, detail: (e.detail ?? e.description ?? "").slice(0, 120) }));
  }
  await db.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
