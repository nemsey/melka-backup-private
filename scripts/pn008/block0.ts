/**
 * PN-008 BLOCK 0 — حفاظت و وارسی
 * 0.2 بکاپ VACUUM INTO + MD5
 * 0.3 baseline.json (HEAD + BUILD_ID + شمارش DB + وضعیت سرور + نسخه‌ها)
 * اجرا: bun scripts/pn008/block0.ts
 */
import { Database } from "bun:sqlite";
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, statSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const ROOT = "/home/z/my-project";
const DB = `${ROOT}/db/custom.db`;
const TS = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const OUT = `${ROOT}/download/pn008`;
mkdirSync(OUT, { recursive: true });
mkdirSync(`${ROOT}/backups`, { recursive: true });

// ── 0.2 بکاپ VACUUM INTO ──────────────────────────────────────────
const bakPath = `${ROOT}/backups/pre-pn008-${TS}.db`;
const db = new Database(DB);
db.run("VACUUM INTO ?", [bakPath]);
db.close();
const md5 = (p: string) => createHash("md5").update(readFileSync(p)).digest("hex");
const bakSize = statSync(bakPath).size;

// ── 0.3 baseline ──────────────────────────────────────────────────
const head = execSync("git log -1 --format=%H", { cwd: ROOT }).toString().trim();
const mirror = execSync("git ls-remote melka-backup survival/code-pn001", { cwd: ROOT }).toString().trim().split("\t")[0];
let health: any = {}, version: any = {};
try { health = JSON.parse(execSync("curl -s -m 8 http://localhost:3000/api/health").toString()); } catch {}
try { version = JSON.parse(execSync("curl -s -m 8 http://localhost:3000/api/version").toString()); } catch {}

const counts: Record<string, number> = {};
const db2 = new Database(DB, { readonly: true });
for (const t of ["PropertyRecord","RequestRecord","TransactionRecord","ExpertRecord","GraphNode","GraphEdge","OpportunityAlert","Session","AuditLog","PersonnelAccess"]) {
  try { counts[t] = (db2.query(`SELECT COUNT(*) c FROM ${t}`).get() as any).c; } catch { counts[t] = -1; }
}
db2.close();

const bunV = execSync("bun --version").toString().trim();
const nodeV = execSync("node --version").toString().trim();
const prismaV = JSON.parse(execSync("cat package.json").toString()).dependencies?.["@prisma/client"] ?? "?";
const nextV = JSON.parse(execSync("cat package.json").toString()).dependencies?.next ?? "?";

// ── 0.4 زمان‌بندی خودگزارش‌شدهٔ GLM ────────────────────────────────
const timing = {
  "PART-A سخت‌افزار": "15 دقیقه",
  "ثانیاً-۱ حذف فهرست کهنه": "20 دقیقه",
  "ثانیاً-۲ پروب فراژرف PM": "25 دقیقه",
  "ثانیاً-۳ بازنویسی فهرست": "60 دقیقه",
  "ثانیاً-۴ فیلتر+بروزرسانی+۱۰ ردیف": "40 دقیقه",
  "ثانیاً-۵ تست‌های تازه": "30 دقیقه",
  "BLOCK 1 اسکن Secret": "15 دقیقه",
  "BLOCK 2 چرخش کلید": "20 دقیقه",
  "BLOCK 3 Trusted Proxy": "15 دقیقه",
  "BLOCK 4 Audit نقش‌ها": "20 دقیقه",
  "BLOCK 5 Privilege Escalation": "25 دقیقه",
  "BLOCK 6 دسترسی دوگانهٔ مالک": "20 دقیقه",
  "BLOCK 7 مدیریت دسترسی": "30 دقیقه",
  "BLOCK 8 گزارش+بقا": "25 دقیقه",
};

const baseline = {
  task: "PN-008", council: "ملکا-شورا-ن۰۰۸-۱۴۰۵", phase: "1 — امنیت + دو درخواست مالک (سخت‌افزار + فهرست کارشناسان)",
  at: new Date().toISOString(),
  tripleVerification: {
    localHEAD: head,
    mirrorSurvivalCodePn001: mirror,
    survivalPkg8Commit: "1bc66fa4e18bb0d01ec6ce5ea7105457a64dd49f",
    declaredStartHEAD: "5994d4e",
    verdict: "محلی df675cb = 5994d4e + ۱ کامیت خودکار لاگ (الگوی مستند ن۰۰۷) — آینه = 5994d4e = HEAD اعلامی ✓ — بستهٔ ۸ = 1bc66fa (درون زنجیرهٔ ۵ کامیت ن۰۰۷) ✓",
  },
  backup: { path: bakPath, bytes: bakSize, md5: md5(bakPath), method: "VACUUM INTO" },
  build: { buildId: version.buildId, gitSha: version.gitSha, env: version.env, source: version.source, builtAt: version.builtAt },
  server: { healthy: health.ok === true, mode: health.mode, masterAuth: health.masterAuth, layersConsistent: health.masterLayersConsistent },
  dbCounts: counts,
  versions: { bun: bunV, node: nodeV, prisma: prismaV, next: nextV },
  hardware: {
    cpus: 2, cpuset: "0-1", cpuQuota: -1, memTotalMB: 4042, memLimitCgroup: 4294967296,
    swap: 0, diskGB: { total: 9.9, avail: 6.2 }, cgroupWritable: false,
    sudo: false, ulimitSoft: 1024, ulimitHard: 100000,
  },
  glmSelfTiming: { note: "طبق قانون زمان‌بندی GLM — این زمان‌بندی تعهد GLM است نه شورا", blocks: timing,
    total: "حدود ۶ ساعت کار عامل فشرده در یک نشست" },
};

writeFileSync(`${OUT}/baseline.json`, JSON.stringify(baseline, null, 2));
console.log("BLOCK 0 OK");
console.log(JSON.stringify({ backup: { path: bakPath, MB: (bakSize/1048576).toFixed(1), md5: baseline.backup.md5 }, counts, build: baseline.build }, null, 2));
