#!/usr/bin/env bun
/**
 * PN-008 · ثانیاً-۲ — کاوش سرد بی‌پیش‌فرض سامانهٔ PM (فراکامل · فراجامع · فراعمیق · چندوجهی)
 * --------------------------------------------------------------------------------
 * شش بُعد کاوش (هیچ ستونی از پیش فرض نمی‌شود — همه از پاسخ زنده استخراج می‌شود):
 *   A) توکن خزانه PM: آزمون → تمدید در صورت انقضا (authentication/refreshToken)
 *   B) عمومی: public/portalInfo (شکل خام)
 *   C) رجیستری پرسنل: realtors/list همهٔ صفحات — انبارداری فیلدها + نرخ پرشدگی
 *   D) عمق نمونهٔ ۱۲ نفر: personnelInfo + contactInfo + uploadedDocuments (شکل خام)
 *   E) گزارش‌های معاملات ARM (توکن خزانه ARM): traded-count-total + traded-count + realtor-interactions
 *   F) کشف مسیرهای باندل SPA سامانهٔ PM (شمارش کامل endpoint ها از خود سامانه)
 * خروجی: download/pn008/pm-exploration.json (موبایل‌ها ماسک، صفر نشت کامل)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

// ── بارگذاری کلید رمزنگاری (env.platform.json — بدون آن رمزگشایی خزانه ممکن نیست) ──
const platform = JSON.parse(readFileSync("/home/z/my-project/env.platform.json", "utf-8"));
for (const k of ["MELK_TOKEN_KEY"]) if (!process.env[k] && platform[k]) process.env[k] = platform[k];
if (!process.env.DATABASE_URL && platform.DATABASE_URL) process.env.DATABASE_URL = platform.DATABASE_URL;

const { PrismaClient } = await import("@prisma/client");
const { decryptSecret, encryptSecret } = await import("../../src/lib/auth/crypto");
const { armCall } = await import("../../src/lib/melk-api/client");
const { MELK_ENDPOINTS } = await import("../../src/lib/melk-api/endpoints");

const db = new PrismaClient();
const PM = "https://pm-api.melketabriz.ir/api/";
const ARM = "https://arus-api.melketabriz.ir/api/apm/";
const OUT = "/home/z/my-project/download/pn008";
mkdirSync(OUT, { recursive: true });

const mask = (v: unknown): unknown =>
  typeof v === "string" && /^(\+?98|0)?9\d{9}$/.test(v.replace(/[\s-]/g, "")) ? v.slice(0, 4) + "***" + v.slice(-3) : v;
const maskObj = (o: any): any => {
  if (Array.isArray(o)) return o.slice(0, 3).map(maskObj);
  if (o && typeof o === "object") { const r: any = {}; for (const [k, v] of Object.entries(o)) r[k] = /mobile|phone|tel/i.test(k) ? mask(v) : maskObj(v); return r; }
  return o;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const evidence: any = { task: "ثانیاً-۲ — کاوش سرد PM", at: new Date().toISOString(), dimensions: {} };

// ════════ بُعد A: توکن خزانه PM ════════
async function dimensionA(): Promise<string> {
  const pm = await db.pmConnection.findFirst();
  let token = decryptSecret(pm?.tokenEnc ?? "") ?? "";
  let refreshToken = decryptSecret(pm?.refreshTokenEnc ?? "") ?? "";
  const a: any = { vaultPersonnelCode: pm?.personnelCode ?? null, tokenChars: token.length };
  const test = async (t: string) => {
    try {
      const r = await armCall({ path: MELK_ENDPOINTS.pm.realtorsList, baseUrl: PM, token: t, timeoutMs: 25000, maxRetries: 0, query: { page: 1, limit: 2 } });
      return (r.data as any)?.list ? "OK" : "SHAPE?" + JSON.stringify(r.data).slice(0, 80);
    } catch (e: any) { return "FAIL:" + String(e?.code ?? e?.message ?? e).slice(0, 90); }
  };
  a.tokenTest = await test(token);
  if (!a.tokenTest.startsWith("OK") && refreshToken) {
    a.refreshTried = true;
    try {
      const r = await armCall<any>({ method: "POST", path: MELK_ENDPOINTS.pm.refreshToken, baseUrl: PM, body: { refreshToken }, timeoutMs: 25000, maxRetries: 0 });
      const nt = r.data?.token ?? r.data?.accessToken ?? null;
      const nrt = r.data?.refreshToken ?? refreshToken;
      if (nt) {
        token = nt; refreshToken = nrt;
        await db.pmConnection.update({ where: { id: "singleton" }, data: { tokenEnc: encryptSecret(nt), refreshTokenEnc: encryptSecret(nrt), status: "connected", lastError: null, updatedAt: new Date() } });
        a.tokenAfterRefresh = await test(token);
        a.vaultUpdated = true;
      } else a.refreshShape = maskObj(r.data);
    } catch (e: any) { a.refreshError = String(e?.message ?? e).slice(0, 140); }
  }
  evidence.dimensions.A_token = a;
  return token;
}

// ════════ بُعد B: عمومی portalInfo ════════
async function dimensionB() {
  try {
    const r = await armCall({ path: MELK_ENDPOINTS.pm.portalInfo, baseUrl: PM, timeoutMs: 25000, maxRetries: 1 });
    evidence.dimensions.B_public = { portalInfoShape: maskObj(r.data) };
  } catch (e: any) { evidence.dimensions.B_public = { error: String(e?.message ?? e).slice(0, 140) }; }
}

// ════════ بُعد C: رجیستری پرسنل — همهٔ صفحات + انبار فیلد ════════
async function dimensionC(token: string) {
  const all: any[] = [];
  let page = 1, totalPages = 1;
  const c: any = { pages: [], fieldInventory: {} };
  while (page <= Math.min(totalPages, 25)) {
    const r = await armCall<any>({ path: MELK_ENDPOINTS.pm.realtorsList, baseUrl: PM, token, timeoutMs: 40000, maxRetries: 1, query: { page, limit: 30 } });
    const d = r.data ?? {};
    const list: any[] = Array.isArray(d.list) ? d.list : [];
    c.pages.push({ page, count: list.length, total: d.total ?? null, totalPages: d.totalPages ?? null });
    all.push(...list.filter((x) => x && x._id));
    totalPages = Number(d.totalPages ?? 1) || 1;
    page += 1;
    await sleep(400);
  }
  // انبار فیلد: نام + نوع + نرخ پرشدگی + نمونهٔ ماسک‌شده
  const inv: Record<string, { type: string; filled: number; pct: string; sample: unknown }> = {};
  for (const row of all) {
    for (const [k, v] of Object.entries(row)) {
      if (!inv[k]) inv[k] = { type: Array.isArray(v) ? "array" : typeof v, filled: 0, pct: "", sample: undefined };
      if (v !== null && v !== undefined && v !== "") inv[k].filled += 1;
      if (inv[k].sample === undefined && v !== null && v !== undefined && v !== "") inv[k].sample = /mobile/i.test(k) ? mask(v) : typeof v === "object" ? maskObj(v) : String(v).slice(0, 90);
    }
  }
  for (const k of Object.keys(inv)) { inv[k].pct = ((inv[k].filled / all.length) * 100).toFixed(1) + "%"; inv[k].filled = inv[k].filled; }
  c.totalRows = all.length;
  c.fieldInventory = Object.fromEntries(Object.entries(inv).sort((a, b) => b[1].filled - a[1].filled));
  c.firstRowMasked = maskObj(all[0]);
  evidence.dimensions.C_personnelRegistry = c;
  return all;
}

// ════════ بُعد D: عمق نمونهٔ ۱۲ نفر ════════
async function dimensionD(token: string, all: any[]) {
  const d: any = { sampled: [], errors: [] };
  const sample = all.slice(0, 12);
  for (const p of sample) {
    const entry: any = { id: p._id, fullName: p.fullName ?? null };
    for (const [label, path] of [
      ["personnelInfo", MELK_ENDPOINTS.pm.realtorPersonnelInfo(p._id)],
      ["contactInfo", MELK_ENDPOINTS.pm.realtorContactInfo(p._id)],
      ["uploadedDocuments", MELK_ENDPOINTS.pm.realtorUploadedDocuments(p._id)],
    ] as const) {
      try {
        const r = await armCall<any>({ path, baseUrl: PM, token, timeoutMs: 30000, maxRetries: 0 });
        entry[label] = maskObj(r.data);
      } catch (e: any) { entry[label] = { error: String(e?.code ?? e?.message ?? e).slice(0, 90) }; d.errors.push(`${label}:${p._id}`); }
      await sleep(350);
    }
    d.sampled.push(entry);
  }
  evidence.dimensions.D_deepDive = d;
}

// ════════ بُعد E: گزارش‌های معاملات ARM (توکن خزانه ARM) ════════
async function dimensionE() {
  const e: any = {};
  const arm = await db.armConnection.findFirst({ orderBy: { lastRefreshedAt: "desc" } });
  const armToken = decryptSecret(arm?.tokenEnc ?? "") ?? "";
  e.armVaultToken = armToken.length > 0;
  if (armToken) {
    for (const [label, path, query] of [
      ["tradedCountTotal", MELK_ENDPOINTS.arm.tradedTotal, { page: 1, limit: 3 }],
      ["tradedCount", MELK_ENDPOINTS.arm.tradedCount, {}],
      ["realtorInteractions", MELK_ENDPOINTS.arm.realtorInteractions, { page: 1, limit: 3 }],
    ] as const) {
      try {
        const r = await armCall<any>({ path, baseUrl: ARM, token: armToken, timeoutMs: 40000, maxRetries: 0, query: query as any });
        e[label] = { shape: maskObj(r.data), keys: Object.keys(r.data ?? {}) };
      } catch (err: any) { e[label] = { error: String(err?.code ?? err?.message ?? err).slice(0, 120) }; }
      await sleep(400);
    }
  }
  evidence.dimensions.E_armReports = e;
}

// ════════ بُعد F: کشف مسیرهای باندل SPA سامانه PM ════════
async function dimensionF() {
  const f: any = { url: "https://pm.melketabriz.ir/" };
  try {
    const html = await (await fetch("https://pm.melketabriz.ir/", { signal: AbortSignal.timeout(20000) })).text();
    f.htmlLen = html.length;
    const scripts = [...html.matchAll(/(?:src|href)="(\/[^"]+?\.(?:js|mjs))"/g)].map((m) => m[1]);
    f.bundles = scripts.length;
    const paths = new Set<string>();
    let downloaded = 0;
    for (const s of scripts.slice(0, 14)) {
      if (downloaded > 12_000_000) break;
      try {
        const js = await (await fetch("https://pm.melketabriz.ir" + s, { signal: AbortSignal.timeout(30000) })).text();
        downloaded += js.length;
        for (const m of js.matchAll(/["'`]([a-z0-9][a-z0-9\-]*(?:\/[a-z0-9\-{}:._]+){1,6})["'`]/g)) paths.add(m[1]);
        for (const m of js.matchAll(/["'`](\/api\/[a-z0-9\-\/{}:._]+)["'`]/g)) paths.add(m[1]);
      } catch { /* باندل بعدی */ }
    }
    f.downloadedMB = +(downloaded / 1048576).toFixed(1);
    const all = [...paths].filter((p) => !/\.(png|jpg|svg|css|woff|ico|webp|txt|map)$/.test(p)).sort();
    // فقط مسیرهای مرتبط به سامانه‌های داده (نه asset/مسیرهای داخلی باندل)
    const relevant = all.filter((p) => /^(authentication|realtors|realtor-reports|real-estates|properties|requests|dashboard|count|statics|public|users|contracts|documents|businesses|apm|special-properties|settings|profile|roles|permissions|reports|financial|acc|fm)/.test(p));
    f.allPathCount = all.length;
    f.relevantEndpoints = relevant;
    writeFileSync(`${OUT}/pm-bundle-endpoints.json`, JSON.stringify({ at: new Date().toISOString(), allPathCount: all.length, relevant, all }, null, 2));
  } catch (e: any) { f.error = String(e?.message ?? e).slice(0, 140); }
  evidence.dimensions.F_spaDiscovery = { bundles: f.bundles, downloadedMB: f.downloadedMB, allPathCount: f.allPathCount, relevantCount: f.relevantEndpoints?.length ?? 0, relevantSample: (f.relevantEndpoints ?? []).slice(0, 60) };
}

// ════════ اجرا ════════
const t0 = Date.now();
const token = await dimensionA();
await dimensionB();
const all = await dimensionC(token);
await dimensionD(token, all);
await dimensionE();
await dimensionF();
evidence.durationMs = Date.now() - t0;
writeFileSync(`${OUT}/pm-exploration.json`, JSON.stringify(evidence, null, 2));
console.log(`DONE in ${(evidence.durationMs / 1000).toFixed(0)}s`);
console.log(JSON.stringify({
  A: evidence.dimensions.A_token,
  C: { totalRows: evidence.dimensions.C_personnelRegistry?.totalRows, fields: Object.keys(evidence.dimensions.C_personnelRegistry?.fieldInventory ?? {}).length },
  D_errors: evidence.dimensions.D_deepDive?.errors?.length ?? 0,
  E: { armVault: evidence.dimensions.E_armReports?.armVaultToken, tct: evidence.dimensions.E_armReports?.tradedCountTotal?.keys ?? evidence.dimensions.E_armReports?.tradedCountTotal?.error },
  F: { paths: evidence.dimensions.F_spaDiscovery?.allPathCount, relevant: evidence.dimensions.F_spaDiscovery?.relevantCount },
}, null, 2));
await db.$disconnect();
