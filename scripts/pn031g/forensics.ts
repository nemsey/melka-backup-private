// PN-031-G · کار ۲ — جرم‌شناسی: وضعیت دستگاه مالک + ردپای RELAY_POLL_REJECT در AuditLog
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } } });

async function main() {
  const devices = await db.relayDevice.findMany({
    orderBy: { id: "desc" },
    take: 12,
    select: { deviceId: true, label: true, enrollExpires: true, lastSeenAt: true, enrolledAt: true, attemptCount: true, revokedAt: true, servedCount: true, errorCount: true, lastIp: true },
  });
  const since = new Date(Date.now() - 12 * 3600 * 1000); // ۱۲ ساعت اخیر
  const rejects = await db.auditLog.findMany({
    where: { action: { startsWith: "RELAY" }, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 120,
    select: { action: true, detail: true, createdAt: true },
  });
  const byAction: Record<string, number> = {};
  for (const r of rejects) byAction[r.action] = (byAction[r.action] ?? 0) + 1;
  console.log(JSON.stringify({ devices, rejectCountLast12h: rejects.length, byAction, recent: rejects.slice(0, 25) }, null, 1));
}
main().finally(() => db.$disconnect());
