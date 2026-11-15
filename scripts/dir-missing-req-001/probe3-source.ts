#!/usr/bin/env bun
/**
 * DIR-MISSING-REQ-001 — probe3-source.ts
 * پروب زندهٔ منبع ARM برای کدهای گمشدهٔ فهرست درخواست (M2)
 *   ۱) requests/list?code={code} برای هر ۶ کد گزارش‌شدهٔ مالک
 *   ۲) requests/list?page=13 (فراسوی مرز صفحهٔ ۱۲ — نقطهٔ توقف چرخه)
 *   ۳) requests/list?page=1 (پاکت مرجع: count/totalPages)
 * مسیر: armCall → proxyFetch → relayFetch (گوشی مالک) — عین سینک تولیدی.
 */
import { writeFileSync, mkdirSync } from "node:fs";

// env زنده (عین melka-debug.ts)
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

const MISSING = ["55647", "54842", "55615", "55583", "53295", "55095"];

const { PrismaClient } = await import("@prisma/client");
const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL ?? "file:db/custom.db" } } });

async function resolveArmToken(): Promise<string | null> {
  try {
    const live = await db.session.findFirst({
      where: { revoked: false, expiresAt: { gt: new Date() }, armTokenEnc: { not: null } },
      orderBy: { lastSeenAt: "desc" },
    });
    if (live) {
      const { sessionToArmTokens } = await import("@/lib/auth/session");
      const tokens = sessionToArmTokens(live);
      if (tokens?.accessToken) return tokens.accessToken;
    }
    const vault = await db.armConnection.findFirst({ orderBy: { lastRefreshedAt: "desc" } });
    if (vault?.tokenEnc) {
      const { decryptSecret } = await import("@/lib/auth/crypto");
      const token = decryptSecret(vault.tokenEnc);
      if (token) return token;
    }
  } catch { /* صرف‌نظر */ }
  return null;
}

