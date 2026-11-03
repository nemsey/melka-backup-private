#!/usr/bin/env bun
/**
 * PN-033 · فاز ۵.۵ — کد تازهٔ مالک (اگر لازم) — سند ن۰۵۴
 * ---------------------------------------------------------------------------
 * داوری: آیا کد نصب تازه لازم است؟
 *   رلهٔ Termux مالک همین حالا زنده است (poll هر ~۲۵ث · دستگاه فعال یگانه) —
 *   نصب تازه لازم نیست. اگر در آینده گوشی ری‌استارت شد یا Termux بسته شد،
 *   GLM با همین رویه کد تازه صادر می‌کند (مسیر مدیر — دکمهٔ UI حذف شد).
 * شاهد: download/pn033/kcode-fresh.json
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } } });

const now = new Date();
const devices = await db.relayDevice.findMany({ where: { revokedAt: null } });
const keeper = devices[0] ?? null;
const alive = keeper?.lastSeenAt ? now.getTime() - keeper.lastSeenAt.getTime() < 90_000 : false;
const breakers = await db.circuitBreakerState.count({});

const needed = !alive || devices.length !== 1;

const witness = {
  phase: "PN-033 · فاز ۵.۵ — کد تازهٔ مالک (شورا-ن۰۵۴)",
  at: now.toISOString(),
  decision: needed ? "ISSUE-NEEDED" : "NOT-NEEDED",
  reasoning: needed
    ? "رله زنده نیست یا بیش از یک دستگاه فعال است — کد تازه لازم"
    : "رلهٔ Termux زنده است و تنها یک دستگاه فعال در DB است — نصب تازه لازم نیست؛ مالک فقط کدپرسنلی + OTP را وارد می‌کند",
  relayState: {
    activeDevices: devices.length,
    keeperDeviceId: keeper?.deviceId ?? null,
    lastSeenAt: keeper?.lastSeenAt?.toISOString() ?? null,
    lastSeenAgeSec: keeper?.lastSeenAt ? Math.round((now.getTime() - keeper.lastSeenAt.getTime()) / 1000) : null,
    online: alive,
    servedCount: keeper?.servedCount ?? 0,
  },
  fuseState: { circuitBreakerRows: breakers, permanentOff: "MELK_ARM_CIRCUIT_DISABLED=1 (env.platform.json + escrow سه‌لایه)" },
  futurePath: "اگر گوشی ری‌استارت شد یا Termux بسته شد: مالک از GLM دستور نصب تازه می‌گیرد (رویهٔ issue-owner-code.ts · ثبت دستگاه از UI حذف شد — سند ن۰۵۴)",
  ownerNextStep: "تنظیمات ← اتصال به ملک تبریز ← ورود مجدد ← کدپرسنلی ۴۱۰۰۳۱۳۲۰ ← ارسال کد ← OTP",
};

await Bun.write("download/pn033/kcode-fresh.json", JSON.stringify(witness, null, 2));
console.log(JSON.stringify({ decision: witness.decision, keeper: keeper?.deviceId, alive, breakers }, null, 2));
await db.$disconnect();
