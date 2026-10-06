/**
 * اجرای آزمایشی حلقهٔ سرنوشت روی دادهٔ واقعی — خروجی: خلاصهٔ صادقانه
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } } });

const { runOutcomeLoop } = await import("../src/lib/intelligence/outcome-loop");

const now = new Date();
const result = await runOutcomeLoop(db, now);

console.log("=== خلاصهٔ حلقهٔ سرنوشت (دادهٔ واقعی ARM) ===");
console.log(`پیش‌بینی‌ها: ${result.summary.predictions}`);
console.log(`پیامد مثبت (معامله شده): ${result.summary.positiveOutcomes}`);
console.log(`پیامد منفی (منتشر شده): ${result.summary.negativeOutcomes}`);
console.log(`پیوندشده: ${result.summary.linked}`);
console.log(`--- ارزیابی صادقانه ---`);
console.log(JSON.stringify(result.summary.evaluation, null, 1));

const ev = result.summary.evaluation;
if (typeof ev.brierScore === "number" && typeof ev.lift === "number") {
  const base = ev.brierScore / (1 - ev.lift); // بازسازی Brier خط پایه از lift
  console.log(`Brier مدل: ${ev.brierScore} | Brier خط پایه (نرخ پایه): ${base.toFixed(4)} | Lift: ${(ev.lift * 100).toFixed(2)}% | حکم: ${ev.verdict}`);
}

await db.$disconnect();
