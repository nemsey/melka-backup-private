import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
const db = new PrismaClient();
const secret = randomBytes(32).toString("hex");
const enrollCode = randomBytes(18).toString("hex");
const deviceId = `sandbox-poco2-${randomBytes(3).toString("hex")}`;
await db.relayDevice.create({
  data: { deviceId, secret, label: "Sandbox Poco F3 v2", enrollCode,
    enrollExpires: new Date(Date.now() + 720 * 3600 * 1000), maxAttempts: 99, enrolledBy: "sandbox-test-2" },
});
await db.$disconnect();
writeFileSync("scripts/dir-relay-activate-001/device2.json", JSON.stringify({ deviceId, secret, enrollCode }, null, 2));
console.log("device2 created:", deviceId);
