import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const d = await db.relayDevice.findFirst({ where: { deviceId: { startsWith: "sandbox-poco2" } } });
console.log(JSON.stringify({ deviceId: d?.deviceId, enrolledAt: d?.enrolledAt, lastSeenAt: d?.lastSeenAt, lastHeartbeatAt: d?.lastHeartbeatAt, attemptCount: d?.attemptCount }, null, 2));
await db.$disconnect();
