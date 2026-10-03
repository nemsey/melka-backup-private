#!/usr/bin/env bun
/**
 * deploy-b3b4-backup.ts — بکاپ گرم پایگاه production پیش از استقرار B.3+B.4
 * الگوی مرجع P6.5-02: VACUUM INTO + md5 + integrity_check + شمارش ردیف‌های کلیدی
 * اجرا: bun run scripts/deploy-b3b4-backup.ts
 */
import { createHash } from "node:crypto";
import { readFileSync, existsSync, statSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const DB = "/home/z/my-project/db/custom.db";
const OUT = "/home/z/my-project/db/custom.backup-pre-deploy-b3b4.db";

const p = new PrismaClient({ datasources: { db: { url: `file:${DB}` } } });

if (existsSync(OUT)) {
  console.error(`فایل بکاپ از قبل موجود است — برای جلوگیری از بازنویسی، ابتدا جابه‌جا/حذف شود: ${OUT}`);
  process.exit(1);
}

console.log(`[1/4] VACUUM INTO → ${OUT}`);
const t0 = Date.now();
await p.$executeRawUnsafe(`VACUUM INTO '${OUT}'`);
const ms = Date.now() - t0;

console.log(`[2/4] integrity_check روی فایل بکاپ...`);
const p2 = new PrismaClient({ datasources: { db: { url: `file:${OUT}` } } });
const ic = (await p2.$queryRawUnsafe(`PRAGMA integrity_check`)) as Array<{ integrity_check: string }>;
const integrity = ic[0]?.integrity_check ?? "unknown";

console.log(`[3/4] شمارش ردیف‌های کلیدی (بکاپ)...`);
const counts = {
  sessions: await p2.session.count(),
  auditLogs: await p2.auditLog.count(),
  experts: await p2.expertRecord.count(),
  transactions: await p2.transactionRecord.count(),
  interactions: await p2.interactionRecord.count(),
  visits: await p2.visitRecord.count(),
  contracts: await p2.contractRecord.count(),
  listings: await p2.listingRecord.count(),
  customers: await p2.customerRecord.count(),
  properties: await p2.propertyRecord.count(),
  supplyDemand: await p2.supplyDemandRecord.count(),
};

console.log(`[4/4] md5 فایل بکاپ...`);
const md5 = createHash("md5").update(readFileSync(OUT)).digest("hex");
const size = statSync(OUT).size;

await p2.$disconnect();
await p.$disconnect();

console.log(`\n=== بکاپ گرم انجام شد ===`);
console.log(`فایل:            ${OUT}`);
console.log(`حجم:             ${(size / 1024 / 1024).toFixed(2)} MB`);
console.log(`md5:             ${md5}`);
console.log(`integrity_check: ${integrity}`);
console.log(`مدت VACUUM:      ${ms} ms`);
console.log(`ردیف‌ها:          ${JSON.stringify(counts)}`);
if (integrity !== "ok") {
  console.error("خطا: integrity_check روی بکاپ ok نیست!");
  process.exit(2);
}
