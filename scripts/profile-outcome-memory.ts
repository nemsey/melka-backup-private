/**
 * پروفایل حافظهٔ حلقهٔ سرنوشت (PN-003 — تشخیص عامل تورم حافظه)
 */
const before = process.memoryUsage();
console.log("before:", Math.round(before.rss / 1024 / 1024), "MB rss ·", Math.round(before.heapUsed / 1024 / 1024), "MB heap");

import { PrismaClient } from "@prisma/client";
const db = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } } });

const { runOutcomeLoop } = await import("../src/lib/intelligence/outcome-loop");
const t0 = Date.now();
const result = await runOutcomeLoop(db, new Date());
const t1 = Date.now();

const after = process.memoryUsage();
console.log("after loop:", Math.round(after.rss / 1024 / 1024), "MB rss ·", Math.round(after.heapUsed / 1024 / 1024), "MB heap");
console.log("duration:", t1 - t0, "ms · predictions:", result.predictions.length);
await db.$disconnect();
