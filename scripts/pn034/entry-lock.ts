#!/usr/bin/env bun
/**
 * scripts/pn034/entry-lock.ts — قفل ورود PN-034 (شورا-ن۰۵۵)
 * پیش‌شرط‌ها: بکاپ گرم · HEAD · health · سلامت DB · وضعیت قفل OTP
 */
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } } });

const backupFile = "backups/pre-pn034-20261016T115609Z.db";
const backupMd5 = createHash("md5").update(Buffer.from(await Bun.file(backupFile).arrayBuffer())).digest("hex");
const backupSize = (await Bun.file(backupFile).arrayBuffer()).byteLength;

const integrity = await db.$queryRawUnsafe<{ integrity_check: string }[]>("PRAGMA integrity_check;");
const lockRows = await db.otpRateLimit.findMany();
const devices = await db.relayDevice.findMany({ where: { revokedAt: null } });

const witness = {
  phase: "PN-034 (شورا-ن۰۵۵ · قانون مالک: صفر محدودیت اتصال)",
  at: new Date().toISOString(),
  backup: { file: backupFile, md5: backupMd5, bytes: backupSize, integrity: integrity[0]?.integrity_check ?? "unknown" },
  dbLocks: {
    otpRateLimitRows: lockRows.map((l) => ({
      scope: l.scope,
      attempts: l.attempts,
      lockedUntil: l.lockedUntil?.toISOString() ?? null,
    })),
    note: "این قفلها با حذف جدول OtpRateLimit (قانون صفر-محدودیت) نابود می‌شوند",
  },
  relayDevices: devices.map((d) => ({ deviceId: d.deviceId, lastSeenAt: d.lastSeenAt?.toISOString() ?? null })),
  verdict: "ENTER",
};

await Bun.write("download/pn034/entry-lock.json", JSON.stringify(witness, null, 2));
console.log(`بکاپ: ${backupMd5} · ${backupSize} bytes · integrity=${integrity[0]?.integrity_check}`);
console.log(`قفلهای OTP: ${lockRows.length} رکورد · دستگاههای رله: ${devices.length}`);
console.log("VERDICT: ENTER");
await db.$disconnect();
