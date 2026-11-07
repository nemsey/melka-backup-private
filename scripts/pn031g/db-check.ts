// PN-031-G — شاهد DB برای دستگاه آزمایشی (الگوی pn031e/db-check)
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } } });

async function main() {
  const deviceId = process.argv[2] ?? "";
  const device = await db.relayDevice.findUnique({
    where: { deviceId },
    select: { deviceId: true, label: true, attemptCount: true, maxAttempts: true, enrolledAt: true, lastSeenAt: true, revokedAt: true, servedCount: true, errorCount: true },
  });
  console.log(JSON.stringify({ device }));
}
main().finally(() => db.$disconnect());
