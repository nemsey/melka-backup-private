/**
 * PN-004 Phase 0-A — کاوش سطح مخزن (فقط خواندنی)
 * سناریو D (یک کاشی) و E (چند کاشی) در سطح داده — بدون احراز هویت،
 * بدون نوشتن، فقط findMany/count روی پایگاه production (custom.db).
 * خروجی: زمان + heap + external + rss فرایند (سنجه‌های جدول ۱).
 */
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const MB = 1048576;
const round = (x: number) => Math.round(x * 10) / 10;

function mu() {
  const m = process.memoryUsage();
  return {
    heapUsedMB: round(m.heapUsed / MB),
    heapTotalMB: round(m.heapTotal / MB),
    externalMB: round(m.external / MB),
    rssMB: round(m.rss / MB),
  };
}

async function probe(label: string, fn: () => Promise<unknown>) {
  const t0 = Date.now();
  const res = await fn();
  return { tile: label, wallMs: Date.now() - t0, ...mu(), payloadKB: round(JSON.stringify(res ?? []).length / 1024) };
}

async function main() {
  const t0 = Date.now();

  // --- سناریو D: یک کاشی (آگهی — M1) ---
  const one = await probe("listings-M1", async () => {
    const rows = await p.listingRecord.findMany({ take: 50, orderBy: { id: "desc" } });
    const total = await p.listingRecord.count();
    return { rows, total };
  });

  // --- سناریو E: چند کاشی (آگهی + درخواست + معاملات + کارشناسان + گراف + بازار) ---
  const multi = [one];
  multi.push(await probe("requests-M2", async () => {
    const rows = await p.requestRecord.findMany({ take: 50, orderBy: { id: "desc" } });
    const total = await p.requestRecord.count();
    return { rows, total };
  }));
  multi.push(await probe("transactions-M3", async () => {
    const rows = await p.transactionRecord.findMany({ take: 50, orderBy: { id: "desc" } });
    const total = await p.transactionRecord.count();
    return { rows, total };
  }));
  multi.push(await probe("experts-M4", async () => {
    const rows = await p.expertRecord.findMany({ take: 50, orderBy: { id: "desc" } });
    const total = await p.expertRecord.count();
    return { rows, total };
  }));
  multi.push(await probe("graph-counts", async () => {
    const nodes = await p.graphNode.count();
    const edges = await p.graphEdge.count();
    return { nodes, edges };
  }));
  multi.push(await probe("opportunity-alerts", async () => {
    const rows = await p.opportunityAlert.findMany({ take: 20, orderBy: { id: "desc" } });
    const total = await p.opportunityAlert.count();
    return { rows, total };
  }));

  const out = {
    mode: "repository-level-read-only",
    database: "custom.db (production)",
    totalWallMs: Date.now() - t0,
    finalMem: mu(),
    scenarioD_oneTile: one,
    scenarioE_multiTile: multi,
  };
  console.log(JSON.stringify(out, null, 1));
  await p.$disconnect();
}

main().catch((e) => {
  console.error("PROBE-ERROR", String(e).slice(0, 400));
  process.exit(1);
});
