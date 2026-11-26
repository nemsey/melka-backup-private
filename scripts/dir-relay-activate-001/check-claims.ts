import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
console.log("==== recent claimed queue rows (who is claiming) ====");
const rows = await db.relayQueue.findMany({ where: { claimedBy: { not: null } }, orderBy: { dispatchedAt: "desc" }, take: 8, select: { id: true, claimedBy: true, dispatchedAt: true, url: true, status: true } });
for (const r of rows) console.log(JSON.stringify({ claimedBy: r.claimedBy, at: r.dispatchedAt, status: r.status, url: (r.url ?? "").slice(0, 60) }));
console.log("==== audit around Nov25 21:00 → Nov26 02:30 (RELAY_BOOTSTRAP / POLL_REJECT / ENROLL) ====");
const audits = await db.auditLog.findMany({
  where: { createdAt: { gte: new Date("2026-11-25T20:00:00Z"), lte: new Date("2026-11-26T03:00:00Z") } },
  orderBy: { createdAt: "asc" }, take: 60,
  select: { createdAt: true, action: true, detail: true },
});
for (const a of audits) {
  const d = (a.detail ?? "");
  if (a.action.includes("RELAY") || d.includes("رله") || a.action.includes("BOOTSTRAP") || a.action.includes("POLL"))
    console.log(JSON.stringify({ at: a.createdAt, action: a.action, detail: d.slice(0, 200) }));
}
await db.$disconnect();
