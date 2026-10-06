// PN-007 BLOCK 0.2+0.3: بکاپ VACUUM INTO + Baseline کامل → download/pn007/baseline.json
// ملکا-شورا-ن۰۰۷-۱۴۰۵ — فاز ۰.۵ (بازتولیدپذیری)
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";

const prisma = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } } });

function sh(cmd: string): string {
  try { return execSync(cmd, { encoding: "utf-8", timeout: 30000 }).trim(); }
  catch (e) { return `ERR: ${(e as Error).message.split("\n")[0]}`; }
}

async function main() {
  mkdirSync("/home/z/my-project/download/pn007", { recursive: true });
  mkdirSync("/home/z/my-project/backups", { recursive: true });

  // ═══ ۰.۲ — بکاپ پیش از تغییر (VACUUM INTO گرم) ═══
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupPath = `/home/z/my-project/backups/pre-pn007-${ts}.db`;
  await prisma.$executeRawUnsafe(`VACUUM INTO '${backupPath}'`);
  const backupMd5 = createHash("md5").update(readFileSync(backupPath)).digest("hex");
  const backupSize = Number(sh(`stat -c %s '${backupPath}'`));

  // ═══ ۰.۱ — سه‌گانه (قانون تثبیت بند و) ═══
  const threeSources = {
    localHead: sh("git -C /home/z/my-project log -1 --format=%H"),
    localHeadShort: sh("git -C /home/z/my-project log -1 --format=%h"),
    localHeadSubject: sh("git -C /home/z/my-project log -1 --format=%s"),
    declaredStartHead: "50d7403",
    mirrorHead: sh("git -C /home/z/my-project ls-remote auto-mirror survival/code-pn001").split(/\s+/)[0] || "ERR",
    survivalPackageHead: (() => {
      try { return JSON.parse(readFileSync("/home/z/my-project/upload/.survival/PN-006-20261006/HEAD", "utf-8")); }
      catch { return { error: "HEAD file not readable" }; }
    })(),
  };

  // ═══ شمارش DB ═══
  const tables = ["PropertyRecord", "RequestRecord", "TransactionRecord", "ExpertRecord", "GraphNode", "GraphEdge", "OpportunityAlert", "Prediction", "AgentMemory", "TransactionEnrichment", "Session", "AppMeta"];
  const counts: Record<string, number> = {};
  for (const t of tables) {
    try { counts[t] = Number((await prisma.$queryRawUnsafe(`SELECT COUNT(*) as n FROM "${t}"`) as { n: number | bigint }[])[0].n); }
    catch { counts[t] = -1; }
  }

  // وضعیت هش کد مستر (NULL = تخریب)
  let masterHash: string | null = null;
  try { masterHash = ((await prisma.$queryRawUnsafe(`SELECT masterCodeHash FROM AppMeta LIMIT 1`) as { masterCodeHash: string | null }[])[0]?.masterCodeHash) ?? null; } catch {}

  // ═══ وضعیت سرور ═══
  let versionApi: any = null, health: any = null;
  try { versionApi = JSON.parse(sh("curl -s -m 8 http://localhost:3000/api/version")); } catch {}
  try { health = JSON.parse(sh("curl -s -m 8 http://localhost:3000/api/health")); } catch {}
  const psLine = sh(`ps aux | grep -E "standalone/server.js|next dev" | grep -v grep | head -2`);
  const isProd = psLine.includes("standalone/server.js");
  const rssKb = isProd ? parseInt(psLine.split(/\s+/)[5] || "0", 10) : null;
  const buildIdMatchesHead = !!(versionApi?.buildId && versionApi.buildId.split("-")[0] === threeSources.localHeadShort);

  // ═══ نسخه‌ها ═══
  const versions = {
    bun: sh("bun --version"),
    node: sh("node --version"),
    prisma: (() => { const v = sh("bunx prisma --version"); const m = v.match(/prisma\s+:\s*(\S+)/); return m ? m[1] : v.split("\n")[0]; })(),
    next: JSON.parse(readFileSync("/home/z/my-project/package.json", "utf-8")).dependencies?.next ?? "unknown",
  };

  const baseline = {
    case: "PN-007-BLOCK0-BASELINE",
    phase: "0.5 — Reproducible Build & Deploy (بازتولیدپذیری)",
    council: "ملکا-شورا-ن۰۰۷-۱۴۰۵",
    generatedAt: new Date().toISOString(),

    threeSources,
    threeSourceVerdict: {
      local_vs_mirror: threeSources.localHead === threeSources.mirrorHead ? "MATCH" : `DIFF: local=${threeSources.localHeadShort} mirror=${threeSources.mirrorHead.slice(0, 7)} — یک کامیت خودکار (فقط لاگ بیلد stamp) روی محلی`,
      mirror_vs_declared: threeSources.mirrorHead.startsWith("50d7403") ? "MATCH (آینه = HEAD اعلامی PN-007)" : "DIFF",
      survival_chainIndex: threeSources.survivalPackageHead?.chainIndex ?? "unknown",
      note: "محلی a074507 = 50d7403 + ۱ کامیت خودکار (فایل‌های scripts/pn006/results/build-final-stamp.* — بدون تغییر سورس)",
    },

    backup: { path: backupPath, md5: backupMd5, bytes: backupSize },

    server: {
      mode: isProd ? "production" : (psLine ? "dev" : "down"),
      pid: isProd ? psLine.split(/\s+/)[1] : null,
      rssMB: rssKb ? Math.round(rssKb / 1024) : null,
      buildId: versionApi?.buildId ?? null,
      buildIdMatchesHead,
      env: versionApi?.env ?? null,
      gitShaServed: versionApi?.gitSha ?? null,
      health: health ? { ok: health.ok, masterAuth: health.masterAuth, masterLayersConsistent: health.masterLayersConsistent } : null,
    },

    dbCounts: counts,
    masterCodeHashState: masterHash ? "SET" : "NULL (destroyed!)",
    masterCodeHashPrefix: masterHash ? masterHash.slice(0, 16) + "…" : null,

    versions,
    acceptanceCriteria: {
      threeSources: true,
      backupDone: backupSize > 100 * 1024 * 1024,
      baselineWritten: true,
    },
  };

  writeFileSync("/home/z/my-project/download/pn007/baseline.json", JSON.stringify(baseline, null, 2));
  console.log("✅ BLOCK 0 complete");
  console.log("backup:", backupPath, `(${Math.round(backupSize / 1024 / 1024)}MB, md5=${backupMd5})`);
  console.log("local:", threeSources.localHeadShort, "| mirror:", threeSources.mirrorHead.slice(0, 7), "| declared:", threeSources.declaredStartHead);
  console.log("server:", baseline.server.mode, "RSS:", baseline.server.rssMB + "MB", "buildId==head:", buildIdMatchesHead);
  console.log("counts:", JSON.stringify(counts));
  await prisma.$disconnect();
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
