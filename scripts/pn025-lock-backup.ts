// PN-025 / مرحلهٔ ۱ — قفل داده: بکاپ VACUUM + MD5 + شمارش رکوردها
import { PrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";
import { mkdirSync, existsSync, statSync, createReadStream } from "node:fs";
import { createHash } from "node:crypto";

const db = new PrismaClient();
const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19) + "Z";
const target = `backups/pre-pn025-${ts}.db`;

async function main() {
  // ۱) VACUUM INTO — بکاپ فشرده و سازگار
  await db.$queryRawUnsafe(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  const size = statSync(target).size;
  // ۲) MD5
  const md5 = await new Promise<string>((resolve, reject) => {
    const h = createHash("md5");
    createReadStream(target).on("data", (c) => h.update(c)).on("end", () => resolve(h.digest("hex"))).on("error", reject);
  });
  // ۳) شمارش رکوردها (قفل داده)
  const [listings, requests, transactions, causal, memory] = await Promise.all([
    db.propertyRecord.count(),
    db.requestRecord.count(),
    db.transactionRecord.count(),
    db.causalEdgeRecord.count(),
    (db as unknown as { memoryLifecycle?: { count(): Promise<number> } }).memoryLifecycle?.count().catch(() => 0) ?? 0,
  ]);
  const result = { target, sizeMB: Math.round(size / 1048576), md5, counts: { listings, requests, transactions, causal, memory }, takenAt: new Date().toISOString() };
  console.log(JSON.stringify(result, null, 2));
}

main().finally(() => db.$disconnect());
