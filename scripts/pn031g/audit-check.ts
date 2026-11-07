// PN-031-G — شاهد AuditLog برای ردهای رله
// دامنه‌بندی به «شروع همین اجرای دروازه» → تکرارپذیری اجراهای متوالی.
// آرگومان‌ها: $1=deviceId · $2=runStartMs (نشانگر آغاز دروازه) · $3=g5MarkerMs (پس از poll صحیح)
// شمارش‌ها: (۱) ردِ مرتبط با دستگاه پس از شروع اجرا (G.3 — هدر دستگاه حاضر بود)
// (۲) ردِ نام ناقراردادی X-Melka-Target پس از شروع اجرا (G.4 — هدر دستگاه غایب بود)
// (۳) هر ردِ تازه پس از نشانگر G.5 (پنجرهٔ پایانی — انتظار: صفر)
// قانون صفر لاگ محتوا: فقط دلیل + deviceId — بدون مقدار هدر/امضا/راز
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } } });

async function main() {
  const deviceId = process.argv[2] ?? "";
  const runStart = Number(process.argv[3] ?? 0);
  const g5Marker = Number(process.argv[4] ?? 0);
  const since = new Date(Date.now() - 30 * 60 * 1000); // پنجرهٔ نمایش فهرست: ۳۰ دقیقه
  const rows = await db.auditLog.findMany({
    where: { action: "RELAY_POLL_REJECT", createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 80,
    select: { detail: true, createdAt: true },
  });
  const runStartAt = runStart ? new Date(runStart) : new Date(0);
  const g5At = g5Marker ? new Date(g5Marker) : new Date(Date.now() - 2 * 60 * 1000);
  const inRun = rows.filter((r) => r.createdAt >= runStartAt);
  console.log(JSON.stringify({
    deviceId,
    deviceRejectAfterRunStart: inRun.filter((r) => (r.detail ?? "").includes(deviceId)).length,
    targetNameRejectAfterRunStart: inRun.filter((r) => (r.detail ?? "").includes("(X-Melka-Relay-Device)")).length,
    newRejectAfterG5Marker: rows.filter((r) => r.createdAt >= g5At).length,
    rejects: rows.map((r) => ({ detail: (r.detail ?? "").slice(0, 170), at: r.createdAt.toISOString() })),
  }));
}
main().finally(() => db.$disconnect());
