#!/usr/bin/env bun
/** PN-008 ثانیاً-۲ — تعقیب تک‌نقطهٔ زنده: traded-count-total@PM (تایم‌اوت ۲۰۰s) + قراردادها روی ARM */
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
const pmToken = decryptSecret((await db.pmConnection.findFirst())?.tokenEnc ?? "") ?? "";
const armToken = decryptSecret((await db.armConnection.findFirst({ orderBy: { lastRefreshedAt: "desc" } }))?.tokenEnc ?? "") ?? "";

const maskObj = (o: any, d = 0): any => {
  if (Array.isArray(o)) return o.slice(0, 2).map((x) => maskObj(x, d + 1));
  if (o && typeof o === "object" && d < 7) { const r: any = {}; for (const [k, v] of Object.entries(o).slice(0, 40)) r[k] = /mobile/i.test(k) ? "***" : maskObj(v, d + 1); return r; }
  return typeof o === "string" && o.length > 140 ? o.slice(0, 140) + "…" : o;
};
const res: any[] = [];
const probe = async (label: string, path: string, base: string, token: string, timeoutMs: number, query: Record<string, unknown> = {}) => {
  const t0 = Date.now();
  try {
    const r = await armCall<any>({ path, baseUrl: base, token, timeoutMs, maxRetries: 0, query: query as any });
    res.push({ label, ok: true, ms: Date.now() - t0, keys: Object.keys(r.data ?? {}), shape: maskObj(r.data) });
  } catch (e: any) { res.push({ label, ok: false, ms: Date.now() - t0, error: String(e?.code ?? e?.message ?? e).slice(0, 120) }); }
};

// نقطهٔ زندهٔ واحد: این مسیر روی PM خطای 401 نداد — فقط کُند بود
await probe("traded-count-total@PM×200s", "realtor-reports/traded-count-total", PM, pmToken, 200_000, { page: 1, limit: 3 });
// قراردادها (منبع واقعی مبایعه/اجاره) روی ARM با توکن ARM
await probe("trade-overviews/list@ARM", "trade-overviews/list", ARM, armToken, 90_000, { page: 1, limit: 3 });
// گزارش کوتاه معاملات روی ARM — دوباره (تأیید 401 یا دیرپذیری)
await probe("traded-count@ARM×90s", "realtor-reports/traded-count", ARM, armToken, 90_000, { page: 1, limit: 3 });

writeFileSync("/home/z/my-project/download/pn008/reports-chase.json", JSON.stringify({ at: new Date().toISOString(), res }, null, 2));
console.log(JSON.stringify(res.map((r) => ({ label: r.label, ok: r.ok, ms: r.ms, keys: r.keys, error: r.error })), null, 1));
await db.$disconnect();
