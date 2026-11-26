import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const r = await db.relayDevice.updateMany({ where: { deviceId: { startsWith: "sandbox-poco" } }, data: { revokedAt: new Date() } });
console.log("revoked sandbox devices:", r.count);
await db.$disconnect();
