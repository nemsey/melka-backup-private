// P6545 BLOCK 0 — شمارش‌های کلیدی دیتابیس (شاهد)
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  const counts: Record<string, number> = {};
  const models = ['ListingRecord','RequestRecord','TransactionRecord','ExpertRecord','PmPersonnelRecord','PropertyRecord','ContractRecord','CustomerRecord','AgentMemory','SyncState','SyncCheckpoint','GraphNode','GraphEdge','SyncJobState','OpportunityAlert'] as const;
  for (const m of models) {
    try { counts[m] = await (db as any)[m].count(); } catch { counts[m] = -1; }
  }
  console.log(JSON.stringify(counts, null, 2));
  const l = await db.propertyRecord.findFirst({ select: { propertyCode: true, tradeTypeName: true, price: true, areaName: true, meterage: true, propertyTypeName: true, status: true, createdAt: true, ownerName: true } });
  console.log('sampleProperty:', JSON.stringify(l));
  const r = await db.requestRecord.findFirst({ select: { id: true, tradeTypeName: true, priceFrom: true, priceTo: true, areaNamesJson: true, propertyTypeName: true, status: true, customerName: true } });
  console.log('sampleRequest:', JSON.stringify(r));
  const t = await db.transactionRecord.findFirst({ select: { id: true, propertyCode: true, contractDate: true, propertyCustomer: true, requestCode: true, ownerCode: true, syncedAt: true } });
  console.log('sampleTx:', JSON.stringify(t));
  const e = await db.expertRecord.findFirst({ select: { personnelCode: true, fullName: true, branchId: true, role: true, businessTitle: true, mobile: true } });
  console.log('sampleExpert:', JSON.stringify(e));
}
main().finally(() => db.$disconnect());
