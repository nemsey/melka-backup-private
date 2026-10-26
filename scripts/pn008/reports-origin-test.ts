#!/usr/bin/env bun
/** PN-008 ثانیاً-۲ — آزمون متقابل: خانوادهٔ realtor-reports روی PM (توکن PM) — کشف مبدا واقعی گزارش‌ها */
import { readFileSync, writeFileSync } from "node:fs";
const platform = JSON.parse(readFileSync("/home/z/my-project/env.platform.json", "utf-8"));
for (const k of ["MELK_TOKEN_KEY"]) if (!process.env[k] && platform[k]) process.env[k] = platform[k];
if (!process.env.DATABASE_URL && platform.DATABASE_URL) process.env.DATABASE_URL = platform.DATABASE_URL;

const { PrismaClient } = await import("@prisma/client");
const { decryptSecret } = await import("../../src/lib/auth/crypto");
const { armCall } = await import("../../src/lib/melk-api/client");

const db = new PrismaClient();
const PM = "https://pm-api.melketabriz.ir/api/";
const ARM = "https://arus-api.melketabriz.ir/api/apm/";
const pm = await db.pmConnection.findFirst();
const pmToken = decryptSecret(pm?.tokenEnc ?? "") ?? "";
const arm = await db.armConnection.findFirst({ orderBy: { lastRefreshedAt: "desc" } });
const armToken = decryptSecret(arm?.tokenEnc ?? "") ?? "";

const maskObj = (o: any, d = 0): any => {
  if (Array.isArray(o)) return o.slice(0, 2).map((x) => maskObj(x, d + 1));
  if (o && typeof o === "object" && d < 7) { const r: any = {}; for (const [k, v] of Object.entries(o).slice(0, 40)) r[k] = /mobile/i.test(k) ? "***" : maskObj(v, d + 1); return r; }
  return typeof o === "string" && o.length > 120 ? o.slice(0, 120) + "…" : o;
};

const tries: any[] = [];
const probe = async (label: string, path: string, base: string, token: string, query: Record<string, unknown> = {}) => {
  try {
    const r = await armCall<any>({ path, baseUrl: base, token, timeoutMs: 60000, maxRetries: 0, query: query as any });
    tries.push({ label, base: base.includes("pm-api") ? "PM" : "ARM", ok: true, keys: Object.keys(r.data ?? {}), shape: maskObj(r.data) });
  } catch (e: any) {
    tries.push({ label, base: base.includes("pm-api") ? "PM" : "ARM", ok: false, error: String(e?.code ?? e?.message ?? e).slice(0, 100) });
  }
};

// ۱) گزارش‌ها روی PM با توکن PM
await probe("traded-count-total@PM", "realtor-reports/traded-count-total", PM, pmToken, { page: 1, limit: 3 });
await probe("traded-count@PM", "realtor-reports/traded-count", PM, pmToken, {});
await probe("realtor-interactions@PM", "realtor-reports/realtor-interactions", PM, pmToken, { page: 1, limit: 3 });
// ۲) همان‌ها روی PM با توکن ARM (آزمون پذیرش متقابل)
await probe("traded-count-total@PM+armToken", "realtor-reports/traded-count-total", PM, armToken, { page: 1, limit: 3 });
// ۳) contracts روی PM (کشف قراردادها — مبایعه/اجاره)
await probe("real-estates/contracts@PM", "real-estates/contracts/list", PM, pmToken, { page: 1, limit: 3 });
await probe("contracts@PM", "contracts/list", PM, pmToken, { page: 1, limit: 3 });

writeFileSync("/home/z/my-project/download/pn008/reports-origin-test.json", JSON.stringify({ at: new Date().toISOString(), tries }, null, 2));
console.log(JSON.stringify(tries.map((t) => ({ label: t.label, ok: t.ok, keys: t.keys, error: t.error })), null, 1));
await db.$disconnect();
