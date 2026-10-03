#!/usr/bin/env node
/** p6547-areas-state-evidence.js — شاهد وضعیت انبار مناطق درخواست‌ها (گام دوم-۲) */
const { PrismaClient } = require("@prisma/client");
const { writeFileSync } = require("node:fs");
const p = new PrismaClient();

async function main() {
  const total = await p.requestRecord.count();
  const rows = await p.requestRecord.findMany({ where: { areaNamesJson: { not: null } }, select: { areaNamesJson: true }, take: 25000 });
  const dist = {};
  rows.forEach((r) => { try { JSON.parse(r.areaNamesJson).forEach((a) => (dist[a] = (dist[a] || 0) + 1)); } catch {} });
  const topAreas = Object.entries(dist).sort((a, b) => b[1] - a[1]).slice(0, 15);
  const proof = {
    capturedAt: new Date().toISOString(),
    total,
    withArea: rows.length,
    distinctAreas: Object.keys(dist).length,
    topAreas,
  };
  writeFileSync("download/p6547/request-areas-state.json", JSON.stringify(proof, null, 2));
  console.log(JSON.stringify({ total, withArea: rows.length, distinctAreas: proof.distinctAreas, top1: topAreas[0] }));
  await p.$disconnect();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
