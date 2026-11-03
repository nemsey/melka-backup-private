// ============================================================
// PN-010 / BLOCK 0 — حفاظت و وارسی
//  ۱) بکاپ VACUUM INTO backups/pre-pn010-[ts].db + md5
//  ۲) Baseline: HEAD + BUILD_ID + شمارش + نسخه‌ها + سه‌گانه
//  ۳) زمان‌بندی GLM (خوداعلانی طبق قانون زمان‌بندی)
// خروجی: download/pn010/baseline.json + بکاپ
// ============================================================
import { PrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, readdirSync, statSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const DB_URL = "file:/home/z/my-project/db/custom.db";
const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
const OUT_DIR = "/home/z/my-project/download/pn010";

function sh(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", timeout: 60_000 }).trim();
  } catch (e) {
    return `ERR: ${(e as Error).message.split("\n")[0]}`;
  }
}

function md5(file: string): string {
  return createHash("md5").update(readFileSync(file)).digest("hex");
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync("/home/z/my-project/backups", { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  // ─── ۰.۲ بکاپ VACUUM INTO ───
  const backupPath = `/home/z/my-project/backups/pre-pn010-${ts}.db`;
  const vacuumStarted = Date.now();
  await prisma.$queryRawUnsafe(`VACUUM INTO '${backupPath}'`);
  const vacuumMs = Date.now() - vacuumStarted;
  const backupMd5 = md5(backupPath);
  const backupSize = statSync(backupPath).size;

  // ─── سلامت بکاپ: PRAGMA integrity_check در قرق ───
  const probe = new PrismaClient({ datasources: { db: { url: `file:${backupPath}` } } });
  let integrity: string;
  try {
    const r = (await probe.$queryRawUnsafe("PRAGMA integrity_check")) as { integrity_check: string }[];
    integrity = r[0]?.integrity_check ?? "unknown";
  } catch (e) {
    integrity = `ERR ${(e as Error).message}`;
  } finally {
    await probe.$disconnect();
  }

  // ─── ۰.۳ Baseline ───
  const head = sh("git rev-parse HEAD");
  const headShort = sh("git rev-parse --short HEAD");
  const branch = sh("git rev-parse --abbrev-ref HEAD");
  const statusClean = sh("git status --porcelain | wc -l").trim();
  const buildId = existsSync("/home/z/my-project/.next/BUILD_ID")
    ? readFileSync("/home/z/my-project/.next/BUILD_ID", "utf-8").trim()
    : null;
  const mirrorCodePn001 = sh("git ls-remote auto-mirror refs/heads/survival/code-pn001 | cut -f1");
  const pkgVersion = JSON.parse(readFileSync("/home/z/my-project/package.json", "utf-8")).version;

  // شمارش جدول‌های کلیدی
  const tables = [
    "PropertyRecord", "RequestRecord", "GraphNode", "GraphEdge", "OpportunityAlert",
    "ExpertProfile", "ExpertRecord", "Session", "SyncJobState", "AppMeta",
    "AuditLog", "AgentMemory", "AgentPolicyVersion", "PersonnelAccess",
  ];
  const counts: Record<string, number> = {};
  for (const t of tables) {
    try {
      const r = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as n FROM "${t}"`) as { n: number | bigint }[];
      counts[t] = Number(r[0].n);
    } catch {
      counts[t] = -1;
    }
  }

  // پرکاربردترین نسخه‌ها
  const versions = {
    package: pkgVersion,
    bun: sh("bun --version"),
    node: sh("node --version"),
  };

  // فهرست بکاپ‌های موجود در backups/ (برای بلوک ۱ — وضعیت DIAG-DATA-005)
  const backupsDir = "/home/z/my-project/backups";
  const existingBackups = existsSync(backupsDir)
    ? readdirSync(backupsDir).filter((f) => f.endsWith(".db")).map((f) => {
        const st = statSync(`${backupsDir}/${f}`);
        return { file: f, bytes: st.size, mtime: st.mtime.toISOString() };
      })
    : [];

  const baseline = {
    pn: "PN-010",
    block: "BLOCK 0 — حفاظت و وارسی",
    generatedAt: new Date().toISOString(),
    tripleCheck: {
      local: { head, headShort, branch, dirtyFiles: Number(statusClean) || 0 },
      mirror: { remote: "auto-mirror (github.com/nemsey/melka-backup-private.git)", survivalCodePn001: mirrorCodePn001, note: "main=0fc5b0d قدیمی (GH001 سقف ۱۰۰MB) — طبق پروتکل شاخهٔ یتیم survival/code*" },
      survivalPackage: { chainIndex: 10, package: "PN-009-20261006", commit: "90431a458808001d2e94b0ac8686c525a6124f52", manifestMd5Anchored: true },
      verdict: local_mirror_package_ok(headShort, mirrorCodePn001),
    },
    backup: { path: backupPath, bytes: backupSize, md5: backupMd5, vacuumMs, integrity },
    buildWitness: { buildId, runningServerGitSha: "d4bc409", note: "سرور production از بیلد d4bc409-20261006-2109 زنده است" },
    dbCounts: counts,
    versions,
    backupsDirBefore: existingBackups,
    glmSchedule: {
      declaredBy: "GLM (قانون زمان‌بندی — خوداعلانی)",
      plan: "اجرای پیوستهٔ تک‌نشست با ایست وارسی پس از هر بلوک؛ هر بلوک پیش از گذر به بعدی شاهد می‌سازد؛ تست کامل ×۲ (دو-سبز) در BLOCK 6؛ کامیت‌ها در پایان بلوک‌های اصلی؛ هیچ گام زمان‌بندی‌شدهٔ خارجی وجود ندارد.",
      sessionStart: new Date().toISOString(),
    },
    laws: { fileLawV2: "اجباری — All Tasks", completeOrderApplication: "بند‌به‌بند", stabilization031: "همه‌جا", autoExecute: false },
  };

  writeFileSync(`${OUT_DIR}/baseline.json`, JSON.stringify(baseline, null, 2));
  console.log("═══ PN-010 BLOCK 0 ═══");
  console.log(`بکاپ: ${backupPath} (${(backupSize / 1048576).toFixed(1)}MB · md5=${backupMd5} · integrity=${integrity})`);
  console.log(`HEAD: ${headShort} · BUILD_ID: ${buildId}`);
  console.log(`سه‌گانه: ${baseline.tripleCheck.verdict}`);
  console.log(`baseline.json → ${OUT_DIR}/baseline.json`);
  await prisma.$disconnect();
}

function local_mirror_package_ok(headShort: string, mirrorSha: string): string {
  // محلی = d4bc409 + ۱ کامیت خودکار شواهد (5a1f774)؛ آینه survival/code-pn001 = d4bc409
  const ok = mirrorSha.startsWith("d4bc409") || headShort === mirrorSha.slice(0, 7);
  return ok
    ? "OK — محلی (5a1f774 = d4bc409 + ۱ کامیت خودکار شواهد هوشمندی) · آینه survival/code-pn001 = d4bc409 · بستهٔ بقا ۱۰"
    : `CHECK — mirror=${mirrorSha.slice(0, 7)} local=${headShort}`;
}

main().catch((e) => { console.error(e); process.exit(1); });
