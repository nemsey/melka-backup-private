import { PrismaClient } from "@prisma/client";
const db = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } } });
async function main() {
  const touched = await db.propertyRecord.findUnique({ where: { propertyCode: "59782" }, select: { title: true, meterage: true } });
  const created = await db.propertyRecord.findUnique({ where: { propertyCode: "99999999" }, select: { title: true, price: true, meterage: true, ownerName: true, areaName: true } });
  console.log("59782 title:", touched?.title, "| meterage:", touched?.meterage);
  console.log("99999999:", JSON.stringify(created));
  // پاک‌سازی دادهٔ تست: بازگردانی عنوان واقعی + حذف ردیف تازه
  await db.propertyRecord.update({ where: { propertyCode: "59782" }, data: { title: "فروش آپارتمان مسکونی ۱۵۵ متری" } });
  await db.propertyRecord.delete({ where: { propertyCode: "99999999" } });
  const after = await db.propertyRecord.count();
  console.log("cleanup done — count:", after);
}
main().finally(() => db.$disconnect());
