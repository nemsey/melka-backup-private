import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const devices = await db.relayDevice.findMany({ orderBy: { id: "desc" }, take: 15 });
for (const d of devices) {
  console.log(JSON.stringify({
    deviceId: d.deviceId, label: d.label,
    enrolledAt: d.enrolledAt, lastSeenAt: d.lastSeenAt, lastHeartbeatAt: d.lastHeartbeatAt,
    attemptCount: d.attemptCount, maxAttempts: d.maxAttempts,
    revokedAt: d.revokedAt, enrollExpires: d.enrollExpires,
    servedCount: d.servedCount, lastIp: d.lastIp,
  }));
}
console.log("---- recent RELAY_* audit entries ----");
const audits = await db.auditLog.findMany({
  where: { OR: [{ action: { contains: "RELAY" } }] },
  orderBy: { id: "desc" }, take: 25,
});
for (const a of audits) console.log(JSON.stringify({ at: a.createdAt, action: a.action, detail: (a.detail ?? "").slice(0, 160) }));
await db.$disconnect();
