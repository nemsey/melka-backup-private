/**
 * P6545 / گام ۱ — اجرای زیرساخت روی دادهٔ واقعی + شواهد
 * ---------------------------------------------------------------------------
 * · ساخت سه گراف از دادهٔ واقعی (M1+M2+M3+M4) → download/p6545/graphs-proof.json
 * · پاک‌سازی دادهٔ مرده (فقط آرشیو) → download/p6545/cleanup-proof.json
 * · هشدار فرصت (≥۵ هشدار واقعی) → download/p6545/alerts-proof.json
 * · تست traverse/findPath روی دادهٔ واقعی
 */
import { PrismaClient } from "@prisma/client";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { GraphService } = require_("../src/core/graphs/graph-service.ts") as typeof import("../src/core/graphs/graph-service");
const { buildPropertyGraph, buildPeopleGraph, buildTransactionGraph } = require_("../src/core/graphs/graph-builders.ts") as typeof import("../src/core/graphs/graph-builders");
const { CleanupService } = require_("../src/core/maintenance/cleanup.ts") as typeof import("../src/core/maintenance/cleanup");
const { OpportunityListener } = require_("../src/core/matching/opportunity-listener.ts") as typeof import("../src/core/matching/opportunity-listener");
const { tierFromRealData } = require_("../src/core/intelligence/p7-core.ts") as typeof import("../src/core/intelligence/p7-core");

const OUT = "/home/z/my-project/download/p6545";