async function main(): Promise<number> {
  const { armCall } = await import("@/lib/melk-api/client");
  const { getMelkApiConfig } = await import("@/lib/melk-api/config");
  const { MELK_ENDPOINTS } = await import("@/lib/melk-api/endpoints");
  const cfg = getMelkApiConfig();

  const token = await resolveArmToken();
  if (!token) {
    console.log(JSON.stringify({ ok: false, error: "NO_ARM_TOKEN" }, null, 2));
    return 1;
  }

  const out: Record<string, unknown> = {
    at: new Date().toISOString(),
    probe: "dir-missing-req-001 source probe (relay path)",
    codeLookups: [] as unknown[],
    page13: null as unknown,
    page1: null as unknown,
  };

  // ── ۱) جست‌وجوی تک‌تک کدهای گمشده با فیلتر کدِ خود سامانه ──
  for (const code of MISSING) {
    const entry: Record<string, unknown> = { code };
    for (const filter of [{ code }, { "code[]": code }] as Record<string, string>[]) {
      try {
        const res = await armCall<unknown>({
          path: MELK_ENDPOINTS.arm.requestsList,
          baseUrl: cfg.armApiBase,
          token,
          query: { page: 1, limit: 25, ...filter },
          timeoutMs: 110_000,
          maxRetries: 0,
        });
        const payload = res.data as Record<string, unknown> | null;
        // استخراج list از هر قالب پاکت
        let rows: unknown[] = [];
        let count = 0;
        if (payload && typeof payload === "object") {
          const inner = (payload.data ?? payload.list ?? payload.rows ?? payload.items ?? payload.docs) as
            | Record<string, unknown>
            | unknown[]
            | undefined;
          if (Array.isArray(inner)) rows = inner;
          else if (inner && typeof inner === "object") {
            const l = (inner as Record<string, unknown>).list ?? (inner as Record<string, unknown>).docs ?? (inner as Record<string, unknown>).rows;
            if (Array.isArray(l)) rows = l;
          }
          count = Number(payload.count ?? (payload.data as Record<string, unknown> | undefined)?.count ?? 0) || rows.length;
        }
        const matched = rows.find((r) => {
          const rr = r as Record<string, unknown>;
          return String(rr.code ?? rr.requestCode ?? "").trim() === code;
        });
        entry.filter = filter;
        entry.rowCount = rows.length;
        entry.count = count;
        entry.found = Boolean(matched);
        if (matched) {
          const m = matched as Record<string, unknown>;
          entry.foundRow = {
            _id: String(m._id ?? m.id ?? ""),
            code: String(m.code ?? m.requestCode ?? ""),
            title: String(m.title ?? ""),
            relatedCustomer: String(m.relatedCustomer ?? ""),
            relatedRealtor: String(m.relatedRealtor ?? ""),
            createdAt: String(m.createdAt ?? ""),
            business: String((m.businessId as Record<string, unknown> | undefined)?.title ?? ""),
            currentStatus: String(
              ((m.status as Array<Record<string, unknown>> | undefined)?.[0] as Record<string, unknown> | undefined) !== undefined
                ? (((m.status as Array<Record<string, unknown>>)[0] as unknown as Record<string, unknown>)?.currentStatus as Record<string, unknown> | undefined)?.name ?? ""
                : "",
            ),
          };
        }
        if (entry.found) break; // با قالب اول پیدا شد — قالب دوم لازم نیست
      } catch (e) {
        entry.error = String((e as Error)?.message ?? e).slice(0, 200);
      }
    }
    console.log(`code ${entry.code}: found=${entry.found} rows=${entry.rowCount ?? "-"} ${entry.error ? "err=" + String(entry.error).slice(0, 80) : ""}`);
    (out.codeLookups as unknown[]).push(entry);
  }

  // ── ۲) صفحهٔ ۱۳ — فراسوی مرز چرخهٔ گیرکرده (صفحهٔ ۱۲) ──
  try {
    const res = await armCall<unknown>({
      path: MELK_ENDPOINTS.arm.requestsList,
      baseUrl: cfg.armApiBase,
      token,
      query: { page: 13, limit: 50 },
      timeoutMs: 110_000,
      maxRetries: 0,
    });
    const payload = res.data as Record<string, unknown> | null;
    let rows: unknown[] = [];
    let count = 0;
    let totalPages = 0;
    if (payload && typeof payload === "object") {
      const inner = (payload.data ?? payload.list) as Record<string, unknown> | undefined;
      if (inner && typeof inner === "object" && Array.isArray((inner as Record<string, unknown>).list)) {
        rows = (inner as Record<string, unknown>).list as unknown[];
        count = Number((inner as Record<string, unknown>).count ?? 0);
        totalPages = Number((inner as Record<string, unknown>).totalPages ?? 0);
      } else if (Array.isArray(inner)) rows = inner;
    }
    out.page13 = {
      rowCount: rows.length,
      count,
      totalPages,
      codes: rows.map((r) => String((r as Record<string, unknown>).code ?? "")).slice(0, 60),
    };
    console.log(`page13: rows=${rows.length} count=${count} totalPages=${totalPages}`);
  } catch (e) {
    out.page13 = { error: String((e as Error)?.message ?? e).slice(0, 200) };
    console.log("page13: ERROR", String((e as Error)?.message ?? e).slice(0, 120));
  }

  // ── ۳) صفحهٔ ۱ — پاکت مرجع ──
  try {
    const res = await armCall<unknown>({
      path: MELK_ENDPOINTS.arm.requestsList,
      baseUrl: cfg.armApiBase,
      token,
      query: { page: 1, limit: 50 },
      timeoutMs: 110_000,
      maxRetries: 0,
    });
    const payload = res.data as Record<string, unknown> | null;
    let rows: unknown[] = [];
    let count = 0;
    let totalPages = 0;
    if (payload && typeof payload === "object") {
      const inner = (payload.data ?? payload.list) as Record<string, unknown> | undefined;
      if (inner && typeof inner === "object" && Array.isArray((inner as Record<string, unknown>).list)) {
        rows = (inner as Record<string, unknown>).list as unknown[];
        count = Number((inner as Record<string, unknown>).count ?? 0);
        totalPages = Number((inner as Record<string, unknown>).totalPages ?? 0);
      } else if (Array.isArray(inner)) rows = inner;
    }
    out.page1 = {
      rowCount: rows.length,
      count,
      totalPages,
      firstCodes: rows.map((r) => String((r as Record<string, unknown>).code ?? "")).slice(0, 60),
      lastCodes: rows.map((r) => String((r as Record<string, unknown>).code ?? "")).slice(-10),
    };
    console.log(`page1: rows=${rows.length} count=${count} totalPages=${totalPages}`);
  } catch (e) {
    out.page1 = { error: String((e as Error)?.message ?? e).slice(0, 200) };
    console.log("page1: ERROR", String((e as Error)?.message ?? e).slice(0, 120));
  }

  mkdirSync("download/dir-missing-req-001", { recursive: true });
  const path = "download/dir-missing-req-001/source-probe.json";
  writeFileSync(path, JSON.stringify(out, null, 2));
  console.log(`شاهد: ${path}`);
  await db.$disconnect();
  return 0;
}

process.exit(await main());
