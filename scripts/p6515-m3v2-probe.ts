#!/usr/bin/env bun
/**
 * p6515-m3v2-probe.ts — BLOCK 0 (ملکا-شورا-۱۴۰۵-۰۱۸)
 * کاوش دادهٔ واقعی: توزیع نوع قرارداد در TransactionEnrichment + نمونه‌ها
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL ?? "file:/home/z/my-project/db/custom.db" } } });

async function main() {
  const totalTx = await db.transactionRecord.count();
  const totalEnrich = await db.transactionEnrichment.count();
  console.log("TransactionRecord:", totalTx, "| TransactionEnrichment:", totalEnrich);

  // توزیع دقیق contractType در جدول غنی‌سازی (با نمایش بایت‌های یونیکد برای فاصله/نیم‌فاصله)
  const rows = await db.transactionEnrichment.findMany({ select: { contractType: true } });
  const dist = new Map<string, number>();
  for (const r of rows) {
    const k = r.contractType === null ? "«null»" : r.contractType === "" ? "«empty»" : r.contractType;
    dist.set(k, (dist.get(k) ?? 0) + 1);
  }
  console.log("\n--- توزیع contractType (TransactionEnrichment) ---");
  for (const [k, c] of [...dist.entries()].sort((a, b) => b[1] - a[1])) {
    // نمایش کدهای کاراکترهای فاصله‌مانند
    const codes = [...k].map((ch) => {
      const cp = ch.codePointAt(0)!;
      return cp === 0x20 ? "[SPACE]" : cp === 0x200c ? "[ZWNJ]" : cp > 0x2000 && cp < 0x2070 ? `[U+${cp.toString(16)}]` : ch;
    }).join("");
    console.log(`${JSON.stringify(k)} → ${c}  | chars: ${codes}`);
  }

  // نمونهٔ rawInfoJson برای ۳ رکورد با نوع‌های مختلف
  const samples = await db.transactionEnrichment.findMany({
    where: { contractType: { not: null } },
    select: { txId: true, contractType: true, contractPrice: true, sellerName: true, buyerName: true, realtorSharesJson: true },
    take: 6,
  });
  console.log("\n--- نمونه‌ها ---");
  for (const s of samples) console.log(JSON.stringify(s, null, 1).slice(0, 500));

  // قراردادها (ContractRecord) هم برای مقایسه
  const contracts = await db.contractRecord.findMany({ select: { contractType: true } });
  const cdist = new Map<string, number>();
  for (const c of contracts) {
    const k = c.contractType === null ? "«null»" : c.contractType === "" ? "«empty»" : c.contractType;
    cdist.set(k, (cdist.get(k) ?? 0) + 1);
  }
  console.log("\n--- توزیع contractType (ContractRecord) ---");
  for (const [k, c] of cdist) console.log(`${JSON.stringify(k)} → ${c}`);

  // بازهٔ تاریخ contractDate
  const dates = await db.transactionRecord.findMany({ select: { contractDate: true }, orderBy: { contractDate: "asc" } });
  if (dates.length) {
    console.log("\ncontractDate min:", dates[0].contractDate, "| max:", dates[dates.length - 1].contractDate);
  }
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); }).finally(() => db.$disconnect());
