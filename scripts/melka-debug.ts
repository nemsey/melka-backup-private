#!/usr/bin/env bun
/**
 * melka-debug — CLI خط‌یابی ملکا (PN-038 · فاز ۳ · بند ۳.۲ — شورا-ن۰۶۳)
 * ---------------------------------------------------------------------------
 * ابزار خط‌یابی زندهٔ GLM/مالک — بدون HTTP، مستقیم روی منطق اپ.
 *
 * کاربردها:
 *   bun scripts/melka-debug.ts probe [target] [--label <label>] [--json <path>]
 *     target: enums-persian (پیش‌فرض) | melk-public | health | all
 *     اجرای پروب زنده + شاهد GlmProbe در DB + نوشتن خروجی JSON
 *
 *   bun scripts/melka-debug.ts probes [--limit N]
 *     فهرست پروب‌های اخیر
 *
 *   bun scripts/melka-debug.ts status
 *     خلاصهٔ وضعیت سیستم (health + رله + شمارش‌های کلیدی)
 *
 * env: از .env و env.platform.json بارگذاری می‌شود (عین refresh-lists).
 */

import { writeFileSync, mkdirSync } from "node:fs";

// env زنده
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

const cmd = process.argv[2] ?? "status";
const args = process.argv.slice(3);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const { PrismaClient } = await import("@prisma/client");
const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL ?? "file:db/custom.db" } } });

async function main(): Promise<number> {
  if (cmd === "probe" || cmd === "probes" || cmd === "status") {
    const { runGlmProbe, listRecentGlmProbes, GLM_PROBE_TARGETS } = await import("@/lib/glm/probe");

    if (cmd === "probes") {
      const limit = Number(flag("limit") ?? "10");
      const probes = await listRecentGlmProbes(limit);
      console.log(JSON.stringify({ ok: true, count: probes.length, probes }, null, 2));
      return 0;
    }

    if (cmd === "probe") {
      const rawTarget = (args.find((a) => !a.startsWith("--")) ?? "enums-persian") as string;
      const targets = rawTarget === "all" ? [...GLM_PROBE_TARGETS] : [rawTarget];
      const label = flag("label") ?? `cli-${rawTarget}-${new Date().toISOString().slice(0, 16)}`;
      const out: Record<string, unknown> = { at: new Date().toISOString(), cli: "melka-debug probe", label, results: [] as unknown[] };
      for (const t of targets) {
        const r = await runGlmProbe(label, t as never);
        (out.results as Array<Record<string, unknown>>).push({ target: t, probeId: r.probeId, status: r.status, ...r.result });
        const mark = r.status === "done" ? "✓" : "✗";
        console.log(`${mark} ${t}: ${r.status} · HTTP ${r.result.httpStatus} · ${r.result.durationMs}ms${r.result.count != null ? ` · count=${r.result.count}` : ""}${r.result.error ? ` · ${r.result.error.slice(0, 80)}` : ""}`);
      }
      const jsonPath = flag("json") ?? "download/pn038/probe-test.json";
      mkdirSync(jsonPath.split("/").slice(0, -1).join("/"), { recursive: true });
      writeFileSync(jsonPath, JSON.stringify(out, null, 2));
      console.log(`شاهد: ${jsonPath}`);
      return (out.results as Array<{ status: string }>).every((r) => r.status === "done") ? 0 : 1;
    }

    // status
    const [health, relay] = await Promise.all([
      (async () => {
        const { executeGlmProbe } = await import("@/lib/glm/probe");
        return executeGlmProbe("health");
      })(),
      (async () => {
        const devices = await db.relayDevice.count({ where: { revokedAt: null } });
        const active = await db.relayDevice.count({ where: { revokedAt: null, lastSeenAt: { not: null } } });
        const last24 = await db.relayQueue.count({ where: { status: "done", enqueuedAt: { gt: new Date(Date.now() - 86400000) } } });
        return { devices, active, done24h: last24 };
      })(),
    ]);
    const counts = {
      property: await db.propertyRecord.count(),
      request: await db.requestRecord.count(),
      transaction: await db.transactionRecord.count(),
      expert: await db.expertRecord.count(),
    };
    console.log(JSON.stringify({ ok: true, health: { alive: health.ok, durationMs: health.durationMs }, relay, counts, at: new Date().toISOString() }, null, 2));
    return 0;
  }

  console.error("کاربرد: melka-debug.ts <probe [target] [--label L] [--json P]] | probes [--limit N] | status>");
  return 64;
}

try {
  process.exit(await main());
} catch (e) {
  console.error("خطا:", String((e as Error).message).slice(0, 200));
  process.exit(1);
} finally {
  await db.$disconnect();
}
