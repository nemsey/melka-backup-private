import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const devices = await db.relayDevice.findMany({ orderBy: { id: "desc" }, take: 10 });
  console.log("=== RELAY DEVICES ===");
  for (const d of devices) {
    console.log(JSON.stringify({
      deviceId: d.deviceId, label: d.label,
      attemptCount: d.attemptCount, maxAttempts: d.maxAttempts,
      enrolledAt: d.enrolledAt, lastSeenAt: d.lastSeenAt, lastAttemptAt: d.lastAttemptAt,
      lastIp: d.lastIp, servedCount: d.servedCount, errorCount: d.errorCount,
      revokedAt: d.revokedAt, enrollExpires: d.enrollExpires, createdAt: d.createdAt,
      lastRoundtripMs: d.lastRoundtripMs,
    }, null, 1));
  }
  const q = await db.relayQueue.findMany({ orderBy: { id: "desc" }, take: 15 });
  console.log("=== RELAY QUEUE (last 15) ===");
  for (const item of q) {
    console.log(JSON.stringify({
      id: item.id, status: item.status, method: item.method, url: item.url,
      source: item.source, error: item.error, enqueuedAt: item.enqueuedAt,
      completedAt: item.completedAt, responseStatus: item.responseStatus,
      claimedBy: item.claimedBy,
    }, null, 1));
  }
  const counts = await db.relayQueue.groupBy({ by: ["status"], _count: true });
  console.log("=== QUEUE STATUS COUNTS ===", JSON.stringify(counts));
  await db.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
