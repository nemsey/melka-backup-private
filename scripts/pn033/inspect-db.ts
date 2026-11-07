#!/usr/bin/env bun
/**
 * PN-033 · فاز ۱.۱ + ۲.۱ — شناسایی رکوردهای قفل فیوز و فهرست کامل دستگاه‌های رله
 * خروجی: download/pn033/db-inspection.json (فقط متادیتا — صفر راز)
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } } });

function maskSecret(s: string): string {
  return s ? `${s.slice(0, 6)}…${s.slice(-4)} (len=${s.length})` : "(empty)";
}

const now = Date.now();

const breakers = await db.circuitBreakerState.findMany({ orderBy: { target: "asc" } });
const devices = await db.relayDevice.findMany({ orderBy: { id: "asc" } });

const breakerReport = breakers.map((b) => ({
  target: b.target,
  consecutiveFailures: b.consecutiveFailures,
  totalFailures: b.totalFailures,
  totalSuccesses: b.totalSuccesses,
  lastFailureAt: b.lastFailureAt,
  lastSuccessAt: b.lastSuccessAt,
  nextAttemptAt: b.nextAttemptAt,
  lockUntil: b.lockUntil,
  lockedNow: !!(b.lockUntil && b.lockUntil.getTime() > now),
  cooldownNow: !!(b.nextAttemptAt && b.nextAttemptAt.getTime() > now && !(b.lockUntil && b.lockUntil.getTime() > now)),
}));

const deviceReport = devices.map((d) => ({
  id: d.id,
  deviceId: d.deviceId,
  secret: maskSecret(d.secret),
  label: d.label,
  enrollCode: d.enrollCode ? `${d.enrollCode.slice(0, 6)}…` : null,
  enrollExpires: d.enrollExpires,
  enrollExpired: !!(d.enrollExpires && d.enrollExpires.getTime() < now),
  attemptCount: d.attemptCount,
  maxAttempts: d.maxAttempts,
  enrolledAt: d.enrolledAt,
  lastSeenAt: d.lastSeenAt,
  lastSeenAgeMin: d.lastSeenAt ? Math.round((now - d.lastSeenAt.getTime()) / 60000) : null,
  lastIp: d.lastIp,
  revokedAt: d.revokedAt,
  isRevoked: !!d.revokedAt,
  servedCount: d.servedCount,
  errorCount: d.errorCount,
  lastRoundtripMs: d.lastRoundtripMs,
}));

const out = {
  phase: "PN-033 · فاز ۱.۱ + ۲.۱ — شناسایی (شورا-ن۰۵۴)",
  at: new Date().toISOString(),
  circuitBreaker: {
    count: breakers.length,
    records: breakerReport,
    activeLocks: breakerReport.filter((b) => b.lockedNow || b.cooldownNow),
  },
  relayDevices: {
    count: devices.length,
    records: deviceReport,
    activeCandidates: deviceReport.filter((d) => !d.isRevoked && d.lastSeenAgeMin !== null && d.lastSeenAgeMin < 15),
    deadCandidates: deviceReport.filter((d) => d.isRevoked || d.lastSeenAt === null || (d.lastSeenAgeMin !== null && d.lastSeenAgeMin > 60)),
  },
};

await Bun.write("download/pn033/db-inspection.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  breakers: breakerReport,
  devices: deviceReport.map(({ secret, ...rest }) => rest),
}, null, 2));
await db.$disconnect();
