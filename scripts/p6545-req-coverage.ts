import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  const total = await db.requestRecord.count();
  const enriched = await db.requestRecord.count({ where: { OR: [{ priceFrom: { not: null } }, { tradeTypeName: { not: null } }] } });
  const withArea = await db.requestRecord.count({ where: { areaNamesJson: { not: null } } });
  const withTitle = await db.requestRecord.count({ where: { title: { not: null } } });
  console.log(`requestRecord: total=${total} enriched(price/trade)=${enriched} withArea=${withArea} withTitle=${withTitle}`);
  const e = await db.requestRecord.findFirst({ where: { priceFrom: { not: null } }, orderBy: { updatedAt: 'desc' } });
  if (e) console.log('enriched sample:', JSON.stringify({ title: e.title, tradeTypeName: e.tradeTypeName, propertyTypeName: e.propertyTypeName, priceFrom: e.priceFrom, priceTo: e.priceTo, areaNamesJson: e.areaNamesJson, inputs: e.inputsJson?.slice(0, 300) }, null, 1));
  // توزیع tradeTypeName در کل
  const all = await db.requestRecord.findMany({ select: { tradeTypeName: true, status: true, source: true } });
  const dist: Record<string, number> = {};
  for (const q of all) { const k = `${q.tradeTypeName || 'null'}`; dist[k] = (dist[k] || 0) + 1; }
  console.log('tradeTypeName dist(all):', JSON.stringify(dist));
  const sd: Record<string, number> = {};
  for (const q of all) { sd[q.source] = (sd[q.source] || 0) + 1; }
  console.log('source dist:', JSON.stringify(sd));
  const std: Record<string, number> = {};
  for (const q of all) { std[q.status] = (std[q.status] || 0) + 1; }
  console.log('status dist:', JSON.stringify(std));
}
main().finally(() => db.$disconnect());