async function main() {
  mkdirSync(OUT, { recursive: true });
  const db = new PrismaClient();
  const service = new GraphService(db);

  /* ═══ ۱) سه گراف ═══ */
  console.log("── ساخت گراف ۱: ملک ──");
  const propertyReport = await buildPropertyGraph(db, service);
  console.log(`گراف ملک: ${propertyReport.nodesWritten} گره نوشته‌شده (کاندید) · ${propertyReport.edgesWritten} یال`);
  console.log("── ساخت گراف ۲: افراد ──");
  const peopleReport = await buildPeopleGraph(db, service);
  console.log(`گراف افراد: ${peopleReport.nodesWritten} گره · ${peopleReport.edgesWritten} یال`);
  console.log("── ساخت گراف ۳: معاملات ──");
  const transactionReport = await buildTransactionGraph(db, service);
  console.log(`گراف معاملات: ${transactionReport.nodesWritten} گره · ${transactionReport.edgesWritten} یال`);

  const [propertyStats, peopleStats, transactionStats] = await Promise.all([
    service.stats("property"),
    service.stats("people"),
    service.stats("transaction"),
  ]);
  const totalNodes = propertyStats.nodes + peopleStats.nodes + transactionStats.nodes;
  const totalEdges = propertyStats.edges + peopleStats.edges + transactionStats.edges;
  console.log(`\nمجموع: ${totalNodes} گره · ${totalEdges} یال (هدف: ≥۱۰۰۰ گره · ≥۵۰۰۰ یال)`);

  // تست traverse روی دادهٔ واقعی: ملک → منطقه/مالک/کارشناس
  const sampleProperty = await db.graphNode.findFirst({ where: { graph: "property", nodeType: "property" }, orderBy: { refId: "asc" } });
  let traverseSample: unknown = null;
  let pathSample: unknown = null;
  if (sampleProperty) {
    const paths = await service.traverse("property", { nodeType: "property", refId: sampleProperty.refId }, { maxDepth: 2, limit: 10 });
    traverseSample = paths.slice(0, 5);
    // findPath: ملک → کارشناس (از طریق listed_by)
    const expertEdge = await db.graphEdge.findFirst({ where: { graph: "property", edgeType: "listed_by", fromRef: sampleProperty.refId } });
    if (expertEdge) {
      const p = await service.findPath("property", { nodeType: "property", refId: sampleProperty.refId }, { nodeType: "expert", refId: expertEdge.toRef }, { maxDepth: 2 });
      pathSample = p;
    }
  }
  const dangling = { property: await service.danglingEdges("property"), people: await service.danglingEdges("people"), transaction: await service.danglingEdges("transaction") };

  const graphsProof = {
    case: "P6545-graphs",
    council: "جلسه ۰۳۳ — BLOCK 1.2: سه گراف اصلی با حداقل ۱۰۰۰ گره و ۵۰۰۰ یال",
    builtAt: new Date().toISOString(),
    sources: { M1: "PropertyRecord (آگهی)", M2: "RequestRecord (درخواست)", M3: "TransactionRecord + TransactionEnrichment (معاملات)", M4: "ExpertRecord (کارشناسان)", PM: "PmPersonnelRecord" },
    reports: [propertyReport, peopleReport, transactionReport],
    stats: { property: propertyStats, people: peopleStats, transaction: transactionStats },
    totals: { nodes: totalNodes, edges: totalEdges, targetNodes: 1000, targetEdges: 5000, nodesPassed: totalNodes >= 1000, edgesPassed: totalEdges >= 5000 },
    realDataTests: { traverseSample, pathSample, danglingEdges: dangling },
  };
  writeFileSync(`${OUT}/graphs-proof.json`, JSON.stringify(graphsProof, null, 2));
  console.log(`✓ شاهد گراف‌ها: download/p6545/graphs-proof.json`);

  /* ═══ ۲) پاک‌سازی دادهٔ مرده (فقط آرشیو) ═══ */
  console.log("\n── پاک‌سازی دادهٔ مرده (صفر حذف) ──");
  const cleanup = new CleanupService(db);
  const cleanupReport = await cleanup.run();
  console.log(`یافت: ${cleanupReport.found} (یتیم ${cleanupReport.byPriority["1"]} · تکراری ${cleanupReport.byPriority["2"]} · کهنه ${cleanupReport.byPriority["3"]}) → آرشیوشده: ${cleanupReport.archived} · حذف: 0`);
  writeFileSync(`${OUT}/cleanup-proof.json`, JSON.stringify(cleanupReport, null, 2));
  console.log(`✓ شاهد پاک‌سازی: download/p6545/cleanup-proof.json`);

  /* ═══ ۳) هشدار فرصت ═══ */
  console.log("\n── هشدار فرصت (تطبیق ≥ ۰٫۷) ──");
  // Tier واقعی از دادهٔ پیامد
  const { readFileSync } = await import("node:fs");
  const outcomes = readFileSync("/home/z/my-project/intelligence-data/outcomes.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const { tier } = tierFromRealData(outcomes.map((o) => ({ observedAt: o.occurredAt, ...o })) as never[]);
  const listener = new OpportunityListener(db, tier);
  const backfill = await listener.backfillRecent({ listings: 12, requests: 6 });
  const alerts = await listener.alerts(20);
  console.log(`هشدارهای تولیدشده: ${backfill.alertsCreated} از ${backfill.evaluated} کاندیدای ارزیابی‌شده — تازه‌ترین امتیازها: ${backfill.topScores.slice(0, 5).join(", ")}`);
  const alertsProof = {
    case: "P6545-opportunity-alerts",
    council: "جلسه ۰۳۳ — BLOCK 1.4: ۵ هشدار واقعی روی دادهٔ زنده (آستانهٔ ۰٫۷ · صفر اجرای خودکار)",
    runAt: new Date().toISOString(),
    tier,
    threshold: 0.7,
    backfill,
    alerts: alerts.map((a) => ({ id: a.id, direction: a.direction, listingCode: a.listingCode, requestId: a.requestId, score: a.matchScore, topReasons: a.matchReasons.slice(0, 3) })),
    target: 5,
    passed: alerts.length >= 5,
    constraint: "صفر اجرای خودکار — فقط هشدار",
  };
  writeFileSync(`${OUT}/alerts-proof.json`, JSON.stringify(alertsProof, null, 2));
  console.log(`✓ شاهد هشدارها: download/p6545/alerts-proof.json (${alerts.length} هشدار ≥ ${5} هدف: ${alerts.length >= 5 ? "PASS" : "FAIL"})`);

  await db.$disconnect();
  console.log("\n=== پایان اجرای زیرساخت گام ۱ ===");
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
