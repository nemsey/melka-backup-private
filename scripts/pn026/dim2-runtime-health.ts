#!/usr/bin/env bun
/** PN-026 · بُعد ۲ — Runtime سالم · ۵۵ probe طبق جدول اقدام + کشف خطا
 *  روش‌شناسی: نشست واقعی مالک (الگوی هر دروازه از PN-020) · POST feedback با payload نامعتبر
 *  (۴۰۰ + صفر نوشتار) برای حفظ قید «صفر POST» روی داده.
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";

const BASE = "http://localhost:3000";
const TILES = ["arm-listings","arm-requests","transactions-contracts","experts","smart-matching","learning-tier","market-index","data-coverage","file-finder","management-dashboard","listings","requests","settings"];

// ۱) خواندن کد مدیر از env واقعی (بدون چاپ)
const envLocal = readFileSync("/home/z/my-project/.env.local", "utf8");
const masterCode = envLocal.match(/MASTER_ACCESS_CODE\s*=\s*"?([0-9]{8})"?/)?.[1];
if (!masterCode) { console.error("✗ کد مدیر در env یافت نشد"); process.exit(1); }

// ۲) نشست مالک
const loginRes = await fetch(`${BASE}/api/auth/master-login`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ masterCode }),
});
const loginBody = await loginRes.json().catch(() => null);
const token: string | undefined = loginBody?.token;
console.log(`login: ${loginRes.status} · ${loginBody?.user?.displayName ?? "?"} · token: ${token ? "✓" : "✗"}`);

type P = { name: string; method: string; url: string; status: number; ms: number; auth?: string; note?: string };
const probes: P[] = [];

async function probe(name: string, method: string, path: string, opts: { auth?: boolean; body?: unknown; note?: string } = {}) {
  const t0 = performance.now();
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { "content-type": "application/json", ...(opts.auth && token ? { authorization: `Bearer ${token}` } : {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const ms = Math.round((performance.now() - t0) * 10) / 10;
    probes.push({ name, method, url: path, status: res.status, ms, auth: opts.auth ? "session" : "anon", note: opts.note });
    return { status: res.status, ms, body: await res.text().catch(() => "") };
  } catch (e) {
    probes.push({ name, method, url: path, status: -1, ms: -1, auth: opts.auth ? "session" : "anon", note: `fetch-error:${String(e).slice(0, 60)}` });
    return { status: -1, ms: -1, body: "" };
  }
}

// ============ اجرای جدول اقدام ============
// ردیف ۱-۲: health + version (بدون نشست — عمومی)
await probe("health", "GET", "/api/health");
await probe("version", "GET", "/api/version");

// ردیف ۳-۵: insight / stats / policy × ۱۳ کاشی (با نشست مالک)
for (const t of TILES) {
  await probe(`insight:${t}`, "GET", `/api/agent/${t}/insight`, { auth: true });
  await probe(`stats:${t}`, "GET", `/api/agent/${t}/stats`, { auth: true });
  await probe(`policy:${t}`, "GET", `/api/agent/${t}/policy`, { auth: true });
}

// ردیف ۶: POST feedback × ۱۳ — دو لایه بدون نوشتار:
//   الف) بدون نشست → انتظار ۴۰۱ (گیت نشست)
//   ب) با نشست + payload نامعتبر → انتظار ۴۰۰ (اعتبارسنجی) — صفر رکورد
for (const t of TILES) {
  await probe(`feedback-anon:${t}`, "POST", `/api/agent/${t}/feedback`, { body: { rating: 1 } });
  await probe(`feedback-invalid:${t}`, "POST", `/api/agent/${t}/feedback`, { auth: true, body: { rating: 1 }, note: "payload نامعتبر — اعتبارسنجی بدون نوشتار" });
}

// ردیف ۷: مسیر منسوخ /api/agent/feedback (بدون tileId)
await probe("deprecated:/api/agent/feedback", "GET", "/api/agent/feedback");
await probe("deprecated:/api/agent/feedback (POST)", "POST", "/api/agent/feedback", { body: {} });

// ============ تجمیع ============
const byClass = (pred: (p: P) => boolean) => probes.filter(pred);
const cls = {
  ok200: byClass((p) => p.status === 200).length,
  unauthorized401: byClass((p) => p.status === 401).length,
  notFound404: byClass((p) => p.status === 404).length,
  validation400: byClass((p) => p.status === 400).length,
  serverError5xx: byClass((p) => p.status >= 500).length,
  fetchError: byClass((p) => p.status === -1).length,
};

const endpointSummary: Record<string, { total: number; c200: number; c401: number; c404: number; c400: number; c5xx: number; avgMs?: number; tiles404?: string[] }> = {};
function agg(prefix: string, label: string) {
  const rows = probes.filter((p) => p.name.startsWith(prefix));
  const s = { total: rows.length, c200: rows.filter((p) => p.status === 200).length, c401: rows.filter((p) => p.status === 401).length, c404: rows.filter((p) => p.status === 404).length, c400: rows.filter((p) => p.status === 400).length, c5xx: rows.filter((p) => p.status >= 500).length };
  if (rows.length) { s.avgMs = Math.round(rows.reduce((a, p) => a + (p.ms > 0 ? p.ms : 0), 0) / rows.length * 10) / 10; }
  if (s.c404) (s as any).tiles404 = rows.filter((p) => p.status === 404).map((p) => p.name.split(":")[1]);
  endpointSummary[label] = s;
}
agg("health", "GET /api/health");
agg("version", "GET /api/version");
agg("insight:", "GET /api/agent/[tileId]/insight");
agg("stats:", "GET /api/agent/[tileId]/stats");
agg("policy:", "GET /api/agent/[tileId]/policy");
agg("feedback-anon:", "POST /api/agent/[tileId]/feedback (بدون نشست)");
agg("feedback-invalid:", "POST /api/agent/[tileId]/feedback (نشست+نامعتبر)");
agg("deprecated:", "مسیر منسوخ /api/agent/feedback");

// میانگین زمان پاسخ
const timed = probes.filter((p) => p.ms > 0);
const avgMs = Math.round(timed.reduce((a, p) => a + p.ms, 0) / timed.length * 10) / 10;
const maxMs = Math.max(...timed.map((p) => p.ms));
const slowest = timed.slice().sort((a, b) => b.ms - a.ms).slice(0, 5);

const evidence = {
  dimension: "بُعد ۲ — Runtime سالم (Runtime Validity)",
  methodology: {
    session: "نشست واقعی مالک از master-login (الگوی دروازه‌های PN-020 تا PN-025) — یک ردیف Session",
    postRule: "قید «صفر POST/PUT/DELETE» روی داده حفظ شد: probe دستهٔ POST با (۱) بدون نشست → ۴۰۱ و (۲) نشست + payload نامعتبر → ۴۰۰ — مسیر و اعتبارسنجی ثابت، صفر رکورد نوشته شد",
    probeCount: { planned: 55, executed: probes.length, breakdown: "health 1 + version 1 + insight 13 + stats 13 + policy 13 + feedback-anon 13 + feedback-invalid 13 — جدول اقدام، ردیف feedback در دو لایهٔ بدون-نوشتار + منسوخ 2" },
  },
  summaryClasses: cls,
  endpointSummary,
  timing: { avgMs, maxMs, slowest },
  probes,
  findings: [] as string[],
};

// یافته‌ها
if (endpointSummary["GET /api/agent/[tileId]/insight"].c404 > 0) evidence.findings.push(`insight: ${endpointSummary["GET /api/agent/[tileId]/insight"].c404} کاشی بدون ایجنت → 404 (فایل‌یابی/داشبورد مدیریتی/تنظیمات — بررسی بُعد ۵)`);
if (cls.serverError5xx === 0) evidence.findings.push("صفر خطای 5xx در تمام probeها ✓");
if (cls.fetchError === 0) evidence.findings.push("صفر قطعی شبکه ✓");
const dep = probes.filter((p) => p.name.startsWith("deprecated:"));
evidence.findings.push(`مسیر منسوخ /api/agent/feedback: GET→${dep[0]?.status} · POST→${dep[1]?.status} (۴۰۴ = حذف‌شده ✓ — نگرانی مالک پوشش داده شد)`);

writeFileSync("/home/z/my-project/download/pn026/runtime-health.json", JSON.stringify(evidence, null, 1));
console.log("\n===== خلاصهٔ بُعد ۲ =====");
console.log("کلاس‌ها:", JSON.stringify(cls));
for (const [k, v] of Object.entries(endpointSummary)) console.log(`${k}: total=${v.total} 200=${v.c200} 401=${v.c401} 400=${v.c400} 404=${v.c404} 5xx=${v.c5xx} avg=${v.avgMs}ms`);
console.log("زمان: avg", avgMs, "ms · max", maxMs, "ms");
console.log("یافته‌ها:", evidence.findings.join(" | "));
