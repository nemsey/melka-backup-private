#!/usr/bin/env bun
/**
 * scripts/pn034/check-state.ts — پیش‌بازبینی وضعیت زنده پیش از PN-034
 * DB: قفلهای OtpRateLimit · دستگاههای RelayDevice · فیوز CircuitBreaker
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } } });

const now = new Date();

const otpLocks = await db.otpRateLimit.findMany({ orderBy: { updatedAt: "desc" } });
console.log("=== OtpRateLimit (مکانیزم تک‌باره PN-029) ===");
for (const l of otpLocks) {
  const remainMs = l.lockedUntil ? l.lockedUntil.getTime() - now.getTime() : -1;
  console.log(
    `${l.scope} · attempts=${l.attempts} · lockedUntil=${l.lockedUntil?.toISOString() ?? "—"} · باقی‌مانده=${remainMs > 0 ? `${Math.ceil(remainMs / 60000)} دقیقه` : "باز"}`
  );
}
console.log(`مجموع رکوردها: ${otpLocks.length}`);

const devices = await db.relayDevice.findMany({ orderBy: { lastSeenAt: "desc" } });
console.log("\n=== RelayDevice ===");
for (const d of devices) {
  const online = d.lastSeenAt && now.getTime() - d.lastSeenAt.getTime() < 90_000;
  console.log(
    `${d.deviceId} (${d.label}) · revoked=${d.revokedAt ? "بله" : "نه"} · lastSeen=${d.lastSeenAt?.toISOString() ?? "هرگز"} · online=${online ? "زنده" : "آفلاین"} · served=${d.servedCount}`
  );
}

const cbStates = await db.circuitBreakerState.findMany();
console.log(`\n=== CircuitBreakerState: ${cbStates.length} رکورد ===`);
for (const c of cbStates)
  console.log(`${c.target} · failures=${c.consecutiveFailures} · lockUntil=${c.lockUntil?.toISOString() ?? "—"} · nextAttempt=${c.nextAttemptAt?.toISOString() ?? "—"}`);

await db.$disconnect();
