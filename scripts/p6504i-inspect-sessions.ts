/**
 * P6.5-04-i — بازرسی نشست‌های پایگاه تولید (فقط-خواندن)
 * هدف: یافتن کد پرسنلی ARM مالک (نشست دارای armToken) برای پیکربندی MANAGER_CODE
 */
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const ss = await db.session.findMany({ orderBy: { createdAt: "desc" }, take: 12 });
for (const s of ss) {
  console.log(
    JSON.stringify({
      pc: s.personnelCode,
      name: s.displayName,
      role: s.role,
      scope: s.accessScope,
      hasArm: !!s.armTokenEnc,
      armUserType: s.armUserType,
      encLen: s.armTokenEnc?.length ?? 0,
      created: s.createdAt.toISOString(),
      expires: s.expiresAt.toISOString(),
      revoked: s.revoked,
    })
  );
}
console.log("auditLog count:", await db.auditLog.count());
console.log("transactions:", await db.transactionRecord.count());
console.log("experts:", await db.expertRecord.count());
console.log("contracts:", await db.contractRecord.count());
console.log("interactions:", await db.interactionRecord.count());
console.log("visits:", await db.visitRecord.count());
console.log("listings:", await db.listingRecord.count());
console.log("requests:", await db.requestRecord.count());
await db.$disconnect();
