import { PrismaClient } from "@prisma/client";
const db = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } } });
async function main() {
  const sold = await db.propertyRecord.count({ where: { status: "معامله شده" } });
  const soldPriced = await db.propertyRecord.count({ where: { status: "معامله شده", price: { gt: 0 }, pricePerMeter: { gt: 0 }, meterage: { gt: 0, lt: 2000 }, areaId: { not: null }, areaName: { not: null } } });
  const pub = await db.propertyRecord.count({ where: { status: "منتشر شده", price: { gt: 0 }, pricePerMeter: { gt: 0 }, meterage: { gt: 0, lt: 2000 }, areaId: { not: null }, areaName: { not: null } } });
  console.log({ sold, soldPriced, pub });
  const sample = await db.propertyRecord.findFirst({ where: { status: "معامله شده" }, select: { propertyCode: true, price: true, pricePerMeter: true, meterage: true, areaId: true, areaName: true } });
  console.log(sample);
}
main().finally(() => db.$disconnect());
