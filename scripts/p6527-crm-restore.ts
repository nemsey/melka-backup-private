/**
 * P6527 — بازیابی جراحی جداول کش CRM از بکاپ (پس از CONNECTION_RESET مالک)
 * فقط ۶ جدول کش CRM از بکاپ pre-p6525 (آخرین بکاپ سالم با ۷۳۹ معامله) بازگردانده
 * می‌شود؛ کاتالوگ ARM (آگهی/درخواست) و بقیهٔ داده‌ها دست‌نخورده می‌مانند.
 */
import { PrismaClient } from "@prisma/client";

const mode = process.argv[2] ?? "status";
const SRC_URL = "file:/home/z/my-project/backups/pre-p6525-2026-09-26.db";
const DST_URL = "file:/home/z/my-project/db/custom.db";

const TABLES = ["transactionRecord", "expertRecord", "interactionRecord", "visitRecord", "supplyDemandRecord", "contractRecord"] as const;

async function counts(db: PrismaClient) {
  return {
    transactionRecord: await db.transactionRecord.count(),
    expertRecord: await db.expertRecord.count(),
    interactionRecord: await db.interactionRecord.count(),
    visitRecord: await db.visitRecord.count(),
    supplyDemandRecord: await db.supplyDemandRecord.count(),
    contractRecord: await db.contractRecord.count(),
  };
}

const src = new PrismaClient({ datasources: { db: { url: SRC_URL } } });
const dst = new PrismaClient({ datasources: { db: { url: DST_URL } } });

try {
  if (mode === "status") {
    console.log("SRC (pre-p6525):", JSON.stringify(await counts(src)));
    console.log("DST (current)  :", JSON.stringify(await counts(dst)));
  } else if (mode === "restore") {
    const before = await counts(dst);
    console.log("DST before:", JSON.stringify(before));
    // فقط اگر مقصد خالی است بازیابی کنیم (ایمنی — هرگز دادهٔ موجود را بازنویسی نکن)
    for (const t of TABLES) {
      if (before[t] > 0) throw new Error(`ایمنی: ${t} در مقصد ${before[t]} رکورد دارد — بازیابی فقط روی مقصد خالی`);
    }
    // انتقال رکوردها (دسته‌ای)
    const txs = await src.transactionRecord.findMany();
    const exs = await src.expertRecord.findMany();
    const ins = await src.interactionRecord.findMany();
    const vis = await src.visitRecord.findMany();
    const sds = await src.supplyDemandRecord.findMany();
    const cts = await src.contractRecord.findMany();
    console.log(`SRC rows: tx=${txs.length} experts=${exs.length} interactions=${ins.length} visits=${vis.length} sd=${sds.length} contracts=${cts.length}`);
    await dst.$transaction([
      dst.transactionRecord.createMany({ data: txs as never[] }),
      dst.expertRecord.createMany({ data: exs as never[] }),
      dst.interactionRecord.createMany({ data: ins as never[] }),
      dst.visitRecord.createMany({ data: vis as never[] }),
      dst.supplyDemandRecord.createMany({ data: sds as never[] }),
      dst.contractRecord.createMany({ data: cts as never[] }),
    ]);
    console.log("DST after :", JSON.stringify(await counts(dst)));
    console.log("RESTORE-OK");
  }
} finally {
  await src.$disconnect();
  await dst.$disconnect();
}
