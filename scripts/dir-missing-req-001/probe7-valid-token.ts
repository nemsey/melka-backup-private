#!/usr/bin/env bun
/**
 * DIR-MISSING-REQ-001 — probe7: پروب منبع با تازه‌ترین توکنِ دارای exp آینده
 * (این همان منطقی است که در حل‌کنندهٔ هوشمند توکن پیاده خواهد شد)
 *   ۱) کدهای گزارش‌شده + کل دامنه‌های پیوستهٔ گمشدهٔ اخیر
 *   ۲) صفحهٔ ۱۳ (فراسوی مرز ۱۲) — اثبات کورگاه ساختاری
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
const { decryptSecret } = await import("@/lib/auth/crypto");
const { armTokenExpiresAtMs } = await import("@/lib/auth/arm-token-exp");

async function freshestValidToken(): Promise<{ token: string; from: string } | null> {
  const sessions = await db.session.findMany({
    where: { revoked: false, expiresAt: { gt: new Date() }, armTokenEnc: { not: null } },
    orderBy: { lastSeenAt: "desc" }, take: 12,
  });
  let best: { token: string; exp: number; from: string } | null = null;
  for (const s of sessions) {
    const dec = decryptSecret(s.armTokenEnc!);
    if (!dec) continue;
    const exp = armTokenExpiresAtMs(dec);
    if (exp !== null && exp - Date.now() > 120_000 && (!best || exp > best.exp)) best = { token: dec, exp, from: `session:${s.id.slice(-6)}` };
  }
  if (!best) {
    const vaults = await db.armConnection.findMany({ orderBy: { lastRefreshedAt: "desc" }, take: 4 });
    for (const v of vaults) {
      if (!v.tokenEnc) continue;
      const dec = decryptSecret(v.tokenEnc);
      if (!dec) continue;
      const exp = armTokenExpiresAtMs(dec);
      if (exp !== null && exp - Date.now() > 120_000 && (!best || exp > best.exp)) best = { token: dec, exp, from: `vault:${v.ownerKey}` };
    }
  }
  return best ? { token: best.token, from: best.from } : null;
}

async function main(): Promise<number> {
  const pick = await freshestValidToken();
  if (!pick) {
    console.log(JSON.stringify({ ok: false, error: "NO_VALID_TOKEN" }));
    return 1;
  }
  console.log(`token source: ${pick.from}`);

  const { armCall } = await import("@/lib/melk-api/client");
  const { getMelkApiConfig } = await import("@/lib/melk-api/config");
  const { MELK_ENDPOINTS } = await import("@/lib/melk-api/endpoints");
  const cfg = getMelkApiConfig();
  const token = pick.token;

  const extract = (payload: unknown): { rows: unknown[]; count: number; totalPages: number } => {
    let rows: unknown[] = []; let count = 0; let totalPages = 0;
    const p = payload as Record<string, unknown> | null;
    if (p && typeof p === "object") {
      const inner = (p.data ?? p.list ?? p.rows ?? p.items) as Record<string, unknown> | unknown[] | undefined;
      if (Array.isArray(inner)) rows = inner;
      else if (inner && typeof inner === "object") {
        const i = inner as Record<string, unknown>;
        const l = i.list ?? i.docs ?? i.rows ?? i.data;
        if (Array.isArray(l)) rows = l;
        count = Number(i.count ?? 0) || count;
        totalPages = Number(i.totalPages ?? 0) || totalPages;
      }
      if (!count) count = Number(p.count ?? 0) || rows.length;
      if (!totalPages) totalPages = Number(p.totalPages ?? 0);
    }
    return { rows, count, totalPages };
  };

  const out: Record<string, unknown> = { at: new Date().toISOString(), tokenFrom: pick.from, lookups: [], pages: {} as Record<string, unknown> };

  // ── کدهای گزارش‌شده + کل ران‌های پیوسته ──
  const RUNS: Array<[number, number]> = [
    [55646, 55649], [54838, 54843], [55610, 55617], [55579, 55583], [53292, 53298], [55095, 55098],
  ];
  const codes: string[] = [];
  for (const [a, b] of RUNS) for (let c = a; c <= b; c += 1) codes.push(String(c));

  for (const code of codes) {
    const entry: Record<string, unknown> = { code };
    try {
      const res = await armCall<unknown>({
        path: MELK_ENDPOINTS.arm.requestsList, baseUrl: cfg.armApiBase, token,
        query: { page: 1, limit: 25, code }, timeoutMs: 110_000, maxRetries: 0,
      });
      const x = extract(res.data);
      const matched = x.rows.find((r) => String((r as Record<string, unknown>).code ?? "").trim() === code);
      entry.rows = x.rows.length; entry.count = x.count; entry.found = Boolean(matched);
      if (matched) {
        const m = matched as Record<string, unknown>;
        const st0 = Array.isArray(m.status) ? (m.status as Array<Record<string, unknown>>)[0] as Record<string, unknown> | undefined : undefined;
        entry.row = {
          _id: String(m._id ?? m.id ?? ""), code: String(m.code ?? ""), title: String(m.title ?? ""),
          relatedCustomer: String(m.relatedCustomer ?? ""), relatedRealtor: String(m.relatedRealtor ?? ""),
          createdAt: String(m.createdAt ?? ""), business: String((m.businessId as Record<string, unknown> | undefined)?.title ?? ""),
          status: String((st0?.currentStatus as Record<string, unknown> | undefined)?.name ?? ""),
        };
      }
    } catch (e) {
      entry.error = String((e as Error).message).slice(0, 150);
    }
    (out.lookups as unknown[]).push(entry);
  }
  const found = (out.lookups as Array<Record<string, unknown>>).filter((e) => e.found);
  console.log(`lookups: ${found.length}/${codes.length} found at source`);
  for (const f of found) console.log(`  FOUND ${f.code}: ${JSON.stringify(f.row)}`);

  // ── صفحهٔ ۱۳ و ۲۰ — فراسوی مرز ۱۲ ──
  for (const pg of [13, 20]) {
    try {
      const res = await armCall<unknown>({
        path: MELK_ENDPOINTS.arm.requestsList, baseUrl: cfg.armApiBase, token,
        query: { page: pg, limit: 50 }, timeoutMs: 110_000, maxRetries: 0,
      });
      const x = extract(res.data);
      (out.pages as Record<string, unknown>)[`page${pg}`] = {
        rows: x.rows.length, count: x.count, totalPages: x.totalPages,
        firstCodes: x.rows.map((r) => String((r as Record<string, unknown>).code ?? "")).slice(0, 12),
        lastCode: x.rows.length ? String((x.rows[x.rows.length - 1] as Record<string, unknown>).code ?? "") : null,
      };
      console.log(`page${pg}: rows=${x.rows.length} count=${x.count} totalPages=${x.totalPages}`);
    } catch (e) {
      (out.pages as Record<string, unknown>)[`page${pg}`] = { error: String((e as Error).message).slice(0, 150) };
      console.log(`page${pg}: ERROR`);
    }
  }

  mkdirSync("download/dir-missing-req-001", { recursive: true });
  writeFileSync("download/dir-missing-req-001/source-probe-valid-token.json", JSON.stringify(out, null, 2));
  console.log("شاهد: download/dir-missing-req-001/source-probe-valid-token.json");
  await db.$disconnect();
  return 0;
}

process.exit(await main());
