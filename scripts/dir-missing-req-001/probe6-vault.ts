#!/usr/bin/env bun
/**
 * DIR-MISSING-REQ-001 — probe6: کدام منبع توکن زنده است؟ (اثر انگشت هش — بدون چاپ راز)
 * سپس پروب کدهای گمشده با همان توکن.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";

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

const fp = (t: string) => createHash("sha256").update(t).digest("hex").slice(0, 12);

async function main(): Promise<number> {
  const sessions = await db.session.findMany({
    where: { revoked: false, expiresAt: { gt: new Date() }, armTokenEnc: { not: null } },
    orderBy: { lastSeenAt: "desc" },
    take: 5,
  });
  const vault = await db.armConnection.findFirst({ orderBy: { lastRefreshedAt: "desc" } });

  console.log("=== token fingerprints (hash only) ===");
  let workingToken: string | null = null;
  for (const s of sessions) {
    try {
      const dec = decryptSecret(s.armTokenEnc!);
      if (dec) {
        console.log(`session ${s.personnelCode} seen=${s.lastSeenAt.toISOString()} exp=${s.expiresAt.toISOString()} fp=${fp(dec)}`);
      }
    } catch { /* skip */ }
  }
  if (vault?.tokenEnc) {
    try {
      const dec = decryptSecret(vault.tokenEnc);
      if (dec) {
        console.log(`vault status=${vault.status} lastRefresh=${vault.lastRefreshedAt?.toISOString()} fp=${fp(dec)}`);
        workingToken = dec;
      }
    } catch { /* skip */ }
  }
  if (vault?.refreshTokenEnc) {
    try {
      const dec = decryptSecret(vault.refreshTokenEnc);
      if (dec) console.log(`vault.refresh fp=${fp(dec)} (len=${dec.length})`);
    } catch { /* skip */ }
  }

  if (!workingToken) {
    console.log("NO vault token — abort");
    return 1;
  }

  // ── پروب با توکن خزانه ──
  const { armCall } = await import("@/lib/melk-api/client");
  const { getMelkApiConfig } = await import("@/lib/melk-api/config");
  const { MELK_ENDPOINTS } = await import("@/lib/melk-api/endpoints");
  const cfg = getMelkApiConfig();

  const MISSING = ["55647", "54842", "55615", "55583", "53295", "55095"];
  const out: Record<string, unknown> = { at: new Date().toISOString(), tokenSource: "vault", codeLookups: [], pages: {} };

  const extract = (payload: unknown): { rows: unknown[]; count: number; totalPages: number } => {
    let rows: unknown[] = [];
    let count = 0;
    let totalPages = 0;
    const p = payload as Record<string, unknown> | null;
    if (p && typeof p === "object") {
      const inner = (p.data ?? p.list ?? p.rows ?? p.items) as Record<string, unknown> | unknown[] | undefined;
      if (Array.isArray(inner)) rows = inner;
      else if (inner && typeof inner === "object") {
        const l = (inner as Record<string, unknown>).list ?? (inner as Record<string, unknown>).docs ?? (inner as Record<string, unknown>).rows ?? (inner as Record<string, unknown>).data;
        if (Array.isArray(l)) rows = l;
        count = Number((inner as Record<string, unknown>).count ?? 0) || count;
        totalPages = Number((inner as Record<string, unknown>).totalPages ?? 0) || totalPages;
      }
      if (!count) count = Number(p.count ?? 0) || rows.length;
      if (!totalPages) totalPages = Number(p.totalPages ?? 0);
    }
    return { rows, count, totalPages };
  };

  // صفحهٔ ۱ سلامت توکن
  try {
    const res = await armCall<unknown>({
      path: MELK_ENDPOINTS.arm.requestsList, baseUrl: cfg.armApiBase, token: workingToken,
      query: { page: 1, limit: 50 }, timeoutMs: 110_000, maxRetries: 0,
    });
    const x = extract(res.data);
    (out.pages as Record<string, unknown>).page1 = { rows: x.rows.length, count: x.count, totalPages: x.totalPages, firstCodes: x.rows.map((r) => String((r as Record<string, unknown>).code ?? "")).slice(0, 15) };
    console.log(`page1(vault): rows=${x.rows.length} count=${x.count} totalPages=${x.totalPages}`);
  } catch (e) {
    (out.pages as Record<string, unknown>).page1 = { error: String((e as Error).message).slice(0, 150) };
    console.log("page1(vault): ERROR", String((e as Error).message).slice(0, 120));
  }

  for (const code of MISSING) {
    const entry: Record<string, unknown> = { code };
    try {
      const res = await armCall<unknown>({
        path: MELK_ENDPOINTS.arm.requestsList, baseUrl: cfg.armApiBase, token: workingToken,
        query: { page: 1, limit: 25, code }, timeoutMs: 110_000, maxRetries: 0,
      });
      const x = extract(res.data);
      const matched = x.rows.find((r) => String((r as Record<string, unknown>).code ?? "").trim() === code);
      entry.rows = x.rows.length;
      entry.count = x.count;
      entry.found = Boolean(matched);
      if (matched) {
        const m = matched as Record<string, unknown>;
        const st = Array.isArray(m.status) ? ((m.status as Array<Record<string, unknown>>)[0] as Record<string, unknown> | undefined) : undefined;
        entry.row = {
          _id: String(m._id ?? m.id ?? ""),
          code: String(m.code ?? ""),
          title: String(m.title ?? ""),
          relatedCustomer: String(m.relatedCustomer ?? ""),
          relatedRealtor: String(m.relatedRealtor ?? ""),
          createdAt: String(m.createdAt ?? ""),
          business: String((m.businessId as Record<string, unknown> | undefined)?.title ?? ""),
          status: String((st?.currentStatus as Record<string, unknown> | undefined)?.name ?? ""),
        };
      }
    } catch (e) {
      entry.error = String((e as Error).message).slice(0, 150);
    }
    console.log(`code ${code}: found=${entry.found} rows=${entry.rows ?? "-"} ${entry.error ? "err=" + String(entry.error).slice(0, 90) : ""}`);
    (out.codeLookups as unknown[]).push(entry);
  }

  mkdirSync("download/dir-missing-req-001", { recursive: true });
  writeFileSync("download/dir-missing-req-001/source-probe-vault.json", JSON.stringify(out, null, 2));
  console.log("شاهد: download/dir-missing-req-001/source-probe-vault.json");
  await db.$disconnect();
  return 0;
}

process.exit(await main());
