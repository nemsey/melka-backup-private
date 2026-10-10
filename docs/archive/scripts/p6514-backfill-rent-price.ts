/** پشتیبان‌گیری مبلغ اجاره — از rawInfoJson ذخیره‌شده (صفر فراخوانی API) */
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL ?? "file:/home/z/my-project/db/custom.db" } } });
async function main() {
  const { mapTxInfoPayload } = await import("../src/lib/melk-api/tx-info-enrichment");
  const rows = await db.transactionEnrichment.findMany({ where: { contractPrice: null }, select: { txId: true, rawInfoJson: true } });
  let updated = 0;
  for (const r of rows) {
    try {
      const raw = JSON.parse(r.rawInfoJson ?? "{}");
      const remapped = mapTxInfoPayload(r.txId, raw);
      if (remapped.contractPrice !== null && remapped.contractPrice !== undefined) {
        await db.transactionEnrichment.update({
          where: { txId: r.txId },
          data: { contractPrice: remapped.contractPrice, rawContractPrice: remapped.rawContractPrice },
        });
        updated += 1;
      }
    } catch { /* ردیف خراب — بی‌صدا رد */ }
  }
  console.log(`backfill: ${updated}/${rows.length} rent rows got contractRent as amount`);
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); }).finally(() => db.$disconnect());
