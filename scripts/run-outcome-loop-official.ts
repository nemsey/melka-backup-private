/**
 * اجرای رسمی حلقهٔ سرنوشت روی پایگاه واقعی + نوشتن شاهدهای ماندگار
 * (intelligence-data/) — پیش از کامیت. خروجی: خلاصهٔ صادقانه برای گزارش.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } } });

const { ensureBrainData, daemonHealth } = await import("../src/lib/intelligence/daemon");

const summary = await ensureBrainData(db, { maxAgeMs: 0 });

console.log("=== حلقهٔ سرنوشت — دادهٔ واقعی ARM (شاهد ماندگار نوشته شد) ===");
console.log(`پیش‌بینی: ${summary.predictions} | مثبت: ${summary.positiveOutcomes} | منفی: ${summary.negativeOutcomes} | پیوند: ${summary.linked}`);
const ev = summary.evaluation;
console.log(`Brier: ${ev.brierScore} | Lift: ${ev.lift} | نمونه: ${ev.sampleSize} | حکم: ${ev.verdict}`);
console.log(`کالیبراسیون: ${JSON.stringify(ev.calibration)}`);
console.log(`دیمن: ${JSON.stringify(daemonHealth())}`);
console.log(`مدل: ${summary.reproduction.modelVersion}`);

await db.$disconnect();
