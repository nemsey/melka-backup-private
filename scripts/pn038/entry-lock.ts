// PN-038 · فاز ۰ — قفل ورود: بکاپ گرم + شاهد وضعیت زندهٔ سیستم
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, statSync, readFileSync, copyFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const REPO = "/home/z/my-project";
const OUT = `${REPO}/download/pn038`;
mkdirSync(OUT, { recursive: true });

const sh = (cmd: string): string => {
  try {
    return execSync(cmd, { encoding: "utf8", timeout: 120_000, cwd: REPO }).trim();
  } catch (e: any) {
    return `ERROR: ${String(e.message).slice(0, 300)}`;
  }
};
const md5file = (p: string): string => (existsSync(p) ? createHash("md5").update(readFileSync(p)).digest("hex") : "MISSING");

const stamp = "20261017T124600Z";
const dbPath = `${REPO}/db/custom.db`;
const backupPath = `${REPO}/backups/pre-pn038-${stamp}.Z.db`;

const prisma = new PrismaClient();

async function main() {
  // 1) بکاپ گرم VACUUM INTO
  let vacuum = "OK";
  try {
    await prisma.$queryRawUnsafe(`VACUUM INTO '${backupPath}'`);
  } catch (e: any) {
    vacuum = `ERR ${String(e.message).slice(0, 200)}`;
    copyFileSync(dbPath, backupPath); // fallback: کپی سرد
  }

  // 2) integrity زنده
  let integrity: any = "ERR";
  try {
    integrity = await prisma.$queryRawUnsafe(`PRAGMA integrity_check`);
  } catch (e: any) { integrity = String(e.message).slice(0, 200); }

  // 3) شمارش دادهٔ مقدس (زنده)
  const sacred: Record<string, number | string> = {};
  for (const t of ["ArmListing", "ArmRequest", "PmTransaction", "PmExpert", "PmHire", "RelayJob", "GlmProbe", "ArmConnection", "PmConnection", "AppSession"]) {
    try {
      const r: any = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as c FROM ${t}`);
      sacred[t] = r[0].c;
    } catch { sacred[t] = "NO-TABLE"; }
  }

  // 4) رله: دستگاه‌ها + کارهای اخیر + گروه وضعیت
  let relay: any = "ERR";
  try {
    const devices = await prisma.relayDevice.findMany({ orderBy: { id: "desc" }, take: 5, select: { id: true, deviceId: true, status: true, enrolledAt: true, lastSeenAt: true } });
    const recent = await prisma.relayJob.findMany({ orderBy: { id: "desc" }, take: 8, select: { id: true, kind: true, status: true, createdAt: true, updatedAt: true } });
    const byStatus = await prisma.relayJob.groupBy({ by: ["status"], _count: { _all: true } });
    relay = { devices, recent, byStatus };
  } catch (e: any) { relay = String(e.message).slice(0, 300); }

  await prisma.$disconnect();

  // 5) سرور زنده
  const health = sh(`curl -s -m 10 http://localhost:3000/api/health`);
  const version = sh(`curl -s -m 10 http://localhost:3000/api/version`);

  // 6) گیت
  const gitHead = sh(`git rev-parse HEAD`);
  const gitSubject = sh(`git log -1 --format=%s`).slice(0, 120);
  const gitDirty = sh(`git status --short`).split("\n").filter(Boolean);
  const buildId = existsSync(`${REPO}/.next/BUILD_ID`) ? readFileSync(`${REPO}/.next/BUILD_ID`, "utf8").trim() : "MISSING";
  const backupSizeMB = existsSync(backupPath) ? (statSync(backupPath).size / 1048576).toFixed(1) : "0";

  let versionParsed: any = null;
  try { versionParsed = { gitSha: (JSON.parse(version)?.fingerprint?.gitSha) ?? JSON.parse(version)?.gitSha, buildId: JSON.parse(version)?.buildId }; } catch { versionParsed = version.slice(0, 200); }
  let healthParsed: any = null;
  try { healthParsed = JSON.parse(health); } catch { healthParsed = health.slice(0, 200); }

  const witness = {
    at: new Date().toISOString(),
    task: "PN-038 فاز ۰ — قفل ورود (جلسهٔ دوم، بعد از مرگ جلسهٔ اول)",
    backup: { path: backupPath, md5: md5file(backupPath), sizeMB: backupSizeMB, vacuum, sourceDb: dbPath },
    liveDb: { integrity, sacredCounts: sacred },
    live: { health: healthParsed, buildId, versionFingerprint: versionParsed },
    relay,
    git: {
      head: gitHead,
      headSubject: gitSubject,
      dirty: gitDirty,
      note: "درخت روی فاز ۲ (6631a03)؛ فازهای ۳-۶ جلسهٔ مرده در reflog: ec20da0 → d930d67 + snapshot 323f061",
    },
    findings: {
      liveVersionVerdict: "FAIL-PLANNED-FIX: بیلد زنده 1425ee0-20261017-0723 (کامیت ۱۰ اکتبر) — پلتفرم ساعت ۰۷:۲۳ درخت را به 1425ee0 برگرداند (بازگشت چهاردهم)؛ جلسهٔ اول درخت را بازیابی و فازهای ۱-۶ را کامیت کرد اما پیش از بیلد/ری‌استارت مرد — سرور زنده هنوز نسخهٔ پیش از PN-036 است",
      resetGuard1224: "reset-guard در ۱۲:۲۴ (BUILD-STALE + ahead-of-mirror) درخت را به 6631a03 = main آینه برگرداند؛ گارد دادهٔ مقدس فاز ۱ BLOCK کرد (live-richer-rowcounts) و دیتابیس زنده نجات یافت — شاهد زندهٔ کارکرد قانون دادهٔ مقدس",
      deadSessionCommits: ["ec20da0", "6be4086", "3893db5", "3c505f6", "f3d10d7", "c95fda4", "d930d67"],
      recoveryPlan: "git reset --hard d930d67 → پوش فوری آینه (سپر در برابر چرخهٔ بعدی reset-guard ~۱۲:۵۴) → دو-سبز → بیلد → ری‌استارت سرور و Worker",
    },
  };
  const stringify = (_k: string, v: any) => (typeof v === "bigint" ? Number(v) : v);
  writeFileSync(`${OUT}/entry-lock.json`, JSON.stringify(witness, stringify, 2));
  console.log(JSON.stringify({ ok: true, backup: { path: backupPath, md5: witness.backup.md5, sizeMB: backupSizeMB }, integrity, sacred, relayDevices: Array.isArray(relay) ? relay : relay?.devices?.length, buildId, head: gitHead.slice(0, 8) }, stringify, 2));
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
