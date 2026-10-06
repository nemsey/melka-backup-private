/** recon-db-snapshot.ts — شواهد داده واقعی برای سند Reconnaissance (بخش D ملکا-شورا-۰۰۶)
 * فقط-خواندنی از db/custom.db (تولید). اجرا: bun scripts/recon-db-snapshot.ts */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const counts: Record<string, number> = {};
  for (const [k, m] of Object.entries({
    tx: "transactionRecord", ex: "expertRecord", in: "interactionRecord",
    vi: "visitRecord", ct: "contractRecord", pr: "propertyRecord",
    rq: "requestRecord", sd: "supplyDemandRecord",
  })) {
    counts[k] = await (db as any)[m].count();
  }
  console.log("COUNTS:", JSON.stringify(counts));

  const firstTx = await db.transactionRecord.findFirst({ orderBy: { contractDate: "asc" } });
  const lastTx = await db.transactionRecord.findFirst({ orderBy: { contractDate: "desc" } });
  console.log("FIRST_TX:", JSON.stringify(firstTx));
  console.log("LAST_TX:", JSON.stringify(lastTx));

  const firstEx = await db.expertRecord.findFirst();
  console.log("FIRST_EXPERT:", JSON.stringify(firstEx));
  const exRoles = await db.expertRecord.groupBy({ by: ["role"], _count: true });
  console.log("EXPERT_ROLES:", JSON.stringify(exRoles));

  const firstVi = await db.visitRecord.findFirst();
  console.log("FIRST_VISIT:", JSON.stringify(firstVi));
  const viStatuses = await db.visitRecord.groupBy({ by: ["status"], _count: true });
  console.log("VISIT_STATUSES:", JSON.stringify(viStatuses));

  const firstIn = await db.interactionRecord.findFirst();
  console.log("FIRST_INTERACTION:", JSON.stringify(firstIn));

  const firstCt = await db.contractRecord.findFirst();
  console.log("FIRST_CONTRACT:", JSON.stringify(firstCt));

  const firstSd = await db.supplyDemandRecord.findFirst();
  console.log("FIRST_SD:", JSON.stringify(firstSd));

  const ss = await db.syncState.findFirst();
  console.log("SYNC_STATE:", JSON.stringify(ss));
  await db.$disconnect();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
