#!/usr/bin/env bun
/**
 * scripts/pn034/zero-restriction-witness.ts — شاهد قانون مالک: صفر محدودیت اتصال
 * ناورداهای زندهٔ DB + اسکیما + کد روی بیلد 30fab64
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } } });

// ۱) جدول OtpRateLimit در DB زنده موجود نیست
const otpTable = await db.$queryRawUnsafe<{ name: string }[]>(
  "SELECT name FROM sqlite_master WHERE type='table' AND name='OtpRateLimit'"
);

// ۲) قفلهای سخت فیوز — صفر رکورد فعال
const now = new Date();
const hosts = ["arus-api.melketabriz.ir", "pm-api.melketabriz.ir", "gap-api.melketabriz.ir"];
const activeBreakerLocks = await db.circuitBreakerState.count({
  where: { target: { in: hosts }, OR: [{ lockUntil: { gt: now } }, { nextAttemptAt: { gt: now } }] },
});

// ۳) اسکیمای زنده — مدل حذف شده
const schema = readFileSync("prisma/schema.prisma", "utf8");
const schemaPg = readFileSync("prisma/schema.postgres.prisma", "utf8");
const modelCount = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].length;

// ۴) کد — چهار فایل مکانیزم مرده‌اند
const deadFiles = [
  "src/lib/auth/otp-lock.ts",
  "src/app/api/admin/otp-burn/route.ts",
  "src/app/api/v1/admin/otp-burn/route.ts",
  "src/core/tiles/tiles/settings/OtpReloginSection.tsx",
];

// ۵) مسیرهای اتصال — صفر checkRate
const connRoutes = [
  "src/app/api/auth/request-otp/route.ts",
  "src/app/api/auth/verify-otp/route.ts",
  "src/app/api/arm/connection/route.ts",
  "src/app/api/pm/connection/route.ts",
  "src/app/api/gap/connection/route.ts",
];

const checks = {
  otpTableGone: otpTable.length === 0,
  breakerLocksZero: activeBreakerLocks === 0,
  schemaModelGone: !schema.includes("model OtpRateLimit") && !schemaPg.includes("model OtpRateLimit"),
  modelCountBalanced: modelCount === 68,
  mechanismFilesDead: deadFiles.every((f) => !existsSync(f)),
  routesRateFree: connRoutes.every((r) => !readFileSync(r, "utf8").includes("checkRate")),
};

const witness = {
  phase: "PN-034 (شورا-ن۰۵۵ · قانون مالک: صفر محدودیت اتصال)",
  at: new Date().toISOString(),
  law: "هیچ محدودیتی برای اتصال به سامانه‌ها باقی نماند — مالک صاحب سیستم است",
  checks,
  detail: {
    otpTableInDb: otpTable.map((t) => t.name),
    activeBreakerLocks,
    modelCount,
    removed: {
      mechanism: "مکانیزم OTP تک‌بارة PN-029 (قفل ۶ ساعته دو-دامنه)",
      files: deadFiles,
      table: "OtpRateLimit (از هر دو اسکیما + هر دو DB)",
      rateGates: "سقفهای نرخ محلی ۵ مسیر اتصال (recordAttempt = فقط رد حسابرسی)",
    },
    restored: {
      "تولید کد نصب": "RelaySetupSection → POST /api/admin/relay/enroll (مسیر اثبات‌شدهٔ PN-031-I + openssl-tool)",
      "اتصال به حساب شخصی ARM": "ArmConnectionSection embedded — فرم مستقیم بدون قفل",
    },
  },
  verdict: Object.values(checks).every(Boolean) ? "ZERO-RESTRICTION" : "INCOMPLETE",
};

await Bun.write("download/pn034/otp-lock-gone.json", JSON.stringify(witness, null, 2));
console.log(`VERDICT: ${witness.verdict}`);
for (const [k, v] of Object.entries(checks)) console.log(`  ${v ? "✓" : "✗"} ${k}`);
await db.$disconnect();
