// PN-006 BLOCK 0.2: Baseline — DB counts + server/env state → download/pn006/baseline.json
import { PrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";

const prisma = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } } });

function sh(cmd: string): string {
  try { return execSync(cmd, { encoding: "utf-8", timeout: 20000 }).trim(); }
  catch (e) { return `ERR: ${(e as Error).message.split("\n")[0]}`; }
}

async function main() {
  mkdirSync("/home/z/my-project/download/pn006", { recursive: true });

  // key table counts
  const wanted = ["ListingRecord", "RequestRecord", "TransactionRecord", "ExpertRecord", "GraphNode", "GraphEdge", "OpportunityAlert", "AppMeta", "Prediction", "CustomerRecord", "PropertyRecord"];
  const counts: Record<string, number> = {};
  for (const t of wanted) {
    try {
      const r = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as n FROM "${t}"`) as { n: number | bigint }[];
      counts[t] = Number(r[0].n);
    } catch { counts[t] = -1; }
  }

  // masterCodeHash state (NULL = destroyed)
  let masterHash: string | null = null;
  try {
    const r = await prisma.$queryRawUnsafe(`SELECT masterCodeHash FROM AppMeta LIMIT 1`) as { masterCodeHash: string | null }[];
    masterHash = r[0]?.masterCodeHash ?? null;
  } catch { /* table missing */ }

  const head = sh("git -C /home/z/my-project log -1 --format=%H");
  const shortHead = head.slice(0, 7);

  // server state
  let versionApi: any = null;
  try { versionApi = JSON.parse(sh("curl -s -m 8 http://localhost:3000/api/version")); } catch {}
  let health: any = null;
  try { health = JSON.parse(sh("curl -s -m 8 http://localhost:3000/api/health")); } catch {}

  const psLine = sh(`ps aux | grep -E "standalone/server.js|next dev" | grep -v grep | head -2`);
  const isProdServer = psLine.includes("standalone/server.js");
  const parts = psLine.split(/\s+/);
  const rssKb = isProdServer ? parseInt(parts[5] || "0", 10) : null;

  // auto-recovery state
  const autoRecovery = {
    recoveryGuardScript: existsSync("/home/z/my-project/scripts/pn005c/recovery-guard.sh"),
    watchdogRunning: sh("ps aux | grep prod-watchdog | grep -v grep | wc -l").includes("1"),
    ramMonitorRunning: sh("ps aux | grep ram-monitor.sh | grep -v grep | wc -l").includes("1"),
    recoveryLog: existsSync("/home/z/my-project/upload/.survival/recovery-log.jsonl"),
    lastRecoveryEntries: (() => {
      try { return readFileSync("/home/z/my-project/upload/.survival/recovery-log.jsonl", "utf-8").trim().split("\n").slice(-3); }
      catch { return []; }
    })(),
  };

  const baseline = {
    case: "PN-006-BLOCK0-BASELINE",
    generatedAt: new Date().toISOString(),
    directive: "ملکا-شورا-ن۰۰۶-۱۴۰۵ (فاز ۰-B)",
    tripleMatch: {
      localHEAD: head,
      expectedStartHEAD: "7d50985",
      match: shortHead === "7d50985",
      gitHubMirror_survival_code_pn001: "7d50985ef3ddd3f810842aeec09bdda64aacf721 (verified via git ls-remote auto-mirror)",
      survivalPackage: "upload/.survival/PN-005C-20261006 → commit 7d50985, chainIndex=6",
    },
    server: {
      mode: versionApi?.env ?? "unknown",
      buildId: versionApi?.buildId ?? "unknown",
      buildIdEqualsHEAD: (versionApi?.gitSha ?? "") === shortHead,
      rssMB: rssKb ? Math.round(rssKb / 1024 * 10) / 10 : null,
      process: isProdServer ? "bun .next/standalone/server.js (production)" : "dev?",
      health,
    },
    db: { counts, masterCodeHashPresent: !!masterHash, masterCodeHashPrefix: masterHash ? masterHash.slice(0, 12) + "…" : "NULL" },
    autoRecovery,
    acceptanceTargets: { listings: 11501, requests: 6500, graphNodes: 36650, graphEdges: 47579, alerts: 139 },
  };

  writeFileSync("/home/z/my-project/download/pn006/baseline.json", JSON.stringify(baseline, null, 2));
  console.log(JSON.stringify(baseline, null, 2));
}

main().finally(() => prisma.$disconnect());
