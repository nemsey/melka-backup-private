/**
 * PN-004 Phase 0-A — کاوش همگامی بزرگ (۱۰٬۰۰۰ رکورد — سناریو H)
 * نوشتن واقعی ۱۰هزار رکورد در پایگاه تست (test.db — ایزوله از production)
 * از طریق همان الگوی مخزن bulk، با پاک‌سازی کامل پس از سنجه.
 * خروجی: زمان، رکورد/ثانیه، heap، rss.
 */
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const MB = 1048576;
const N = 10_000;
const BATCH = 500;
const PREFIX = "pn004-bench";
const round = (x: number) => Math.round(x * 10) / 10;

function mem() {
  const m = process.memoryUsage();
  return { heapUsedMB: round(m.heapUsed / MB), heapTotalMB: round(m.heapTotal / MB), externalMB: round(m.external / MB), rssMB: round(m.rss / MB) };
}

async function main() {
  console.log(JSON.stringify({ phase: "start", db: "test.db (isolated)", n: N, batch: BATCH, mem: mem() }));

  // پاک‌سازی ردیف‌های احتمالی اجرای قبلی
  await p.transactionRecord.deleteMany({ where: { id: { startsWith: PREFIX } } });

  const t0 = Date.now();
  let written = 0;
  for (let b = 0; b < N / BATCH; b++) {
    await p.$transaction(
      async (tx) => {
        for (let i = 0; i < BATCH; i++) {
          const id = `${PREFIX}-${b * BATCH + i}`;
          await tx.transactionRecord.upsert({
            where: { id },
            create: {
              id,
              contractDate: new Date(2025, (i % 12), ((i % 27) + 1)),
              propertyCode: `P-${i % 997}`,
              propertyCustomer: `فروشنده ${i}`,
              requestCode: `R-${i % 613}`,
              requestCustomer: `خریدار ${i}`,
              contractHolo: `H-${100000 + i}`,
              suggestedPropertyCount: i % 7,
              eventsCount: i % 5,
              ownerCode: `E-${i % 89}`,
              branchId: `B-${i % 12}`,
              sourceRunId: `${PREFIX}-run`,
              rawDate: `1405/0${(i % 9) + 1}/1${i % 9}`,
              rawPropertyCustomer: ` فروشنده  ${i} `,
              rawRequestCustomer: ` خریدار  ${i} `,
              extractionBatchId: `${PREFIX}-run`,
            },
            update: { suggestedPropertyCount: i % 7 },
          });
        }
      },
      { timeout: 60_000 }
    );
    written += BATCH;
  }
  const writeMs = Date.now() - t0;

  const count = await p.transactionRecord.count({ where: { id: { startsWith: PREFIX } } });

  // خواندن کل ۱۰هزار رکورد (سمت read همگامی)
  const t1 = Date.now();
  const all = await p.transactionRecord.findMany({ where: { id: { startsWith: PREFIX } } });
  const readMs = Date.now() - t1;

  // پاک‌سازی نهایی (بازگرداندن test.db به وضعیت قبل)
  const t2 = Date.now();
  await p.transactionRecord.deleteMany({ where: { id: { startsWith: PREFIX } } });
  const cleanupMs = Date.now() - t2;

  console.log(JSON.stringify({
    phase: "done",
    written,
    verifiedCount: count,
    readBack: all.length,
    writeMs, readMs, cleanupMs, totalMs: writeMs + readMs + cleanupMs,
    recordsPerSec: Math.round((N / (writeMs / 1000))),
    payloadMB: round(JSON.stringify(all).length / MB),
    finalMem: mem(),
  }));
  await p.$disconnect();
}

main().catch((e) => { console.error("BENCH-ERROR", String(e).slice(0, 300)); process.exit(1); });
