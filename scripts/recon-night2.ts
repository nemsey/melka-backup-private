#!/usr/bin/env bun
/**
 * recon-night2.ts — شب دوم Recon: آزمون فرضیهٔ قالب تاریخ (D.1) + مسیر جایگزین (D.2)
 * ------------------------------------------------------------------------------------
 * دستور ملکا-شورا-۰۰۸ (بخش D):
 *   D.1 — تعیین قطعی ریشهٔ totalCount=0: قالب (جلالی/ISO) یا scope؟
 *         A: ISO کاملِ عین UI (toISOString) بازهٔ ۲۰۲۴–۲۰۲۶ → اگر داده آمد، ریشه قالب بود
 *         B: جلالی بازهٔ ۱۴۰۳–۱۴۰۵ (تکرار کنترل شب ۱ با بازهٔ شورا)
 *         C: بدون بازه → رفتار شناخته‌شدهٔ 400 (شب ۱ s1-total) — بازتولید نشده، صرفه‌جویی
 *         D: ISO + realtor=_id → آزمون per-realtor
 *   D.2 — مسیر جایگزین معاملات + راستی‌آزمایی زندهٔ کشف B.4:
 *         realtor-interactions (بدون /list) با بازهٔ ISO + trade-overviews/list
 *
 * قیدهای حاکم (عین شب ۱):
 *   فقط GET · صفر پیامک/لاگین تازه · توکن نشست مالک از DB (اگر ARM آن را زنده بداند)
 *   پنجرهٔ ۲۲:۰۰–۰۶:۰۰ تهران · سقف ۱۹۰ GET · فاصلهٔ ≥۱۵۰۰ms · timeout ۳۰s · صفر retry
 *   429 → توقف فوری · 5xx×۲ پیاپی → توقف · ABORT فایل → مرگ در مرز بعدی
 *   محرمانگی درجه ۱: صفر payload/توکن/PII در لاگ — فقط متادیتا و شمارنده‌های مصوب
 */
import { appendFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { MELK_ENDPOINTS } from "../src/lib/melk-api/endpoints";
import { buildQuery } from "../src/lib/melk-api/client";
import { getMelkApiConfig } from "../src/lib/melk-api/config";
import { PrismaClient } from "@prisma/client";
import { decryptSecret } from "../src/lib/auth/crypto";

// ---------------------------------------------------------------------------
// ثابت‌های گارد
// ---------------------------------------------------------------------------
const MIN_INTERVAL_MS = 1500;
const DRY_INTERVAL_MS = 50;
const MAX_GET_TOTAL = 190;
const TIMEOUT_MS = 30_000;
const CONSECUTIVE_5XX_ABORT = 2;
const ABORT_FILE = "ABORT";

const cfg = getMelkApiConfig();
const ARM = cfg.armApiBase;

type Phase = "dry" | "run" | "followup";
let phase: Phase = "dry";
let forceWindow = false;
let token: string | null = null;

let getCount = 0;
const latencies: Record<string, number[]> = {};
let lastRequestEnd = 0;
let consecutive5xx = 0;

class ReconAbort extends Error {
  constructor(public reason: string) {
    super(reason);
  }
}

function logFile(): string {
  return phase === "dry" ? "recon-night2.dry.jsonl" : "recon-night2.jsonl";
}
function log(entry: Record<string, unknown>): void {
  appendFileSync(logFile(), JSON.stringify({ ts: new Date().toISOString(), phase, ...entry }) + "\n");
}
function tehranHour(now = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Tehran" }).format(now)
  );
}
function inWindow(): boolean {
  const h = tehranHour();
  return h >= 22 || h < 6;
}

/** اثر انگشت شکل پاسخ — فقط نام کلیدها و نوع‌ها */
function shapeHash(obj: unknown): string {
  const shape = (o: unknown, depth: number): unknown => {
    if (Array.isArray(o)) return o.length ? [shape(o[0], depth + 1)] : [];
    if (o !== null && typeof o === "object" && depth < 3) {
      const rec: Record<string, unknown> = {};
      for (const k of Object.keys(o).sort()) rec[k] = shape((o as Record<string, unknown>)[k], depth + 1);
      return rec;
    }
    return typeof o;
  };
  return createHash("sha1").update(JSON.stringify(shape(obj, 0))).digest("hex").slice(0, 12);
}

