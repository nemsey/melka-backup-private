/**
 * بازتولید شاهدهای حلقهٔ سرنوشت (outcomes.jsonl / predictions.jsonl)
 * پس از بازنشانی محیط — عین منطق persistEvidence دیمن (PN-003 گام ۵).
 */
import { PrismaClient } from "@prisma/client";
import { mkdirSync, existsSync, appendFileSync, writeFileSync } from "node:fs";

const db = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } } });
const DIR = "/home/z/my-project/intelligence-data";
const PRED = `${DIR}/predictions.jsonl`;
const OUT = `${DIR}/outcomes.jsonl`;
const LATEST = `${DIR}/loop-latest.json`;

const { runOutcomeLoop } = await import("../src/lib/intelligence/outcome-loop");

const result = await runOutcomeLoop(db, new Date());

mkdirSync(DIR, { recursive: true });
if (!existsSync(PRED)) {
  for (const p of result.predictions) appendFileSync(PRED, `${JSON.stringify(p)}\n`, "utf8");
}
if (!existsSync(OUT)) {
  for (const o of result.outcomes) appendFileSync(OUT, `${JSON.stringify(o)}\n`, "utf8");
}
writeFileSync(LATEST, `${JSON.stringify(result.summary, null, 2)}\n`, "utf8");

console.log("predictions:", result.predictions.length);
console.log("outcomes:", result.outcomes.length);
console.log("summary:", JSON.stringify(result.summary.predictions), "پیش‌بینی ·", result.summary.positiveOutcomes, "مثبت ·", result.summary.negativeOutcomes, "منفی");
await db.$disconnect();
