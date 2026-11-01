// PN-005: Check meterage fill + prediction-readiness of current data
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } } });

async function main() {
  const props = await prisma.propertyRecord.count();
  const withMeterage = await prisma.propertyRecord.count({ where: { meterage: { not: null } } });
  const withPrice = await prisma.propertyRecord.count({ where: { price: { not: null } } });
  const withPPM = await prisma.propertyRecord.count({ where: { pricePerMeter: { not: null } } });
  console.log(`PropertyRecord: ${props}`);
  console.log(`  meterage: ${withMeterage} (${props ? ((withMeterage / props) * 100).toFixed(1) : 0}%)`);
  console.log(`  price: ${withPrice}`);
  console.log(`  pricePerMeter: ${withPPM}`);
  // Reverse-fill candidates: price & ppm present but meterage null
  const cands = await prisma.propertyRecord.count({
    where: { meterage: null, price: { not: null }, pricePerMeter: { gt: 0 } },
  });
  console.log(`  reverse-fill candidates (price+ppm, no meterage): ${cands}`);
  const reqs = await prisma.requestRecord.count();
  console.log(`RequestRecord: ${reqs}`);
  const txs = await prisma.transactionRecord.count();
  console.log(`TransactionRecord: ${txs}`);
  // sample one property to check fields naming
  const sample = await prisma.propertyRecord.findFirst({
    select: { propertyCode: true, meterage: true, price: true, pricePerMeter: true, areaName: true },
  });
  console.log("sample:", JSON.stringify(sample));
}

main().finally(() => prisma.$disconnect());