/** برداشت متادیتای مجاز از پوشهٔ NestJS */
function harvest(body: unknown): {
  statusLike: boolean;
  dataKeys: string[];
  rowCount: number;
  total: number | null;
  totalPages: number | null;
  rowKeys: string[];
  oldestDate: string | null;
} {
  const env = (body ?? {}) as Record<string, unknown>;
  const data = env.data;
  let rows: Record<string, unknown>[] = [];
  if (Array.isArray(data)) rows = data as Record<string, unknown>[];
  else if (data !== null && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (Array.isArray(d.items)) rows = d.items as Record<string, unknown>[];
    if (Array.isArray(d.list)) rows = d.list as Record<string, unknown>[];
  }
  const rowKeys = [...new Set(rows.flatMap((r) => (r && typeof r === "object" ? Object.keys(r) : [])))].sort();
  let oldestDate: string | null = null;
  for (const r of rows) {
    for (const [k, v] of Object.entries(r)) {
      if (/date/i.test(k) && typeof v === "string" && v.length >= 8 && v.length <= 30) {
        if (oldestDate === null || v < oldestDate) oldestDate = v;
      }
    }
  }
  const d2 = (data ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
  return {
    statusLike: env.status === true,
    dataKeys: data !== null && typeof data === "object" && !Array.isArray(data) ? Object.keys(d2).sort().slice(0, 40) : [],
    rowCount: rows.length,
    total: num(env.total) ?? num(env.totalCount) ?? num(d2.total) ?? num(d2.totalCount) ?? num(d2.count) ?? null,
    totalPages: num(env.totalPages) ?? num(d2.totalPages) ?? num(d2.totalPage) ?? null,
    rowKeys: rowKeys.slice(0, 40),
    oldestDate,
  };
}

async function gate(step: string): Promise<void> {
  if (existsSync(ABORT_FILE)) throw new ReconAbort("ABORT_REQUESTED");
  if (phase !== "dry" && !forceWindow && !inWindow()) throw new ReconAbort("OUTSIDE_WINDOW");
  if (getCount >= MAX_GET_TOTAL) throw new ReconAbort("GET_BUDGET_EXHAUSTED");
  const interval = phase === "dry" ? DRY_INTERVAL_MS : MIN_INTERVAL_MS;
  const wait = lastRequestEnd + interval - Date.now();
  if (wait > 0) await Bun.sleep(wait);
}

// ---------------------------------------------------------------------------
// آزمون خشک — پوشه‌های شکل واقعی (صفر تماس شبکه)
// ---------------------------------------------------------------------------
function mockFetch(url: string): Promise<Response> {
  const envelope = (data: unknown, extra: Record<string, unknown> = {}, status = 200): string =>
    JSON.stringify({ statusCode: status, status: status < 400, data, message: status < 400 ? "ok" : "خطا", ...extra });
  let body = envelope({}, { total: 0 });
  if (url.includes("realtors/list")) body = envelope([{ _id: "r-owner", fullName: "n", personnelCode: "c" }], { total: 1 });
  else if (url.includes("traded-count-total")) {
    if (!url.includes("startDate")) body = envelope({ message: "لطفا یک بازه تاریخی انتخاب کنید" }, {}, 400);
    else if (url.includes("startDate=2024")) body = envelope(
      [{ contractDate: "2025-05-01T00:00:00.000Z", priceText: "۱٫۲۰۰" }, { contractDate: "2024-08-11T00:00:00.000Z" }],
      { totalCount: 8123, totalPages: 82 }
    ); // ISO → داده هست (سناریوی H1)
    else body = envelope([], { totalCount: 0, totalPages: 0 }); // جلالی → صفر (شب ۱)
  } else if (url.includes("traded-count")) {
    if (url.includes("startDate=2024")) body = envelope({ count: 8123, list: [{ id: "t1" }], limit: 100, page: 1, totalPages: 82 });
    else body = envelope({ count: 0, list: [], totalPages: 0 });
  } else if (url.includes("realtor-interactions")) body = envelope({ count: 214, list: [{ requestRealtorName: "a", propertyRealtorName: "b", count: 3 }], totalPages: 3 });
  else if (url.includes("trade-overviews/list")) body = envelope([{ id: "c1", contractHolo: "h1", contractDate: "2025-04-02" }], { total: 410, totalPages: 41 });
  return Promise.resolve(new Response(body, { status: body.includes("بازه تاریخی") ? 400 : 200, headers: { "Content-Type": "application/json" } }));
}

interface ArmResult {
  status: number;
  h: ReturnType<typeof harvest>;
  body: Record<string, unknown>;
  rows: Record<string, unknown>[];
}
async function armCall(
  step: string,
  path: string,
  init: { query?: Record<string, string | number | undefined | null>; auth?: boolean } = {}
): Promise<ArmResult> {
  await gate(step);
  const url = `${ARM.replace(/\/$/, "")}/${path}${buildQuery(init.query)}`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.auth && token) headers.Authorization = `Bearer ${token}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const t0 = Date.now();
  let res: Response;
  try {
    if (phase === "dry") res = await mockFetch(url);
    else res = await fetch(url, { method: "GET", headers, signal: controller.signal, cache: "no-store" });
  } catch {
    log({ step, event: "network-error" });
    throw new ReconAbort("NETWORK_TIMEOUT_OR_ERROR");
  } finally {
    clearTimeout(timer);
  }
  const latencyMs = Date.now() - t0;
  lastRequestEnd = Date.now();
  getCount++;
  (latencies[step] ??= []).push(latencyMs);

  const text = await res.text().catch(() => "");
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = {};
  }
  const h = harvest(body);

  if (res.status === 429) {
    log({ step, event: "rate-limited" });
    throw new ReconAbort("RATE_LIMITED_429");
  }
  if (res.status === 401) {
    log({ step, event: "unauthorized" });
    throw new ReconAbort("TOKEN_DEAD_401");
  }
  if (res.status >= 500) {
    consecutive5xx++;
    log({ step, event: "server-error", status: res.status, consecutive: consecutive5xx });
    if (consecutive5xx >= CONSECUTIVE_5XX_ABORT) throw new ReconAbort("CONSECUTIVE_5XX");
  } else consecutive5xx = 0;

  const rows = Array.isArray(body.data)
    ? (body.data as Record<string, unknown>[])
    : ((body.data as Record<string, unknown> | undefined)?.list as Record<string, unknown>[] | undefined) ?? [];
  log({ step, endpoint: path.replace(/\?.*/, ""), status: res.status, latencyMs, ...h });
  return { status: res.status, h, body, rows };
}

// ---------------------------------------------------------------------------
// توکن — جدیدترین نشست دارای توکن ARM (اعتبار را خود ARM تعیین می‌کند)
// ---------------------------------------------------------------------------
async function loadSessionToken(): Promise<void> {
  if (phase === "dry") {
    token = "dry-token";
    return;
  }
  const db = new PrismaClient();
  try {
    // شامل نشست‌های منقضیِ سطح اپ — TTL توکن ARM مستقل از TTL نشست ماست؛
    // اگر ARM توکن را زنده بداند (پروب بعدی) استفاده مجدد بدون پیامک مجاز است (دستور D.1)
    const sessions = await db.session.findMany({
      where: { revoked: false, armTokenEnc: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { armTokenEnc: true, createdAt: true, armUserType: true, expiresAt: true },
    });
    for (const s of sessions) {
      if (!s.armTokenEnc || s.armTokenEnc.length < 50) continue;
      const plain = decryptSecret(s.armTokenEnc);
      if (plain && plain !== "null" && plain.length > 20) {
        token = plain;
        log({
          step: "session-auth",
          source: "db-session",
          tokenAcquired: true,
          sessionAgeH: Math.round((Date.now() - s.createdAt.getTime()) / 3600000),
          appSessionExpired: s.expiresAt < new Date(),
          armUserType: s.armUserType,
        });
        return;
      }
    }
    throw new ReconAbort("NO_ARM_TOKEN_IN_DB");
  } finally {
    await db.$disconnect();
  }
}

// ---------------------------------------------------------------------------
// گام‌ها
// ---------------------------------------------------------------------------
const E = MELK_ENDPOINTS.arm;

/** بازه‌های آزمون — عین دستور شورا؛ ISO کامل عین UI (کشف B.4) */
const ISO_START = "2024-01-01T00:00:00.000Z";
const ISO_END = "2026-12-31T23:59:59.999Z";
const JALALI_START = "1403/01/01";
const JALALI_END = "1405/12/31";

interface Verdict {
  step: string;
  status: number;
  total: number | null;
  rows: number;
  pages: number | null;
  oldestDate: string | null;
}
const verdicts: Verdict[] = [];
function record(step: string, r: ArmResult): void {
  verdicts.push({ step, status: r.status, total: r.h.total, rows: r.h.rowCount, pages: r.h.totalPages, oldestDate: r.h.oldestDate });
  console.log(
    `  ${step}: HTTP ${r.status} · total=${r.h.total ?? "—"} · rows=${r.h.rowCount} · pages=${r.h.totalPages ?? "—"} · قدیمی‌ترین=${r.h.oldestDate ?? "—"}`
  );
}

async function stepTokenProbe(): Promise<string | null> {
  const r = await armCall("probe-realtors", E.realtorsList, { auth: true, query: { page: 1, limit: 1 } });
  record("probe-realtors", r);
  if (r.status !== 200) throw new ReconAbort("TOKEN_PROBE_FAILED_" + r.status);
  const row = r.rows[0] ?? {};
  const rid = (typeof row._id === "string" ? row._id : typeof row.id === "string" ? row.id : null);
  return rid;
}

async function stepD1(realtorId: string | null): Promise<void> {
  // A — ISO کامل عین UI (فرضیهٔ اصلی پس از کشف B.4)
  record("A-total-iso", await armCall("A-total-iso", E.tradedTotal, { auth: true, query: { page: 1, limit: 100, startDate: ISO_START, endDate: ISO_END } }));
  record("A-list-iso", await armCall("A-list-iso", E.tradedCount, { auth: true, query: { page: 1, limit: 100, startDate: ISO_START, endDate: ISO_END } }));
  // B — جلالی (تکرار کنترل با بازهٔ شورا؛ شب ۱ با ۲۵ سال جلالی هم صفر بود)
  record("B-total-jalali", await armCall("B-total-jalali", E.tradedTotal, { auth: true, query: { page: 1, limit: 100, startDate: JALALI_START, endDate: JALALI_END } }));
  // D — ISO + realtor (per-realtor)
  if (realtorId) {
    record("D-total-iso-realtor", await armCall("D-total-iso-realtor", E.tradedTotal, { auth: true, query: { page: 1, limit: 100, startDate: ISO_START, endDate: ISO_END, realtor: realtorId } }));
    record("D-list-iso-realtor", await armCall("D-list-iso-realtor", E.tradedCount, { auth: true, query: { page: 1, limit: 100, startDate: ISO_START, endDate: ISO_END, realtor: realtorId } }));
  } else {
    console.log("  D: شناسهٔ realtor در دسترس نیست — آزمون per-realtor انجام نشد (شاهد: probe-realtors بدون _id)");
  }
}

async function stepD2(): Promise<void> {
  // راستی‌آزمایی زندهٔ کشف B.4 — تعاملات بدون /list و با بازهٔ ISO
  record("IN-interactions-iso", await armCall("IN-interactions-iso", E.realtorInteractions, { auth: true, query: { page: 1, limit: 100, startDate: ISO_START, endDate: ISO_END } }));
  // مسیر جایگزین معاملات — چرخهٔ قرارداد (صورت وضعیت)
  record("TO-trade-overviews", await armCall("TO-trade-overviews", E.tradeOverviewsList, { auth: true, query: { page: 1, limit: 10 } }));
}

/** فاز پیگیری — رفع ۴۰۰ تعاملات با آرایه‌های پارامتری جایگزین (تنها در صورت توکن زنده) */
async function stepFollowup(realtorId: string | null, lastTradePage: number | null): Promise<void> {
  if (realtorId) {
    // فقط realtor (شرط فعال‌سازی عین UI: (startDate && endDate) || realtor)
    record("IN2-realtor-only", await armCall("IN2-realtor-only", E.realtorInteractions, { auth: true, query: { page: 1, limit: 100, realtor: realtorId } }));
    // جلالی + صفحه‌بندی — اگر ۴۰۰ قالب تاریخی بود
    record("IN3-jalali", await armCall("IN3-jalali", E.realtorInteractions, { auth: true, query: { page: 1, limit: 100, startDate: JALALI_START, endDate: JALALI_END } }));
    // realtor + بازهٔ ISO + hasMatch (کامل‌ترین شکل فرم UI)
    record("IN4-full-form", await armCall("IN4-full-form", E.realtorInteractions, { auth: true, query: { page: 1, limit: 100, startDate: ISO_START, endDate: ISO_END, realtor: realtorId, hasMatch: "false" } }));
  }
  // عمق دادهٔ معاملات — آخرین صفحهٔ فهرست (قدیمی‌ترین رکورد قابل دسترس)
  if (lastTradePage && lastTradePage > 1 && lastTradePage <= 200) {
    record("TX-lastpage", await armCall("TX-lastpage", E.tradedCount, { auth: true, query: { page: lastTradePage, limit: 100, startDate: ISO_START, endDate: ISO_END } }));
  }
  // آزمون نهایی — دقیقاً همان بازه‌ای که دیمون sync می‌فرستد (buildReportDateRange)
  // مبدأ 2018-01-01 + مقصد نیمه‌شب امروز تهران؛ راستی‌آزمایی مسیر production بدون تغییر کد
  const tehranToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const syncEnd = new Date(`${tehranToday}T00:00:00+03:30`).toISOString();
  record("SYNC-exact-range", await armCall("SYNC-exact-range", E.tradedCount, {
    auth: true,
    query: { page: 1, limit: 100, startDate: "2018-01-01T00:00:00.000Z", endDate: syncEnd },
  }));
}

function verdictSummary(): void {
  const v = Object.fromEntries(verdicts.map((x) => [x.step, x]));
  const aTotal = v["A-total-iso"];
  const aList = v["A-list-iso"];
  const bTotal = v["B-total-jalali"];
  const dTotal = v["D-total-iso-realtor"];
  const inx = v["IN-interactions-iso"];
  const to = v["TO-trade-overviews"];

  console.log("\n================ نتیجهٔ D.1 — فرضیهٔ قالب تاریخ ================");
  let h1 = false, h2 = false;
  if (aTotal) {
    const aHas = (aTotal.total ?? 0) > 0 || aTotal.rows > 0;
    const bHas = bTotal ? (bTotal.total ?? 0) > 0 || bTotal.rows > 0 : false;
    if (aHas && !bHas) {
      h1 = true;
      console.log(`✓ قالب ISO داده برمی‌گرداند، جلالی نه → ریشهٔ totalCount=0 شب ۱ «قالب» بود (جلالی نادرست) — فرضیهٔ H1(قالب) تأیید`);
    } else if (bHas && !aHas) {
      console.log(`✓ قالب جلالی داده برمی‌گرداند → ARM جلالی می‌خواهد — فرضیهٔ H1(جلالی) تأیید`);
    } else if (!aHas && !bHas) {
      h2 = true;
      console.log(`✗ هیچ قالبی داده برنگرداند → قالب علت نیست؛ ریشه «scope» است (فرضیهٔ H2) — مسیر جایگزین D.2 اهمیت حیاتی دارد`);
    } else {
      console.log(`⚠ هر دو قالب داده برمی‌گردانند → قالب بی‌اثر؛ محدودیت بازه/حساب را بازبینی کن`);
    }
    if (aList) console.log(`  فهرست (traded-count): count=${aList.total ?? "—"} · rows=${aList.rows}`);
    if (dTotal) {
      const dHas = (dTotal.total ?? 0) > 0 || dTotal.rows > 0;
      console.log(`  per-realtor (D): ${dHas ? "داده دارد → مسیر realtor-محور فعال" : "خالی → فیلتر realtor هم چیزی باز نکرد"}`);
    }
  }
  console.log("\n================ نتیجهٔ D.2 — مسیر جایگزین ================");
  if (inx) {
    const ok = inx.status === 200 && ((inx.total ?? 0) > 0 || inx.rows > 0);
    console.log(`${inx.status === 200 ? "✓" : "✗"} realtor-interactions (بدون /list): HTTP ${inx.status} · count=${inx.total ?? "—"} · rows=${inx.rows} → کشف B.4 ${inx.status === 200 ? "تأیید زنده شد" : "رد شد"}`);
  }
  if (to) {
    const ok = (to.total ?? 0) > 0 || to.rows > 0;
    console.log(`${ok ? "✓" : "✗"} trade-overviews/list: HTTP ${to.status} · total=${to.total ?? "—"} · rows=${to.rows} → مسیر قرارداد ${ok ? "داده‌دار و قابل استفاده برای Bulk" : "برای این حساب خالی"}`);
  }
  log({ step: "verdict", verdicts, h1, h2 });
}

// ---------------------------------------------------------------------------
// اجرای اصلی
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--dry")) phase = "dry";
  else if (args.includes("--run")) phase = "run";
  else if (args.includes("--followup")) phase = "followup";
  else {
    console.error("استفاده: --dry | --run | --followup [--force-window]");
    process.exit(2);
  }
  forceWindow = args.includes("--force-window");
  if (phase !== "dry" && forceWindow) log({ event: "window-override", reason: "explicit", tehranHour: tehranHour() });
  if (phase !== "dry" && !forceWindow && !inWindow()) {
    log({ event: "refused", reason: "OUTSIDE_WINDOW", tehranHour: tehranHour() });
    console.error(`خارج از پنجرهٔ ۲۲:۰۰–۰۶:۰۰ تهران (ساعت فعلی: ${tehranHour()}:xx). اجرا رد شد.`);
    process.exit(3);
  }
  log({ event: "start", phase, base: phase === "dry" ? "(mock)" : ARM, getBudget: MAX_GET_TOTAL });

  let abortReason: string | null = null;
  try {
    await loadSessionToken();
    if (phase === "followup") {
      // فاز پیگیری — realtor از پروب؛ صفحهٔ آخر معاملات از نتیجهٔ A-list-iso (۷۲۸/۱۰۰ → ۸)
      const realtorId = await stepTokenProbe();
      const lastPage = Number(process.env.NIGHT2_LAST_TRADE_PAGE ?? 8);
      await stepFollowup(realtorId, lastPage);
      console.log("\n================ پیگیری — رفع ۴۰۰ تعاملات ================");
      for (const x of verdicts) {
        console.log(`  ${x.step}: HTTP ${x.status} · total=${x.total ?? "—"} · rows=${x.rows} · pages=${x.pages ?? "—"} · قدیمی‌ترین=${x.oldestDate ?? "—"}`);
      }
    } else {
      const realtorId = await stepTokenProbe();
      await stepD1(realtorId);
      await stepD2();
      verdictSummary();
    }
  } catch (e) {
    if (e instanceof ReconAbort) abortReason = e.reason;
    else {
      log({ event: "fatal", error: String(e) });
      abortReason = "UNEXPECTED_ERROR";
      console.error("خطای غیرمنتظره:", e);
    }
  } finally {
    const p50 = (arr: number[]) => arr.slice().sort((a, b) => a - b)[Math.floor(arr.length / 2)] ?? 0;
    log({ event: "end", abortReason, getCount, latencies: Object.fromEntries(Object.entries(latencies).map(([k, v]) => [k, { n: v.length, p50: p50(v) }])) });
    console.log(`\nپایان: GET×${getCount} · علت توقف: ${abortReason ?? "تکمیل طبیعی"}`);
    if (abortReason === "TOKEN_DEAD_401") {
      console.log("→ توکن ARM مرده است. طبق دستور شورا (D.1): صبر ۲۴ ساعت — بدون فشار به مالک، بدون پیامک جدید.");
    }
  }
}

await main();
