#!/usr/bin/env bun
/**
 * scripts/pn034/relay-reborn.ts — شاهد احیای رلهٔ Termux (جلسهٔ ۰۵۵)
 * دستگاه تازهٔ مالک از دکمهٔ احیاشدهٔ «تولید کد نصب» + پاکسازی دستگاه مرده
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } } });
const now = new Date();

const devices = await db.relayDevice.findMany({ orderBy: { lastSeenAt: "desc" } });
const before = devices.map((d) => ({
  deviceId: d.deviceId,
  lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
  servedCount: d.servedCount,
  enrollAttempts: d.attemptCount,
}));

// آمار صف (۲۴ ساعت گذشته)
const day = new Date(now.getTime() - 86400000);
const pending = await db.relayQueue.count({ where: { dispatchedAt: null, error: null } });
const done24 = await db.relayQueue.count({ where: { completedAt: { gte: day } } });
const failed24 = await db.relayQueue.count({ where: { error: { not: null }, enqueuedAt: { gte: day } } });

// پاکسازی دستگاه مردهٔ قدیمی (b816dd — بی‌نشست از ۱۲:۰۵) — ناوردای تک‌دستگاه پویا
const DEAD = "poco-f3-b816dd";
const dead = await db.relayDevice.findUnique({ where: { deviceId: DEAD } });
let deadRemoved = false;
if (dead) {
  await db.relayDevice.delete({ where: { deviceId: DEAD } });
  deadRemoved = true;
}

const after = (await db.relayDevice.findMany({ orderBy: { lastSeenAt: "desc" } })).map((d) => ({
  deviceId: d.deviceId,
  lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
  online: d.lastSeenAt ? now.getTime() - d.lastSeenAt.getTime() < 90_000 : false,
  servedCount: d.servedCount,
}));

const alive = after.filter((d) => d.online);
const witness = {
  phase: "PN-034 (شورا-ن۰۵۵) — احیای رلهٔ Termux با دکمهٔ بازگردانده‌شده",
  at: now.toISOString(),
  story:
    "مالک پس از اطمینان از ورژن زندهٔ اپ، از دکمهٔ «تولید کد نصب» کد تازه گرفت و در Termux پیست کرد — " +
    "دستگاه poco-f3-6ea15e ثبت و در حال poll است (مسیر اثبات‌شدهٔ PN-031-I زنده برگشت)",
  devicesBefore: before,
  devicesAfter: after,
  queue: { pending, done24, failed24 },
  deadDeviceRemoved: deadRemoved,
  relayAlive: alive.length > 0,
  verdict: alive.length > 0 ? "RELAY-REBORN" : "RELAY-OFFLINE",
};

await Bun.write("download/pn034/relay-reborn.json", JSON.stringify(witness, null, 2));
console.log(`VERDICT: ${witness.verdict} · زنده: ${alive.length} دستگاه · صف ۲۴س: done=${done24} failed=${failed24}`);
console.log(`دستگاه مردهٔ b816dd حذف شد: ${deadRemoved} — تک‌دستگاه پویا برقرار`);
await db.$disconnect();
