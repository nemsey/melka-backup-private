#!/usr/bin/env bun
/**
 * PN-033 · فاز ۱ + ۲ (شورا-ن۰۵۴ · ملکا-شورا-ن۰۵۴-۱۴۰۵)
 * ---------------------------------------------------------------------------
 * فاز ۱ — رفع قفل سخت فیوز:
 *   ۱.۲ حذف رکورد قفل برای میزبان ARM (arus-api)
 *   ۱.۳ حذف رکورد قفل برای PM/APU (pm-api / gap-api)
 *   ۱.۵ تأیید: تلاش بعدی مجاز (تست داخلی checkCircuit)
 *
 * فاز ۲ — پاکسازی DB:
 *   ۲.۱ شناسایی همهٔ RelayDevice
 *   ۲.۲ حذف دستگاه‌های مرده — فقط ۱ فعال می‌ماند (تازه‌ترین lastSeenAt)
 *   ۲.۳ کدهای enroll منقضی — با حذف دستگاه مرده حذف می‌شوند
 *   ۲.۴ حذف رکوردهای Circuit Breaker (همه — فاز ۱)
 *   ۲.۵ گزارش → download/pn033/relay-devices-cleanup.json + circuit-cleared.json
 *
 * شواهد: download/pn033/circuit-cleared.json · relay-devices-cleanup.json
 * قانون: صفر راز در شاهد (بدون چاپ secret) · هر تغییر با شمارش دقیق
 */
import { PrismaClient } from "@prisma/client";

const DB_URL = "file:/home/z/my-project/db/custom.db";
const db = new PrismaClient({ datasources: { db: { url: DB_URL } } });

function iso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

