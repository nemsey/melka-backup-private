import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";

const db = new PrismaClient();
const secret = randomBytes(32).toString("hex");
const enrollCode = randomBytes(18).toString("hex");
const deviceId = `sandbox-poco-${randomBytes(3).toString("hex")}`;
await db.relayDevice.create({
  data: {
    deviceId,
    secret,
    label: "Sandbox Poco F3",
    enrollCode,
    enrollExpires: new Date(Date.now() + 720 * 3600 * 1000),
    maxAttempts: 99,
    enrolledBy: "sandbox-test",
  },
});
await db.$disconnect();
writeFileSync("/home/z/my-project/scripts/dir-relay-activate-001/device.json", JSON.stringify({ deviceId, secret, enrollCode }, null, 2));
console.log("device created:", deviceId);
