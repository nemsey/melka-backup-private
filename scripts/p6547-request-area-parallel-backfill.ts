#!/usr/bin/env bun
/**
 * p6547-request-area-parallel-backfill.ts — بک‌فیل موازی مناطق درخواست‌ها
 * ----------------------------------------------------------------------------
 * چهار کارگر موازی، هر یک بازهٔ صفحات خود را می‌خواند (upsert idempotent —
 * merge non-null؛ هم‌پوشانی بی‌ضرر). سرعت ~۴ برابر بک‌فیل ترتیبی.
 * استفاده: bun scripts/p6547-request-area-parallel-backfill.ts [workers] [pagesPerWorker]
 */
import { PrismaClient } from "@prisma/client";
import { decryptSecret } from "../src/lib/auth/crypto";
import { armCall } from "../src/lib/melk-api/client";
import { getMelkApiConfig } from "../src/lib/melk-api/config";
import { MELK_ENDPOINTS } from "../src/lib/melk-api/endpoints";
import { mapArmRequestListRow } from "../src/lib/melk-api/arm-catalog";
import type { ArmRequestBulkRow } from "../src/core/repositories/interfaces/bulk-write.repository";

const db = new PrismaClient();

interface PageResult { page: number; ok: boolean; rows: number; created: number; updated: number; ms: number; error?: string }

async function upsertRows(inputs: ArmRequestBulkRow[]): Promise<{ created: number; updated: number }> {
  // درج/به‌روزرسانی مستقیم با Prisma — همان نگاشت toArmRequestData منطق مخزن
  const { toArmRequestData } = await import("../src/core/repositories/prisma/request.repository");
  let created = 0, updated = 0;
  for (const input of inputs) {
    try {
      const data = toArmRequestData(input) as unknown as import("@prisma/client").Prisma.RequestRecordUncheckedCreateInput;
      const existing = await db.requestRecord.findFirst({ where: { requestCode: input.requestCode, source: "arm" }, select: { id: true } });
      if (existing) {
        await db.requestRecord.update({ where: { id: existing.id }, data });
        updated += 1;
      } else {
        await db.requestRecord.create({ data }); // data شامل id عین ردیف ARM است
        created += 1;
      }
    } catch {
      /* ردیف خطادار — ادامه */
    }
  }
  return { created, updated };
}

async function worker(ARM_TOKEN: string, cfg: ReturnType<typeof getMelkApiConfig>, workerId: number, pages: number[], results: PageResult[]): Promise<void> {
  for (const page of pages) {
    const t0 = Date.now();
    let attempts = 0;
    while (attempts < 4) {
      attempts += 1;
      try {
        const res = await armCall<unknown>({
          path: MELK_ENDPOINTS.arm.requestsList,
          baseUrl: cfg.armApiBase,
          token: ARM_TOKEN,
          query: { page, limit: 50 },
          timeoutMs: 75_000,
          maxRetries: 0,
        });
        const d = (res.data ?? {}) as Record<string, unknown>;
        const list = Array.isArray(d["list"]) ? (d["list"] as Record<string, unknown>[]) : [];
        const inputs = list.map((r) => mapArmRequestListRow(r)).filter((r): r is ArmRequestBulkRow => r !== null);
        const { created, updated } = await upsertRows(inputs);
        results.push({ page, ok: true, rows: inputs.length, created, updated, ms: Date.now() - t0 });
        if (workerId === 0 && results.length % 10 === 0) {
          console.log(`[w${workerId}] page ${page}: ${inputs.length} rows (${((Date.now() - t0) / 1000).toFixed(1)}s) — total done ${results.length}`);
        }
        break;
      } catch (e) {
        if (attempts >= 4) {
          results.push({ page, ok: false, rows: 0, created: 0, updated: 0, ms: Date.now() - t0, error: (e as Error).message?.slice(0, 60) });
        } else {
          await new Promise((r) => setTimeout(r, 8000));
        }
      }
    }
    await new Promise((r) => setTimeout(r, 400));
  }
}

