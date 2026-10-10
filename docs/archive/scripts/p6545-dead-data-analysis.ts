import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  // «هرگز آدرس‌تلاش‌نشده» — آگهی بدون آدرس که غنی‌سازی آدرس هرگز برایش اجرا نشده
  const noAddr = await db.propertyRecord.count({ where: { address: null } });
  const noAddrNoLine = await db.propertyRecord.count({ where: { address: null, lineName: null } });
  console.log(`PropertyRecord بدون آدرس: ${noAddr} (بدون خط/محله: ${noAddrNoLine})`);
  // یتیم‌ها

  const expiredSessions = await db.session.count({ where: { expiresAt: { lt: new Date() } } });
  console.log(`session منقضی: ${expiredSessions} از ۱۶۱`);
  const oldOtp = await db.otpAttempt.count({ where: { createdAt: { lt: new Date(Date.now() - 90*86400000) } } });
  console.log(`otpAttempt کهنه>۹۰روز: ${oldOtp} از ۱۴۱`);
  const oldScan = await db.divarScanLog.count({ where: { startedAt: { lt: new Date(Date.now() - 90*86400000) } } });
  console.log(`divarScanLog کهنه>۹۰روز: ${oldScan} از ۲۵`);
  const oldLookup = await db.lookupLog.count({ where: { createdAt: { lt: new Date(Date.now() - 90*86400000) } } });
  console.log(`lookupLog کهنه>۹۰روز: ${oldLookup} از ۲`);
  // تکراری‌ها
  const dupArmReq = await db.requestRecord.groupBy({ by: ['armRequestId'], where: { armRequestId: { not: null } }, _count: true, having: { armRequestId: { _count: { gt: 1 } } } });
  console.log(`requestRecord با armRequestId تکراری: ${dupArmReq.length} گروه`);
  const dupReqCustomer = await db.requestRecord.groupBy({ by: ['customerMobile', 'actorCode'], where: { customerMobile: { not: null }, status: 'draft' }, _count: true, having: { customerMobile: { _count: { gt: 1 } } } });
  console.log(`requestRecord پیش‌نویس تکراری (موبایل+ثبت‌کننده): ${dupReqCustomer.length} گروه`);
  // عرضه‌تقاضا و معاملات کهنه (داده واقعی است — فقط بررسی)
  console.log(`specialPropertyRecord: ${await db.specialPropertyRecord.count()}`);
  // یتیم واقعی: enrich بدون tx
  const enrichOrphans = await db.$queryRaw`SELECT COUNT(*) as c FROM TransactionEnrichment te LEFT JOIN TransactionRecord tr ON te.txId = tr.id WHERE tr.id IS NULL` as any[];
  console.log(`transactionEnrichment یتیم: ${enrichOrphans[0].c}`);
  const visitOrphans = await db.$queryRaw`SELECT COUNT(*) as c FROM VisitRecord v LEFT JOIN ExpertRecord e ON v.propertyRealtorName = e.fullName WHERE e.personnelCode IS NULL` as any[];
  console.log(`visitRecord یتیم: ${visitOrphans[0].c}`);
}
main().finally(() => db.$disconnect());
