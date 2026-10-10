import { getPropertyRecordRepository } from "@/core/repositories";
const P = "p6530m1";
const repo = getPropertyRecordRepository();
const r = await repo.upsertBulk([
  { id: `${P}dbg1`, propertyCode: `${P}dbg001`, ownerName: "کارشناس تست", rawOwnerName: "مالک تست", ownerMobile: "09140001111",
    price: 450_000_000, tradeTypeName: "رهن و اجاره", address: "تبریز، ولیعصر، خیابان نظامی", areaName: "ولیعصر",
    status: "منقضی شده", createdAt: new Date("2026-09-24T10:00:00Z") },
], { sourceRunId: `${P}-dbg` });
console.log("upsert stats:", r);
const byLow = await repo.listArmCatalog({ code: P, priceTo: 500_000_000 }, 100);
console.log("priceTo 500M rows:", byLow.rows.map((x: any) => x.propertyCode), "total:", byLow.total);
const byAddr = await repo.listArmCatalog({ code: P, address: "نظامی" }, 100);
console.log("address نظامی rows:", byAddr.rows.map((x: any) => x.propertyCode));
const byTrade = await repo.listArmCatalog({ code: P, tradeTypes: ["رهن و اجاره"] }, 100);
console.log("trade rows:", byTrade.rows.map((x: any) => x.propertyCode));
const { db } = await import("@/lib/db");
await db.propertyRecord.deleteMany({ where: { id: `${P}dbg1` } });
await db.$disconnect();
process.exit(0);
