// PN-005: Check master code hash chain in DB + env.platform.json
// (без изменения данных — только чтение)
import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";

const prisma = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } } });

async function main() {
  const meta = await prisma.appMeta.findUnique({ where: { id: "singleton" } });
  console.log("=== AppMeta (singleton) ===");
  if (!meta) {
    console.log("NO AppMeta ROW AT ALL");
  } else {
    const keys = Object.keys(meta) as (keyof typeof meta)[];
    for (const k of keys) {
      const v = meta[k];
      if (v === null || v === undefined) continue;
      const s = String(v);
      console.log(`${k}: ${s.length > 80 ? s.slice(0, 80) + "..." : s}`);
    }
  }
  const storedHash = meta?.masterCodeHash ?? null;
  console.log("\nmasterCodeHash present:", !!storedHash);
  // Check hash of expected real code 80211186 (from PN-003 history)
  const candidates = ["80211186"];
  for (const c of candidates) {
    const h = createHash("sha256").update(c, "utf8").digest("hex");
    console.log(`sha256(${c}) = ${h}`);
    if (storedHash) console.log(`  match: ${h === storedHash}`);
  }
  // Count graph tables
  try {
    const nodes = await prisma.graphNode.count();
    const edges = await prisma.graphEdge.count();
    console.log(`\nGraphNode count: ${nodes}`);
    console.log(`GraphEdge count: ${edges}`);
  } catch (e) {
    console.log("Graph tables error:", (e as Error).message);
  }
  // Count users/sessions (models may not exist in this schema)
  try {
    const sessions = await prisma.session.count();
    console.log(`\nSession count: ${sessions}`);
  } catch (e) {
    console.log("Session table error:", (e as Error).message);
  }
}

main().finally(() => prisma.$disconnect());
