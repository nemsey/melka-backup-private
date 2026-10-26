/**
 * db-check.ts — خواندن وضعیت رله از پایگاه تولید (فاز C · PN-031-E)
 * فقط خواندن: RelayDevice + AuditLog(RELAY_POLL_REJECT) — صفر تغییر داده.
 * اجرا: DATABASE_URL=file:/home/z/my-project/db/custom.db bun scripts/pn031e/db-check.ts <deviceId>
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const deviceId = process.argv[2] ?? "";

async function main() {
  const device = deviceId
    ? await db.relayDevice.findUnique({ where: { deviceId } })
    : await db.relayDevice.findFirst({ orderBy: { id: "desc" } });
  const since = new Date(Date.now() - 15 * 60 * 1000);
  const rejects = await db.auditLog.findMany({
    where: { action: "RELAY_POLL_REJECT", createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: { action: true, actor: true, detail: true, createdAt: true },
  });
  const out = {
    device: device
      ? {
          deviceId: device.deviceId,
          label: device.label,
          enrolledAt: device.enrolledAt?.toISOString() ?? null,
          lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
          attemptCount: device.attemptCount,
          maxAttempts: device.maxAttempts,
          servedCount: device.servedCount,
          errorCount: device.errorCount,
          revokedAt: device.revokedAt?.toISOString() ?? null,
        }
      : null,
    relayPollRejects: rejects,
    checkedAt: new Date().toISOString(),
  };
  console.log(JSON.stringify(out, null, 1));
  await db.$disconnect();
}

main().catch((e) => {
  console.error("ERR:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
