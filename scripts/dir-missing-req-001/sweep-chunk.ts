#!/usr/bin/env bun
/**
 * DIR-MISSING-REQ-001 — sweep-chunk.ts
 * جاروی chunk-به-chunk (پیش‌زمینه) — هر فراخوانی تا `--pages N` صفحه از نقطهٔ
 * checkpoint ادامه می‌دهد؛ قانون بقا: داده نوشته شد ⇒ checkpoint جلو می‌رود.
 * (پروسهٔ پس‌زمینه در این سندباکس زنده نمی‌ماند — chunk های پیش‌زمینه‌ای)
 */
import { writeFileSync, mkdirSync, appendFileSync } from "node:fs";

for (const p of ["../../.env", "../../env.platform.json"]) {
  try {
    const url = new URL(p, import.meta.url);
    const raw = await Bun.file(url).text();
    if (p.endsWith(".json")) {
      const plat = JSON.parse(raw) as Record<string, string>;
      for (const [k, v] of Object.entries(plat)) if (typeof v === "string" && !process.env[k]) process.env[k] = v;
    } else {
      for (const line of raw.split("\n")) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch { /* اختیاری */ }
}

const arg = (n: string, d: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const PAGES = Math.min(Number(arg("pages", "100")), 500) || 100;
const LOCK_WAIT_MS = Math.min(Number(arg("lockwait", "240")) * 1000, 480_000);

const { PrismaClient } = await import("@prisma/client");
const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL ?? "file:db/custom.db" } } });

const LOG = "download/dir-missing-req-001/sweep-chunks.log";
function log(line: string): void {
  const ts = new Date().toISOString();
  console.log(line);
  try {
    appendFileSync(LOG, `[${ts}] ${line}\n`, "utf8");
  } catch { /* بهترین-تلاش */ }
}

async function main(): Promise<number> {
  const t0 = Date.now();
  const { resolveBestArmToken } = await import("@/lib/melk-api/arm-token-resolver");
  const resolved = await resolveBestArmToken(db);
  if (!resolved) {
    log("NO_VALID_TOKEN");
    return 1;
  }
  log(`token source=${resolved.source} vaultHealed=${resolved.vaultHealed}`);

  // قفل update:m2 — با صبر تا LOCK_WAIT_MS (مالک همین حالا هم بروزرسانی دستی می‌زند)
  const { JobLockService } = await import("@/core/runtime/joblock");
  const lockSvc = new JobLockService(db);
  let acquired = false;
  const deadline = Date.now() + LOCK_WAIT_MS;
  while (!acquired && Date.now() < deadline) {
    const acq = await lockSvc.acquire("update:m2", {
      ttlMs: 9 * 60_000,
      metadata: { source: "manual", pipeline: "dir-missing-req-001-sweep-chunk", pages: PAGES },
    });
    if (acq.acquired) {
      acquired = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 10_000));
  }
  if (!acquired) {
    log("LOCK_HELD_TIMEOUT");
    return 2;
  }

  try {
    const before = await db.requestRecord.count();
    const { syncArmRequestsCatalog } = await import("@/lib/melk-api/arm-catalog");
    const result = await syncArmRequestsCatalog(resolved.token, { maxPages: PAGES });
    const after = await db.requestRecord.count();
    const cp = await db.syncCheckpoint.findUnique({ where: { id: "requests" } });
    const summary = {
      at: new Date().toISOString(), pagesBudget: PAGES, ok: result.ok, pages: result.pages,
      fetched: result.fetched, created: result.created, updated: result.updated,
      totalAtSource: result.totalAtSource, durationMs: result.durationMs,
      checkpoint: cp ? { page: cp.lastCompletedPage, totalPages: cp.totalPages, phase: cp.phase } : null,
      countBefore: before, countAfter: after, growth: after - before, wallMs: Date.now() - t0,
    };
    log(JSON.stringify(summary));
    mkdirSync("download/dir-missing-req-001", { recursive: true });
    writeFileSync(`download/dir-missing-req-001/sweep-chunk-${Date.now()}.json`, JSON.stringify(summary, null, 2));
    return result.ok ? 0 : 1;
  } finally {
    await lockSvc.release("update:m2").catch(() => undefined);
    await db.$disconnect();
  }
}

process.exit(await main());
