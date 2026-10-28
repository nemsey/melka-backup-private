#!/usr/bin/env bun
/**
 * p6515-block0-backup.ts — BLOCK 0.1 (ملکا-شورا-۱۴۰۵-۰۱۸)
 * بکاپ گرم VACUUM INTO + baseline-m3-v2.json (تعداد معاملات + پوشش ۴ نوع قرارداد + md5)
 */
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL ?? "file:/home/z/my-project/db/custom.db" } } });

async function main() {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const target = `/home/z/my-project/backups/pre-m3-v2-${ts}.db`;
  // ۱) بکاپ گرم
  await db.$executeRawUnsafe(`VACUUM INTO '${target}'`);
  const md5 = createHash("md5").update(readFileSync(target)).digest("hex");
  console.log("backup:", target, "md5:", md5);

  // ۲) شمارش قبل از تغییر
  const total = await db.transactionRecord.count();
  const enrich = await db.transactionEnrichment.findMany({ select: { contractType: true } });
  const kindCount = { "مبایعه نامه": 0, "پیش فروش": 0, "اجاره نامه": 0, "تمدید اجاره": 0, null: 0, other: 0 };
  for (const e of enrich) {
    const t = e.contractType;
    if (t === null || t === "") kindCount.null += 1;
    else if (kindCount.hasOwnProperty(t)) (kindCount as Record<string, number>)[t] += 1;
    else kindCount.other += 1;
  }

  const family = {
    sale: kindCount["مبایعه نامه"] + kindCount["پیش فروش"],
    rent: kindCount["اجاره نامه"] + kindCount["تمدید اجاره"],
    none: kindCount.null + kindCount.other,
  };
  const familySumCheck = family.sale + family.rent + family.none;
  const baseline = {
    kind: "BEFORE (baseline) — ملکا-شورا-۱۴۰۵-۰۱۸",
    generatedAt: new Date().toISOString(),
    backup: { path: target, md5 },
    totalTransactions: total,
    totalEnrichments: enrich.length,
    contractTypeRaw: kindCount,
    // نگاشت خانواده (قانون انواع معاملات ملکا)
    family: { ...family, sumCheck: familySumCheck },
  };
  writeFileSync("/home/z/my-project/baseline-m3-v2.json", JSON.stringify(baseline, null, 2), "utf8");
  console.log(JSON.stringify(baseline, null, 2));
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); }).finally(() => db.$disconnect());
