// PN-005: Compare all three DBs + env.platform.json
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";

const urls = [
  ["custom.db", "file:/home/z/my-project/db/custom.db"],
  ["test.db", "file:/home/z/my-project/db/test.db"],
  ["test-repository.db", "file:/home/z/my-project/db/test-repository.db"],
];

for (const [name, url] of urls) {
  console.log(`\n===== ${name} =====`);
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const tables: [string, string][] = [
      ["GraphNode", "graphNode"],
      ["GraphEdge", "graphEdge"],
      ["Listing", "listing"],
      ["Request", "request"],
      ["Transaction", "transaction"],
      ["Expert", "expert"],
      ["AppMeta", "appMeta"],
      ["OpportunityAlert", "opportunityAlert"],
    ];
    for (const [label, model] of tables) {
      try {
        const countModel = model as keyof typeof prisma;
        const n = await (prisma[countModel] as { count: () => Promise<number> }).count();
        console.log(`${label}: ${n}`);
      } catch {
        console.log(`${label}: (table missing)`);
      }
    }
    if (name === "custom.db") {
      const meta = await prisma.appMeta.findUnique({ where: { id: "singleton" } });
      console.log("custom.db AppMeta.masterCodeHash:", meta?.masterCodeHash ? "PRESENT" : "ABSENT");
    }
  } finally {
    await prisma.$disconnect();
  }
}

console.log("\n===== env.platform.json (masked) =====");
try {
  const raw = JSON.parse(readFileSync("/home/z/my-project/env.platform.json", "utf8"));
  const mask = (v: unknown) =>
    typeof v === "string" && /code|secret|token|key/i.test("") ? v : v;
  const clone: Record<string, unknown> = { ...raw };
  for (const k of Object.keys(clone)) {
    if (/code|secret|token|key/i.test(k)) {
      const v = String(clone[k]);
      clone[k] = v.length > 4 ? v.slice(0, 2) + "***" : "***";
    }
  }
  console.log(JSON.stringify(clone, null, 2).slice(0, 2000));
} catch (e) {
  console.log("env.platform.json read error:", (e as Error).message);
}
