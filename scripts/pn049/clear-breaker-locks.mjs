// PN-049/گام ۱-ب — پاک‌سازی قفل‌های فعال فیوز PN-029 (دستور شورا: لغو محدودیت‌های ورود)
// فقط «وضعیت فیوز» پاک می‌شود (lockUntil/nextAttemptAt/consecutiveFailures) —
// هیچ دادهٔ کسب‌وکاری لمس نمی‌شود (قانون دادهٔ مقدس).
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const rows = await p.circuitBreakerState.findMany();
console.log("BEFORE:", JSON.stringify(rows.map(r => ({
  target: r.target, consecutiveFailures: r.consecutiveFailures,
  lockUntil: r.lockUntil, nextAttemptAt: r.nextAttemptAt,
  lastSuccessAt: r.lastSuccessAt, lastFailureAt: r.lastFailureAt,
})), null, 1));
let cleared = 0;
for (const r of rows) {
  if (r.lockUntil || r.nextAttemptAt || r.consecutiveFailures > 0) {
    await p.circuitBreakerState.update({
      where: { target: r.target },
      data: { lockUntil: null, nextAttemptAt: null, consecutiveFailures: 0 },
    });
    cleared++;
  }
}
const after = await p.circuitBreakerState.findMany();
console.log(JSON.stringify({ cleared, after: after.map(r => ({ t: r.target, cf: r.consecutiveFailures, lock: r.lockUntil, next: r.nextAttemptAt })) }, null, 1));
await p.$disconnect();
