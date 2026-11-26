// DIR-RELAY-ULTRA-001 · پروب صف رله — خواندن آیتم‌های تازهٔ RelayQueue برای شاهد E2E
// خروجی JSON: آخرین N آیتم (تازه‌ترین) + شمار وضعیت‌ها + نشست تغییرات
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();
(async () => {
  const since = process.argv[2] ? new Date(process.argv[2]) : new Date(Date.now() - 15 * 60_000);
  const rows = await db.relayQueue.findMany({
    where: { enqueuedAt: { gte: since } },
    orderBy: { enqueuedAt: "desc" },
    take: 25,
    select: { id: true, method: true, url: true, status: true, priority: true, source: true, claimedBy: true, dispatchedAt: true, completedAt: true, error: true, responseStatus: true, enqueuedAt: true },
  });
  const devices = await db.relayDevice.findMany({
    where: { deviceId: { contains: "ultra" } },
    select: { deviceId: true, lastSeenAt: true, servedCount: true, errorCount: true, enrolledAt: true },
  });
  console.log(JSON.stringify({ since: since.toISOString(), items: rows, devices }, null, 1));
  await db.$disconnect();
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
