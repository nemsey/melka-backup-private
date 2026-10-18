/**
 * PN-005 — بازسازی سه گراف + هشدارهای فرصت + بازتولید حلقهٔ سرنوشت
 * =================================================================
 * پس از تخریب DB (حادثهٔ ۱۶:۳۰ دیروز — بازنشانی محیط + db:push)، جداول
 * GraphNode/GraphEdge/OpportunityAlert صفر شدند. دیمن‌ها دادهٔ کسب‌وکار را
 * از ARM بازگرداندند (۱۱٬۵۰۳ ملک + ۱۱٬۶۵۰ درخواست) اما گراف‌ها محلی
 * ساخته می‌شوند، نه sync — این اسکریپت عین PN-002 «بازسازی پس از بازنشانی»
 * هر سه گراف را از دادهٔ زندهٔ فعلی می‌سازد.
 */
import { PrismaClient } from "@prisma/client";
import { mkdirSync, appendFileSync, writeFileSync, existsSync, readFileSync } from "node:fs";

const db = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } } });
const DIR = "/home/z/my-project/intelligence-data";

async function main() {
  // ── ۱) سه گراف ──
  const { buildPropertyGraph, buildPeopleGraph, buildTransactionGraph, GraphService } = await import("../src/core/graphs");
  const service = new GraphService(db);

  const t0 = Date.now();
  const repProperty = await buildPropertyGraph(db, service);
  console.log(`[graph:property] nodes=${repProperty.nodesWritten} edges=${repProperty.edgesWritten} sources=${JSON.stringify(repProperty.sources)}`);
  const repPeople = await buildPeopleGraph(db, service);
  console.log(`[graph:people] nodes=${repPeople.nodesWritten} edges=${repPeople.edgesWritten}`);
  const repTx = await buildTransactionGraph(db, service);
  console.log(`[graph:transaction] nodes=${repTx.nodesWritten} edges=${repTx.edgesWritten}`);
  const buildMs = Date.now() - t0;

  const [p, pe, t] = await Promise.all([service.stats("property"), service.stats("people"), service.stats("transaction")]);
  const totals = { nodes: p.nodes + pe.nodes + t.nodes, edges: p.edges + pe.edges + t.edges };
  console.log(`[totals] nodes=${totals.nodes} edges=${totals.edges} (${buildMs}ms)`);

  // ── ۲) هشدارهای فرصت (شنونده — پرکردن اولیه از دادهٔ زنده) ──
  const { OpportunityListener } = await import("../src/core/matching/opportunity-listener");
  const listener = new OpportunityListener(db, 3);
  const t1 = Date.now();
  const alertRep = await listener.backfillRecent({ listings: 40, requests: 30 });
  console.log(`[alerts] evaluated=${alertRep.evaluated} created=${alertRep.alertsCreated} top=${JSON.stringify(alertRep.topScores.slice(0, 5))} (${Date.now() - t1}ms)`);

  const alertCount = await db.opportunityAlert.count();
  console.log(`[alerts-total] ${alertCount}`);

  // ── ۳) بازتولید حلقهٔ سرنوشت (پس از تکمیل متراژ) ──
  const { runOutcomeLoop } = await import("../src/lib/intelligence/outcome-loop");
  const t2 = Date.now();
  const result = await runOutcomeLoop(db, new Date());
  mkdirSync(DIR, { recursive: true });
  for (const pr of result.predictions) appendFileSync(`${DIR}/predictions.jsonl`, `${JSON.stringify(pr)}\n`, "utf8");
  for (const o of result.outcomes) appendFileSync(`${DIR}/outcomes.jsonl`, `${JSON.stringify(o)}\n`, "utf8");
  writeFileSync(`${DIR}/loop-latest.json`, `${JSON.stringify(result.summary, null, 2)}\n`, "utf8");
  console.log(`[loop] predictions=${result.predictions.length} outcomes=${result.outcomes.length} (${Date.now() - t2}ms)`);
  console.log(`[loop-summary] ${JSON.stringify(result.summary.predictions)} پیش‌بینی · ${result.summary.positiveOutcomes} مثبت · ${result.summary.negativeOutcomes} منفی`);

  // ── ۴) گواهی JSON ──
  const witness = {
    case: "PN-005",
    purpose: "recovery-rebuild-after-db-destruction",
    ranAt: new Date().toISOString(),
    graphs: { property: p, people: pe, transaction: t, totals, buildMs },
    alerts: { backfill: alertRep, total: alertCount },
    loop: { predictions: result.predictions.length, outcomes: result.outcomes.length, summary: result.summary },
  };
  writeFileSync("/home/z/my-project/download/pn005/recovery-witness.json", JSON.stringify(witness, null, 2), "utf8");
  console.log("[witness] download/pn005/recovery-witness.json written");
}

main().catch((e) => { console.error("FAILED:", e); process.exit(1); }).finally(() => db.$disconnect());
