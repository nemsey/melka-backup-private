// بازرسی وضعیت داده‌های ARM در دیتابیس
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  const reqBySource = await p.requestRecord.groupBy({
    by: ["source"],
    _count: { _all: true },
  });
  console.log("RequestRecord by source:", JSON.stringify(reqBySource));

  const armReq = await p.requestRecord.findMany({
    where: { source: "arm" },
    select: {
      id: true,
      requestCode: true,
      customerName: true,
      rawCustomerName: true,
      customerMobile: true,
      rawCustomerMobile: true,
      actorCode: true,
      status: true,
    },
    take: 10,
  });
  console.log("ARM requests sample:", JSON.stringify(armReq, null, 1));

  const armReqCount = await p.requestRecord.count({ where: { source: "arm" } });
  console.log("ARM request count:", armReqCount);

  const listingsBySource = await p.listingRecord.groupBy({
    by: ["source"],
    _count: { _all: true },
  });
  console.log("ListingRecord by source:", JSON.stringify(listingsBySource));

  const tx = await p.transactionRecord.count();
  const ex = await p.expertRecord.count();
  console.log("tx:", tx, "experts:", ex);

  // نمونه کارشناس برای نگاشت نام
  const experts = await p.expertRecord.findMany({ take: 3 });
  console.log("expert sample:", JSON.stringify(experts.map((e) => ({ code: e.personnelCode, name: e.fullName })), null, 1));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
