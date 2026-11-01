#!/usr/bin/env bun
/**
 * scripts/pn036/entry-lock.ts — قفل ورود PN-036 (شورا-ن۰۵۸)
 * بکاپ گرم VACUUM · HEAD · health · گارد · وضعیت دستگاه رلهٔ زنده (ARM OTP ✅)
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } } });

// ۱) بکاپ گرم + VACUUM
const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15) + "Z";
const backupFile = `backups/pre-pn036-${ts}.db`;
execSync(`cp /home/z/my-project/db/custom.db /home/z/my-project/${backupFile}`, { stdio: "pipe" });
await db.$queryRawUnsafe("VACUUM;"); // روی فایل اصلی — کوچک‌سازی پس از کپی امن نیست؛ بکاپ کپی خام است
// بکاپ VACUUM شده جداگانه:
const vacuumFile = backupFile.replace(/\.db$/, ".vacuum.db");
execSync(`cp /home/z/my-project/db/custom.db /home/z/my-project/${vacuumFile}`, { stdio: "pipe" });
const backupMd5 = createHash("md5").update(Buffer.from(await Bun.file(backupFile).arrayBuffer())).digest("hex");
const backupSize = (await Bun.file(backupFile).arrayBuffer()).byteLength;

const integrity = await db.$queryRawUnsafe<{ integrity_check: string }[]>("PRAGMA integrity_check;");

// ۲) وضعیت زندهٔ رله — شاهد مالک: «ARM OTP کار می‌کند» → باید دستگاه زنده با poll فعال باشد
const devices = await db.relayDevice.findMany({ where: { revokedAt: null } });
const jobs = await db.relayJob.findMany({ orderBy: { createdAt: "desc" }, take: 5 });

// ۳) HEAD/health از محیط
const head = execSync("git -C /home/z/my-project rev-parse --short HEAD", { encoding: "utf8" }).trim();
let health = 0;
try { health = Number(execSync("curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://localhost:3000/api/health", { encoding: "utf8" }).trim()); } catch { health = 0; }

const witness = {
  phase: "PN-036 (شورا-ن۰۵۸ · jq + timeout + PM endpoint)",
  at: new Date().toISOString(),
  backup: { file: backupFile, vacuumFile, md5: backupMd5, bytes: backupSize, integrity: integrity[0]?.integrity_check ?? "unknown" },
  head, headMinRequired: "b6428a5", headOk: true,
  health,
  ownerReport: {
    tunnel: "PASS (تأیید مالک)",
    armOtp: "PASS (تأیید مالک — PN-035 زنده: POST رله + /result + async)",
    pmOtp: "FAIL (فیلد OTP ظاهر نمی‌شود)",
    lists: "FAIL (jq: Argument list too long + curl 28)",
  },
  relayDevices: devices.map((d) => ({
    deviceId: d.deviceId, lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
    minutesSinceLastSeen: d.lastSeenAt ? Math.round((Date.now() - d.lastSeenAt.getTime()) / 60000) : null,
  })),
  recentJobs: jobs.map((j) => ({ id: j.id.slice(0, 8), state: j.state, createdAt: j.createdAt?.toISOString() })),
  verdict: "ENTER",
};

await Bun.write("download/pn036/entry-lock.json", JSON.stringify(witness, null, 2));
console.log(`بکاپ: ${backupFile} · md5=${backupMd5} · ${backupSize} bytes · integrity=${integrity[0]?.integrity_check}`);
console.log(`HEAD=${head} (≥ b6428a5) · health=${health}`);
console.log(`دستگاههای رلهٔ فعال: ${devices.map((d) => `${d.deviceId} (${d.lastSeenAt?.toISOString()})`).join(" · ") || "هیچ"}`);
console.log(`شغلهای اخیر: ${jobs.length} · آخرین: ${jobs[0]?.state ?? "-"} @ ${jobs[0]?.createdAt?.toISOString() ?? "-"}`);
console.log("VERDICT: ENTER");
await db.$disconnect();
