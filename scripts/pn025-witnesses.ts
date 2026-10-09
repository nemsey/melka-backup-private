/**
 * شواهد زندهٔ PN-025 — اجرای واقعی چهار ستون روی دادهٔ تولید
 * خروجی: download/pn025/{memory-consolidation,unified-graph,decision-advisor,decision-lock,three-tiles}.json
 */

import { PrismaClient } from "@prisma/client";
import { writeFileSync, mkdirSync } from "node:fs";

const db = new PrismaClient();
const OUT = "download/pn025";
mkdirSync(OUT, { recursive: true });
const dump = (name: string, obj: unknown) => {
  writeFileSync(`${OUT}/${name}`, JSON.stringify(obj, null, 2), "utf8");
  console.log(`✓ ${name}`);
};

async function main() {
  const ranAt = new Date().toISOString();

  // ═══ ۱) حافظه — تثبیت واقعی + آمار ═══
  const { runConsolidation, memoryStats, touchMemory } = await import("../src/lib/services/memory-lifecycle-service");
  // لمس چند بستر واقعی (۱۰ آگهی برتر به‌روزرسانی‌شده) تا حافظه نفس بکشد
  const topProps = await db.propertyRecord.findMany({
    orderBy: { updatedAt: "desc" },
    take: 10,
    select: { propertyCode: true },
  });
  for (const p of topProps) {
    if (p.propertyCode) await touchMemory({ itemId: p.propertyCode, itemType: "property" });
  }
  const consolidation = await runConsolidation();
  const stats = await memoryStats();
  dump("memory-consolidation.json", {
    workOrder: "PN-025/مرحلهٔ ۴ — ستون ۱: حافظهٔ بلندمدت",
    ranAt,
    consolidation,
    stats,
    witness: `${topProps.length} بستر واقعی لمس شد + نخستین تثبیت شبانه اجرا شد`,
  });

  // ═══ ۲) بینایی — گراف زنده + یک پرسش واقعی ═══
  const { buildInMemoryGraph } = await import("../src/lib/services/unified-graph-service");
  const { unifiedVision } = await import("../src/core/intelligence/unified-graph");
  const graph = await buildInMemoryGraph();
  const firstProp = topProps.find((p) => p.propertyCode)?.propertyCode ?? "34826";
  const vision = unifiedVision(graph, { fromType: "property", fromId: firstProp, maxDepth: 3 });
  dump("unified-graph.json", {
    workOrder: "PN-025/مرحلهٔ ۵ — ستون ۲: بینایی کامل",
    ranAt,
    graph: {
      nodes: graph.nodes.size,
      edges: graph.edges.length,
      edgeTypes: [...new Set(graph.edges.map((e) => e.type))],
    },
    query: { fromType: "property", fromId: firstProp },
    result: {
      paths: vision.paths.slice(0, 5).map((p) => ({ nodes: p.nodes.map((n) => n.label), weight: p.weight })),
      insights: vision.insights.slice(0, 5),
      confidence: vision.confidence,
    },
  });

  // ═══ ۳) موتور ۱۶ — ۱۰ تصمیم واقعی روی دادهٔ زنده ═══
  const { advise } = await import("../src/lib/services/decision-advisor-service");
  const decisions = [];
  for (const p of topProps.slice(0, 8)) {
    if (!p.propertyCode) continue;
    const result = await advise({ kind: "property", id: p.propertyCode, label: `آگهی ${p.propertyCode}` });
    decisions.push(
      "locked" in result
        ? { context: p.propertyCode, locked: true, reason: result.reason, message: result.message }
        : {
            context: p.propertyCode,
            recommendation: result.recommendation,
            narrative: result.narrative,
            confidence: result.confidence,
            risk: result.risk,
            alternatives: result.alternatives.map((a) => a.label),
            basedOnKeys: Object.keys(result.basedOn),
            autoExecute: result.autoExecute,
            requiresApproval: result.requiresApproval,
          },
    );
  }
  // دو تصمیم دیگر: یک متقاضی واقعی + یک منطقهٔ واقعی
  const topRequest = await db.requestRecord.findFirst({ where: { customerName: { not: null } }, orderBy: { createdAt: "desc" }, select: { requestCode: true, customerName: true } });
  if (topRequest?.requestCode) {
    const r = await advise({ kind: "request", id: topRequest.requestCode, label: `درخواست ${topRequest.requestCode}` });
    decisions.push("locked" in r ? { context: `REQ:${topRequest.requestCode}`, locked: true, reason: r.reason } : { context: `REQ:${topRequest.requestCode}`, recommendation: r.recommendation, narrative: r.narrative, risk: r.risk, autoExecute: r.autoExecute });
  }
  const topArea = await db.propertyRecord.groupBy({ by: ["areaName"], _count: true, orderBy: { _count: { propertyCode: "desc" } }, take: 1 });
  if (topArea[0]?.areaName) {
    const a = await advise({ kind: "market", id: `MARKET:${topArea[0].areaName}`, label: `منطقهٔ ${topArea[0].areaName}` });
    decisions.push("locked" in a ? { context: `MARKET:${topArea[0].areaName}`, locked: true, reason: a.reason } : { context: `MARKET:${topArea[0].areaName}`, recommendation: a.recommendation, narrative: a.narrative, risk: a.risk, autoExecute: a.autoExecute });
  }
  dump("decision-advisor.json", {
    workOrder: "PN-025/مرحلهٔ ۶ — ستون ۳: موتور ۱۶ مشاور تصمیم",
    ranAt,
    count: decisions.length,
    decisions,
    zeroLlm: true,
    autoExecuteEverywhere: false,
  });

  // ═══ ۴) کمربند — سه قفل عین سفارش + دریل زنده ═══
  const { DECISION_LOCK_CONSTANTS, evaluateLock, evaluateTtl, buildDecisionLock } = await import("../src/core/intelligence/decision-lock");
  dump("decision-lock.json", {
    workOrder: "PN-025/مرحلهٔ ۷ — ستون ۴: کمربند ایمنی",
    ranAt,
    constants: DECISION_LOCK_CONSTANTS,
    literalTypeLock: { autoExecute: "false (literal)", requiresApproval: "true (literal)" },
    drills: {
      cooldownActive: evaluateLock({ hoursSinceLastAdvice: 10, evidenceChangedSinceLast: false, advisorCountToday: 0, categoryCountToday: 0 }),
      rateDay: evaluateLock({ hoursSinceLastAdvice: 100, evidenceChangedSinceLast: false, advisorCountToday: 10, categoryCountToday: 0 }),
      rateCategory: evaluateLock({ hoursSinceLastAdvice: 100, evidenceChangedSinceLast: false, advisorCountToday: 5, categoryCountToday: 3 }),
      evidenceChangedBypass: evaluateLock({ hoursSinceLastAdvice: 10, evidenceChangedSinceLast: true, advisorCountToday: 0, categoryCountToday: 0 }),
      ttlExpired: evaluateTtl("2026-10-01T00:00:00Z", ranAt),
    },
    sampleLock: buildDecisionLock("witness-1", "CALL"),
  });

  // ═══ ۵) سه کاشی حیاتی — زنجیرهٔ کامل سه روت ═══
  const sampleToken = "witness-token";
  const areaName = topArea[0]?.areaName ?? "ولیعصر";
  const m5 = await advise({ kind: "property", id: firstProp, label: `تطبیق ${firstProp}` });
  const ff = await advise({ kind: "property", id: `DIVAR:${sampleToken}`, label: `فایل ${sampleToken}`, areaDemand: { area: areaName, requestCount: await db.requestRecord.count({ where: { areaNamesJson: { contains: `"${areaName}"` } } }) } });
  const m7 = await advise({ kind: "market", id: `MARKET:${areaName}`, label: `منطقهٔ ${areaName}` });
  dump("three-tiles.json", {
    workOrder: "PN-025/مرحلهٔ ۸ — سه کاشی حیاتی: M5 + فایل‌یابی + M7",
    ranAt,
    tiles: {
      "M5-تطبیق": { endpoint: "/api/smart-matching/advice", sample: m5 },
      "فایل‌یابی": { endpoint: "/api/file-finder/advice", sample: ff },
      "M7-شاخص": { endpoint: "/api/market-index/advice", sample: m7 },
    },
    uiComponent: "src/components/app/shared/AdviceCard.tsx",
  });

  console.log("\n همهٔ شواهد زندهٔ PN-025 ساخته شد.");
}

main().finally(() => db.$disconnect());
