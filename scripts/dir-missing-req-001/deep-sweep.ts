#!/usr/bin/env bun
/**
 * DIR-MISSING-REQ-001 — deep-sweep.ts
 * جاروی کامل یک‌بارهٔ فهرست درخواست‌های ARM (۴۳۲ صفحه) برای بازگردانی هر ردیفِ
 * قابل‌دیدنِ منبع که در کورگاه ساختاری صفحه‌های ۱۳+ جا مانده بود.
 *
 * راه رفت: همان کد تولیدیِ syncArmRequestsCatalog (با درمان ریشهٔ A) —
 * زیر قفل بین‌فرایندی update:m2 (هماهنگ با دیمن/Worker) · با توکنِ زندهٔ
 * حل‌کنندهٔ هوشمند (خوددرمانی خزانه) · checkpoint در هر صفحه (قانون بقا).
 */
import { writeFileSync, mkdirSync } from "node:fs";

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

const { PrismaClient } = await import("@prisma/client");
const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL ?? "file:db/custom.db" } } });

async function main(): Promise<number> {
  const t0 = Date.now();

  // ۱) توکن زنده — حل‌کنندهٔ هوشمند (همان که پس از دیپلوی در دیمن می‌نشیند)
  const { resolveBestArmToken } = await import("@/lib/melk-api/arm-token-resolver");
  const resolved = await resolveBestArmToken(db);
  if (!resolved) {
    console.log(JSON.stringify({ ok: false, error: "NO_VALID_TOKEN" }));
    return 1;
  }
  console.log(`token: source=${resolved.source} expIn=${resolved.expMs ? Math.round((resolved.expMs - Date.now()) / 60000) + "min" : "?"} vaultHealed=${resolved.vaultHealed}`);

  // ۲) قفل بین‌فرایندی update:m2 — صفر اجرای موازی با دیمن/Worker (TTL یک‌ساعت)
  const { JobLockService } = await import("@/core/runtime/joblock");
  const lockSvc = new JobLockService(db);
  const acq = await lockSvc.acquire("update:m2", {
    ttlMs: 3_600_000,
    metadata: { source: "manual", pipeline: "dir-missing-req-001-deep-sweep" },
  });
  if (!acq.acquired) {
    console.log(JSON.stringify({ ok: false, error: "LOCK_HELD", holder: acq.holder ?? null }));
    return 2;
  }

  try {
    // ۳) شمارش پیش از شروع (شاهد مبنا — قانون دادهٔ مقدس)
    const before = await db.requestRecord.count();
    console.log(`RequestRecord before: ${before}`);

    // ۴) جاروی کامل — maxPages=500 ≥ 432 ⇒ یک اجرا تا پایان واقعی منبع
    const { syncArmRequestsCatalog } = await import("@/lib/melk-api/arm-catalog");
    const result = await syncArmRequestsCatalog(resolved.token, { maxPages: 500 });

    const after = await db.requestRecord.count();
    const summary = {
      at: new Date().toISOString(),
      ok: result.ok,
      pages: result.pages,
      fetched: result.fetched,
      created: result.created,
      updated: result.updated,
      duplicates: result.duplicates,
      errors: result.errors,
      totalAtSource: result.totalAtSource,
      durationMs: result.durationMs,
      checkpoint: result.checkpoint,
      requestRecordBefore: before,
      requestRecordAfter: after,
      requestRecordGrowth: after - before,
      wallMs: Date.now() - t0,
    };
    console.log(JSON.stringify(summary, null, 2));
    mkdirSync("download/dir-missing-req-001", { recursive: true });
    writeFileSync("download/dir-missing-req-001/deep-sweep-result.json", JSON.stringify(summary, null, 2));
    console.log("شاهد: download/dir-missing-req-001/deep-sweep-result.json");
    return result.ok ? 0 : 1;
  } finally {
    await lockSvc.release("update:m2").catch(() => undefined);
    await db.$disconnect();
  }
}

process.exit(await main());