async function main() {
  const now = new Date();
  const at = now.toISOString();

  // ── فاز ۱: شناسایی و حذف رکوردهای قفل فیوز ───────────────────────────
  const breakersBefore = await db.circuitBreakerState.findMany({ orderBy: { target: "asc" } });
  const breakerReport = breakersBefore.map((b) => ({
    target: b.target,
    consecutiveFailures: b.consecutiveFailures,
    totalFailures: b.totalFailures,
    lockUntil: iso(b.lockUntil),
    nextAttemptAt: iso(b.nextAttemptAt),
    wasLocked: !!(b.lockUntil && b.lockUntil > now),
  }));

  const deleteBreakers = await db.circuitBreakerState.deleteMany({});

  // راستی‌آزمایی: صفر رکورد
  const breakersAfter = await db.circuitBreakerState.findMany({});
  if (breakersAfter.length !== 0) throw new Error("breaker records still remain");

  // ── فاز ۲.۱: شناسایی همهٔ دستگاه‌ها ────────────────────────────────────
  const devicesBefore = await db.relayDevice.findMany({ orderBy: { id: "asc" } });

  // انتخاب دستگاه فعال: تازه‌ترین lastSeenAt در میان غیرابطال‌شده‌ها
  const candidates = devicesBefore
    .filter((d) => !d.revokedAt && d.lastSeenAt !== null)
    .sort((a, b) => (b.lastSeenAt!.getTime() ?? 0) - (a.lastSeenAt!.getTime() ?? 0));
  const keeper = candidates[0] ?? null;
  if (!keeper) throw new Error("no active relay device found — cannot clean (keeper required)");

  const keeperAgeSec = Math.round((now.getTime() - keeper.lastSeenAt!.getTime()) / 1000);
  if (keeperAgeSec > 90) {
    throw new Error(`keeper ${keeper.deviceId} last seen ${keeperAgeSec}s ago — not in online window (90s); aborting for safety`);
  }

  // ── فاز ۲.۲: حذف همهٔ دستگاه‌ها به‌جز دستگاه فعال ──────────────────────
  const deadIds = devicesBefore.filter((d) => d.id !== keeper.id).map((d) => d.id);
  const deleteDevices = await db.relayDevice.deleteMany({ where: { id: { in: deadIds } } });

  // راستی‌آزمایی: دقیقاً ۱ دستگاه
  const devicesAfter = await db.relayDevice.findMany({});
  if (devicesAfter.length !== 1 || devicesAfter[0].id !== keeper.id) {
    throw new Error(`expected exactly keeper device after cleanup, got ${devicesAfter.length}`);
  }

  // ── فاز ۱.۵: تأیید داخلی — درگاه فیوز برای همهٔ میزبانها باز است ────────
  const { checkCircuit, breakerGate } = await import("../../src/lib/melk-api/circuit-breaker");
  const hosts = ["arus-api.melketabriz.ir", "pm-api.melketabriz.ir", "gap-api.melketabriz.ir"];
  const gateChecks: Record<string, { allowed: boolean; retryInMs: number }> = {};
  for (const h of hosts) {
    const g = await checkCircuit(h);
    gateChecks[h] = { allowed: g.allowed, retryInMs: g.retryInMs };
  }
  const allAllowed = Object.values(gateChecks).every((g) => g.allowed);

  // ── شاهد ۱: circuit-cleared.json ─────────────────────────────────────
  const circuitWitness = {
    phase: "PN-033 · فاز ۱ — رفع قفل سخت فیوز (شورا-ن۰۵۴)",
    at,
    before: {
      count: breakersBefore.length,
      records: breakerReport,
      activeHardLocks: breakerReport.filter((b) => b.wasLocked).map((b) => b.target),
    },
    action: { deletedRecords: deleteBreakers.count, method: "prisma.circuitBreakerState.deleteMany({})" },
    after: { count: breakersAfter.length },
    gateVerification: { hosts: gateChecks, allAllowed, note: "checkCircuit روی DB زنده پس از حذف — درگاه باز" },
    envNote: "MELK_ARM_CIRCUIT_DISABLED=1 در فاز ۴ به env اضافه می‌شود — فیوز برای همیشه خاموش (پیش‌فرض سند ن۰۵۴ · بخش ۲-الف/۴.۳)",
    verdict: allAllowed && breakersAfter.length === 0 ? "CIRCUIT-CLEARED" : "FAIL",
  };
  await Bun.write("download/pn033/circuit-cleared.json", JSON.stringify(circuitWitness, null, 2));

  // ── شاهد ۲: relay-devices-cleanup.json ───────────────────────────────
  const deadReport = devicesBefore
    .filter((d) => d.id !== keeper.id)
    .map((d) => ({
      deviceId: d.deviceId,
      label: d.label,
      revoked: !!d.revokedAt,
      lastSeenAt: iso(d.lastSeenAt),
      neverSeen: d.lastSeenAt === null,
      enrollExpired: !!(d.enrollExpires && d.enrollExpires < now),
      servedCount: d.servedCount,
    }));

  const cleanupWitness = {
    phase: "PN-033 · فاز ۲ — پاکسازی DB دستگاه‌های رله (شورا-ن۰۵۴)",
    at,
    before: { deviceCount: devicesBefore.length },
    keeper: {
      deviceId: keeper.deviceId,
      label: keeper.label,
      lastSeenAt: iso(keeper.lastSeenAt),
      lastSeenAgeSec: keeperAgeSec,
      servedCount: keeper.servedCount,
      errorCount: keeper.errorCount,
      enrolledAt: iso(keeper.enrolledAt),
      note: "تازه‌ترین lastSeenAt — جلسهٔ جاری Termux مالک",
    },
    deleted: {
      count: deleteDevices.count,
      breakdown: {
        revoked: deadReport.filter((d) => d.revoked).length,
        neverSeen: deadReport.filter((d) => d.neverSeen && !d.revoked).length,
        staleOrDuplicate: deadReport.filter((d) => !d.neverSeen && !d.revoked).length,
        withExpiredEnrollCodes: deadReport.filter((d) => d.enrollExpired).length,
      },
      devices: deadReport,
    },
    after: { deviceCount: devicesAfter.length, remainingDeviceId: devicesAfter[0].deviceId },
    verdict: devicesAfter.length === 1 ? "CLEANUP-OK" : "FAIL",
  };
  await Bun.write("download/pn033/relay-devices-cleanup.json", JSON.stringify(cleanupWitness, null, 2));

  // خروجی کنسول — فقط متادیتا
  console.log(JSON.stringify({
    circuit: { before: breakersBefore.length, deleted: deleteBreakers.count, allAllowed },
    devices: { before: devicesBefore.length, deleted: deleteDevices.count, keeper: keeper.deviceId, keeperAgeSec },
  }, null, 2));

  if (!allAllowed) process.exit(1);
}

main()
  .catch((e) => { console.error("FATAL:", e); process.exit(1); })
  .finally(() => db.$disconnect());
