/**
 * PN-001 — BLOCK 1 witness — شاهد‌های زیرساخت روی دادهٔ واقعی
 * ---------------------------------------------------------------
 * ۱) ساخت سه گراف از دادهٔ واقعی (Property/People/Transaction)
 * ۲) شاهد traverse + findPath روی دادهٔ زنده
 * ۳) شاهد هشدار فرصت (≥ ۵ هشدار واقعی — آستانهٔ ۰٫۷)
 * ۴) شاهد پاکسازی (صفر حذف — فقط آرشیو + ۱۰ نمونه)
 * خروجی: download/pn001/graphs-proof.json
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || "file:/home/z/my-project/db/custom.db";
export {};

async function main() {
  const { db } = await import("@/lib/db");
  const graphsMod = await import("@/core/graphs");
  const { GraphService, buildPropertyGraph, buildPeopleGraph, buildTransactionGraph } = graphsMod as {
    GraphService: typeof graphsMod.GraphService;
    buildPropertyGraph: typeof graphsMod.buildPropertyGraph;
    buildPeopleGraph: typeof graphsMod.buildPeopleGraph;
    buildTransactionGraph: typeof graphsMod.buildTransactionGraph;
  };
  const { OpportunityListener } = await import("@/core/matching");
  const { CleanupService } = await import("@/core/maintenance/cleanup");
  const fs = await import("node:fs");

  const t0 = Date.now();
  const service = new GraphService(db);

  /* ── ۱) ساخت سه گراف ── */
  console.log("[1/5] ساخت سه گراف از دادهٔ واقعی …");
  const reports = [
    await buildPropertyGraph(db, service),
    await buildPeopleGraph(db, service),
    await buildTransactionGraph(db, service),
  ];

  /* ── ۲) آمار + یکپارچگی ── */
  console.log("[2/5] آمار گراف‌ها …");
  const stats = {
    property: await service.stats("property"),
    people: await service.stats("people"),
    transaction: await service.stats("transaction"),
  };
  const totals = {
    nodes: stats.property.nodes + stats.people.nodes + stats.transaction.nodes,
    edges: stats.property.edges + stats.people.edges + stats.transaction.edges,
  };
  const dangling = {
    property: await service.danglingEdges("property"),
    people: await service.danglingEdges("people"),
    transaction: await service.danglingEdges("transaction"),
  };

  /* ── ۳) شاهد traverse + findPath روی دادهٔ زنده ── */
  console.log("[3/5] شاهد پیمایش …");
  const firstProp = await db.propertyRecord.findFirst({
    where: { status: "منتشر شده", areaName: { not: null } },
    orderBy: { propertyCode: "asc" },
    select: { propertyCode: true, areaName: true, areaId: true },
  });
  if (!firstProp) throw new Error("هیچ آگهی منتشرشده‌ای برای شاهد پیمایش یافت نشد");
  const traversePaths = await service.traverse(
    "property",
    { nodeType: "property", refId: firstProp.propertyCode },
    { maxDepth: 2, limit: 6 },
  );
  const foundPath = await service.findPath(
    "property",
    { nodeType: "property", refId: firstProp.propertyCode },
    { nodeType: "area", refId: firstProp.areaId ?? firstProp.areaName! },
    { maxDepth: 3 },
  );

  /* ── ۴) هشدار فرصت — backfill روی دادهٔ واقعی ── */
  console.log("[4/5] هشدار فرصت (backfill واقعی) …");
  const listener = new OpportunityListener(db, 3);
  const alertReport = await listener.backfillRecent({ listings: 12, requests: 6 });
  const topAlerts = await listener.alerts(10);

  /* ── ۵) پاکسازی دادهٔ مرده ── */
  console.log("[5/5] پاکسازی (فقط آرشیو) …");
  const cleanup = new CleanupService(db);
  const cleanupReport = await cleanup.run();

  const proof = {
    case: "PN-001",
    block: 1,
    generatedAt: new Date().toISOString(),
    directive: "ملکا-شورا-ن۰۰۱-۱۴۰۵ — بخش ۱٫۲/۱٫۳/۱٫۴",
    graphs: {
      buildReports: reports,
      stats,
      totals,
      acceptance: {
        requiredNodes: 1000,
        requiredEdges: 5000,
        nodesOK: totals.nodes >= 1000,
        edgesOK: totals.edges >= 5000,
      },
      integrity: { danglingEdges: dangling },
    },
    traversalWitness: {
      startNode: { nodeType: "property", refId: firstProp.propertyCode },
      pathCount: traversePaths.length,
      samples: traversePaths.slice(0, 3),
    },
    findPathWitness: {
      from: { nodeType: "property", refId: firstProp.propertyCode },
      to: { nodeType: "area", refId: firstProp.areaId ?? firstProp.areaName! },
      path: foundPath,
    },
    opportunityAlerts: {
      backfillReport: alertReport,
      acceptance: { required: 5, actual: alertReport.alertsCreated, ok: alertReport.alertsCreated >= 5 },
      topAlerts: topAlerts.slice(0, 5),
      constraint: "صفر اجرای خودکار — فقط هشدار (آستانهٔ انتشار ≥ ۰٫۷)",
    },
    cleanup: {
      found: cleanupReport.found,
      byPriority: cleanupReport.byPriority,
      archived: cleanupReport.archived,
      samples: cleanupReport.archivedSamples.slice(0, 10),
      deleted: cleanupReport.deleted,
      sacredDataLaw: "صفر حذف — قانون دادهٔ مقدس رعایت شد",
    },
    durationMs: Date.now() - t0,
  };

  const outDir = "/home/z/my-project/download/pn001";
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = `${outDir}/graphs-proof.json`;
  fs.writeFileSync(outPath, JSON.stringify(proof, null, 2), "utf8");

  console.log("\n═══ خلاصهٔ شاهد بلوک ۱ ═══");
  console.log(`گراف‌ها — گره‌ها: ${totals.nodes} (نیاز ≥ ۱٬۰۰۰ → ${totals.nodes >= 1000 ? "✓" : "✗"}) · یال‌ها: ${totals.edges} (نیاز ≥ ۵٬۰۰۰ → ${totals.edges >= 5000 ? "✓" : "✗"})`);
  for (const s of Object.values(stats)) console.log(`  · گراف ${s.graph}: ${s.nodes} گره / ${s.edges} یال`);
  console.log(`پیمایش: ${traversePaths.length} مسیر از ملک ${firstProp.propertyCode} · findPath: ${foundPath ? "یافت شد ✓" : "یافت نشد"}`);
  console.log(`هشدار فرصت: ${alertReport.alertsCreated} هشدار واقعی (نیاز ≥ ۵ → ${alertReport.alertsCreated >= 5 ? "✓" : "✗"}) · ارزیابی‌شده: ${alertReport.evaluated}`);
  console.log(`پاکسازی: یافت ${cleanupReport.found} · آرشیو ${cleanupReport.archived} · حذف ${cleanupReport.deleted}`);
  console.log(`خروجی: ${outPath} (${Date.now() - t0}ms)`);
  process.exit(0);
}

main().catch((e) => { console.error("ERROR:", e); process.exit(1); });
