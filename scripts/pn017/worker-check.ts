/** PN-017 S0 — پیش‌شرط‌ها: وضعیت Worker (۹ کار) + سلامت زنده */
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function main() {
  const jobs = await db.syncJobState.findMany({ select: { jobId: true, jobKind: true, status: true, updatedAt: true }, orderBy: { jobId: "asc" } });
  const lastAudit = await db.auditLog.findFirst({ orderBy: { createdAt: "desc" } });
  console.log(JSON.stringify({
    workerJobs: jobs.map((j) => ({ id: j.jobId, kind: j.jobKind, status: j.status, updatedAt: j.updatedAt.toISOString() })),
    jobCount: jobs.length,
    lastAuditEntry: lastAudit ? { op: lastAudit.operation, at: lastAudit.createdAt.toISOString() } : null,
  }, null, 2));
}
main().finally(() => db.$disconnect());