async function main() {
  const WORKERS = Math.min(Math.max(Number(process.argv[2] ?? 4), 1), 6);
  const PAGES_PER_WORKER = Math.min(Math.max(Number(process.argv[3] ?? 60), 1), 120);
  const arm = await db.armConnection.findFirst({ where: { ownerKey: "master" } });
  const ARM_TOKEN = decryptSecret(arm?.tokenEnc ?? "") ?? "";
  if (!ARM_TOKEN) { console.log("NO ARM TOKEN"); process.exit(1); }
  const cfg = getMelkApiConfig();

  // شمارش صفحات منبع
  const probe = await armCall<unknown>({ path: MELK_ENDPOINTS.arm.requestsList, baseUrl: cfg.armApiBase, token: ARM_TOKEN, query: { page: 1, limit: 1 }, timeoutMs: 90_000, maxRetries: 2 });
  const pd = (probe.data ?? {}) as Record<string, unknown>;
  const totalPages = Number(pd["totalPages"] ?? 0) || Math.ceil(Number(pd["count"] ?? 0) / 50) || 230;
  console.log(`source totalPages=${totalPages} — ${WORKERS} workers × ${PAGES_PER_WORKER} pages`);

  // تقسیم صفحات: از صفحهٔ ۱ (صفحات جدیدترین ابتدا — همه بازخوانی می‌شوند)
  const allPages: number[] = [];
  for (let p = 1; p <= totalPages; p++) allPages.push(p);
  const chunks: number[][] = Array.from({ length: WORKERS }, () => []);
  allPages.forEach((p, i) => chunks[i % WORKERS].push(p));

  const results: PageResult[] = [];
  const t0 = Date.now();
  await Promise.all(chunks.map((pages, i) => worker(ARM_TOKEN, cfg, i, pages, results)));

  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  const after = {
    total: await db.requestRecord.count(),
    withArea: await db.requestRecord.count({ where: { areaNamesJson: { not: null } } }),
    withLine: await db.requestRecord.count({ where: { lineNamesJson: { not: null } } }),
    withPrice: await db.requestRecord.count({ where: { priceFrom: { not: null } } }),
    withTrade: await db.requestRecord.count({ where: { tradeTypeName: { not: null } } }),
    withUrgent: await db.requestRecord.count({ where: { urgent: { not: null } } }),
  };
  // توزیع مناطق — دادهٔ جدول «قطب‌های عرضه درخواست»
  const areaDist: Record<string, number> = {};
  (await db.requestRecord.findMany({ where: { areaNamesJson: { not: null } }, select: { areaNamesJson: true }, take: 20000 }))
    .forEach((r) => { try { const a = JSON.parse(r.areaNamesJson!); if (Array.isArray(a)) a.forEach((x) => (areaDist[x] = (areaDist[x] || 0) + 1)); } catch {} });
  const topAreas = Object.entries(areaDist).sort((a, b) => b[1] - a[1]).slice(0, 12);

  const proof = {
    ranAt: new Date().toISOString(),
    durationMs: Date.now() - t0,
    workers: WORKERS,
    totalPages,
    pagesOk: ok.length,
    pagesFailed: failed.length,
    rowsFetched: ok.reduce((s, r) => s + r.rows, 0),
    created: ok.reduce((s, r) => s + r.created, 0),
    updated: ok.reduce((s, r) => s + r.updated, 0),
    failedPages: failed.map((f) => f.page),
    after,
    topAreas,
  };
  const { writeFileSync } = await import("node:fs");
  writeFileSync("download/p6547/request-area-parallel-proof.json", JSON.stringify(proof, null, 2));
  console.log(`DONE: pagesOk=${proof.pagesOk} pagesFailed=${proof.pagesFailed} rows=${proof.rowsFetched} in ${((Date.now() - t0) / 60000).toFixed(1)}min`);
  console.log("AFTER:", JSON.stringify(after));
  console.log("TOP AREAS:", JSON.stringify(topAreas));
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
