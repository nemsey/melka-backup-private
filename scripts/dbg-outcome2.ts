import { PrismaClient } from "@prisma/client";
const db = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } } });
async function main() {
  const total = await db.propertyRecord.count();
  const withPPM = await db.propertyRecord.count({ where: { pricePerMeter: { gt: 0 } } });
  const withPrice = await db.propertyRecord.count({ where: { price: { gt: 0 } } });
  const withMeter = await db.propertyRecord.count({ where: { meterage: { gt: 0 } } });
  const soldPPM = await db.propertyRecord.count({ where: { status: "معامله شده", OR: [{ pricePerMeter: null }, { pricePerMeter: { lte: 0 } }] } });
  console.log({ total, withPPM, withPrice, withMeter, soldPPMnull: soldPPM });
  const soldSample = await db.propertyRecord.findMany({ where: { status: "معامله شده" }, select: { propertyCode: true, price: true, pricePerMeter: true, meterage: true }, take: 5 });
  console.log(soldSample);
}
main().finally(() => db.$disconnect());
