import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  const reqs = await db.requestRecord.findMany({ take: 200, where: { status: 'ready' } });
  const withPrice = reqs.filter(r => r.priceFrom || r.priceTo);
  console.log(`ready با بازهٔ قیمت: ${withPrice.length}/${reqs.length}`);
  const r = withPrice[0] || reqs[0];
  console.log('sample:', JSON.stringify({ tradeTypeName: r.tradeTypeName, propertyTypeName: r.propertyTypeName, buildingTypeName: r.buildingTypeName, priceFrom: r.priceFrom, priceTo: r.priceTo, areaNamesJson: r.areaNamesJson, inputs: r.inputsJson?.slice(0, 400) }, null, 1));
  // توزیع tradeTypeName درخواست‌ها
  const dist: Record<string, number> = {};
  for (const q of reqs) { const k = q.tradeTypeName || 'null'; dist[k] = (dist[k] || 0) + 1; }
  console.log('tradeTypeName dist:', JSON.stringify(dist));
  const pd: Record<string, number> = {};
  for (const q of reqs) { const k = q.propertyTypeName || 'null'; pd[k] = (pd[k] || 0) + 1; }
  console.log('propertyTypeName dist:', JSON.stringify(pd));
}
main().finally(() => db.$disconnect());
