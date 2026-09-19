#!/usr/bin/env bun
/**
 * recon-night1.ts — اجرای ران‌بوک شب اول Recon (§۱۵-ب ARM-PM-RECONNAISSANCE.md)
 * -------------------------------------------------------------------------
 * حالت‌ها:
 *   --dry                              آزمون خشک با موک — صفر تماس شبکه (فاصله فشرده ۵۰ms)
 *   --request-otp <personnelCode>      فاز A: درخواست پیامک ورود (۱ GET) — نیازمند چراغ‌سبز مالک (قاعده ۱۰)
 *   --run <personnelCode> <otpCode>    فاز B: ورود + ۹ گام + teardown
 *   --use-session                      فاز B′: گام‌های ۱ تا ۸ با توکن ARM نشستِ فعال مالک از DB
 *                                     (بدون لاگین جدید — سقف پیامک دستور ملکا-فوری-۰۰۱ پر شده بود؛
 *                                     بدون logout — حفظ نشست فعال و sync؛ بدون refresh — ریسک چرخش توکن)
 *   --force-window                     لغو گارد پنجرهٔ ۲۲:۰۰–۰۶:۰۰ فقط با اختیار صریح مالک
 *                                     (دستور ملکا-فوری-۰۰۱ — شاهد window-override در لاگ)
 *
 * گاردها (عین docs/RECON-NIGHT1-RUNBOOK.md):
 *   پنجره ۲۲:۰۰–۰۶:۰۰ تهران (زنده) · سقف ۱۹۰ GET کل · سقف ۲۰۰ GET/endpoint
 *   فاصله ≥۱۵۰۰ms پایان‌پاسخ تا آغازِ بعدی · timeout ۳۰s · صفر retry خودکار
 *   ۴۲۹ → توقف فوری · 5xx×۲ پیاپی → توقف · ABORT فایل → مرگ در مرز بعدی
 *   teardown در finally — همیشه (logout + خلاصه)
 *
 * محرمانگی درجه ۱: صفر payload/توکن/PII در لاگ — فقط متادیتا
 * (تنها استثناهای مصوب §۱۵-ب: total/totalPages/یک تاریخ oldestDate)
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
const MIN_INTERVAL_MS = 1500; // کف فاصلهٔ طرح مصوب (زنده)
const DRY_INTERVAL_MS = 50; // فشرده‌سازی فقط برای آزمون خشک
const MAX_GET_TOTAL = 190; // توقف خودکار پیش از سقف ۲۰۰
const MAX_GET_PER_ENDPOINT = 200; // سقف §۱۵-ب
const TIMEOUT_MS = 30_000; // abort: خطای شبکه > ۳۰s
const CONSECUTIVE_5XX_ABORT = 2; // abort: 5xx دو بار پیاپی
const ABORT_FILE = "ABORT";

const cfg = getMelkApiConfig();
const ARM = cfg.armApiBase;
const ARM_PUBLIC = cfg.armPublicApiBase;

type Phase = "dry" | "request-otp" | "run" | "use-session" | "corrective" | "business" | "biz-agg";
let phase: Phase = "dry";
/** لغو پنجرهٔ شبانه با اختیار صریح مالک — دستور ملکا-فوری-۰۰۱ (۱۴۰۵/۰۶/۲۸)؛ شاهد در لاگ */
let forceWindow = false;
let token: string | null = null;
let refreshToken: string | null = null;
let loginAt = 0;

// --- شمارنده‌ها ---
let getCount = 0;
const getCountPerEndpoint: Record<string, number> = {};
let postCount = 0;
let lastRequestEnd = 0;
let consecutive5xx = 0;
const latencies: Record<string, number[]> = {};
const gaps: number[] = [];

class ReconAbort extends Error {
  constructor(public reason: string) {
    super(reason);
  }
}

// ---------------------------------------------------------------------------
// ابزارهای کمکی
// ---------------------------------------------------------------------------
function logFile(): string {
  return phase === "dry" ? "recon-night1.dry.jsonl" : "recon-night1.jsonl";
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
/** اثر انگشت «شکل» پاسخ — فقط نام کلیدها و نوع‌ها؛ هرگز مقدار */
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
/** برداشت متادیتای مجاز از پوشهٔ NestJS {statusCode,status,data,message} */
function harvest(body: unknown): {
  envelopeKeys: string[];
  dataKeys: string[];
  dataShapeHash: string;
  rowCount: number;
  total: number | null;
  totalPages: number | null;
  oldestDate: string | null;
  rowKeys: string[];
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
  // قدیمی‌ترین تاریخ در ردیف‌ها — تنها مقدار داده‌ای مصوب §۱۵-ب (گام ۲)
  let oldestDate: string | null = null;
  for (const r of rows) {
    for (const [k, v] of Object.entries(r)) {
      if (/date/i.test(k) && typeof v === "string" && v.length >= 8 && v.length <= 12) {
        if (oldestDate === null || v < oldestDate) oldestDate = v;
      }
    }
  }
  const env2 = env as Record<string, unknown>;
  const d2 = (data ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
  return {
    envelopeKeys: Object.keys(env).sort(),
    dataKeys: data !== null && typeof data === "object" && !Array.isArray(data) ? Object.keys(d2).sort().slice(0, 40) : [],
    dataShapeHash: shapeHash(body),
    rowCount: rows.length,
    total: num(env2.total) ?? num(env2.totalCount) ?? num(d2.total) ?? num(d2.totalCount),
    totalPages: num(env2.totalPages) ?? num(env2.totalPage) ?? num(d2.totalPages) ?? num(d2.totalPage),
    oldestDate,
    rowKeys: rowKeys.slice(0, 40),
  };
}

// ---------------------------------------------------------------------------
// گارد مشترک پیش از هر درخواست
// ---------------------------------------------------------------------------
async function gate(step: string, endpointKey: string): Promise<void> {
  if (existsSync(ABORT_FILE)) throw new ReconAbort("ABORT_REQUESTED");
  if (phase !== "dry" && !forceWindow && !inWindow()) throw new ReconAbort("OUTSIDE_WINDOW");
  if (getCount >= MAX_GET_TOTAL) throw new ReconAbort("GET_BUDGET_EXHAUSTED");
  if ((getCountPerEndpoint[endpointKey] ?? 0) >= MAX_GET_PER_ENDPOINT) throw new ReconAbort("PER_ENDPOINT_CAP");
  const interval = phase === "dry" ? DRY_INTERVAL_MS : MIN_INTERVAL_MS;
  const wait = lastRequestEnd + interval - Date.now();
  if (wait > 0) await Bun.sleep(wait);
}

// ---------------------------------------------------------------------------
// موک آزمون خشک — پوشه‌های NestJS با شکل واقعی (صفر تماس شبکه)
// ---------------------------------------------------------------------------
function mockFetch(url: string): Promise<Response> {
  const txRow = (contractDate: string): Record<string, unknown> => ({
    id: "x",
    contractDate,
    priceText: "۱٫۲۰۰٫۰۰۰٫۰۰۰",
    status: "done",
  });
  const envelope = (data: unknown, extra: Record<string, unknown> = {}): string =>
    JSON.stringify({ statusCode: 200, status: true, data, message: "ok", ...extra });
  let body = envelope({}, { total: 0, totalPages: 0 });
  if (url.includes("otp/login")) body = envelope({ token: "dry-token", refreshToken: "dry-refresh", user: { id: "u1" }, expiresInSeconds: 3600 });
  else if (url.includes("refresh-token")) body = envelope({ token: "dry-token-2" });
  else if (url.includes("logout")) body = envelope({});
  else if (url.includes("otp/")) body = envelope({ sent: true });
  else if (url.includes("traded-count-total"))
    body = envelope(
      [txRow("1404/01/15"), txRow("1398/07/02"), txRow(url.includes("1375") ? "1376/05/03" : "1405/02/10")],
      { total: 200000, totalPages: 2000 }
    );
  else if (url.includes("traded-count")) body = envelope({ count: 200000 });
  else if (url.includes("properties"))
    body = envelope(
      [{ _id: "p1", title: "t", price: 100, priceText: "t", pricePerMeter: 1, meterage: 80, unit: "تومان" }],
      { total: 50000, totalPages: 500 }
    );
  else if (url.includes("realtors/list")) body = envelope([{ id: "r1", fullName: "n", personnelCode: "c" }], { total: 120 });
  else if (url.includes("requests")) body = envelope([{ id: "q1", statusCode: "s" }], { total: 900 });
  else if (url.includes("visits/list")) body = envelope([{ id: "v1", checkTime: "2026-01-01" }], { total: 3000 });
  else if (url.includes("trade-overviews/list")) body = envelope([{ id: "c1", contractHolo: "h" }], { total: 4000 });
  else if (url.includes("realtor-interactions")) body = envelope([{ id: "i1", count: 2 }], { total: 500 });
  else if (url.includes("enums-persian")) body = envelope({ keys: ["a", "b"] });
  return Promise.resolve(new Response(body, { status: 200, headers: { "Content-Type": "application/json", Server: "nginx" } }));
}

// ---------------------------------------------------------------------------
// فراخوانی ARM با تمام گاردها — صفر retry (صفر فشار به مبدأ)
// ---------------------------------------------------------------------------
interface ArmResult {
  status: number;
  latencyMs: number;
  h: ReturnType<typeof harvest>;
  infraHeaders: Record<string, string>;
  retryAfter: string | null;
  body: Record<string, unknown>;
}
async function armCall2(
  step: string,
  base: string,
  path: string,
  init: { method?: "GET" | "POST"; query?: Record<string, string | number | undefined | null>; body?: unknown; auth?: boolean; extraHeaders?: Record<string, string> } = {}
): Promise<ArmResult> {
  const method = init.method ?? "GET";
  await gate(step, step); // pacing + ABORT + window + budget
  const url = `${base.replace(/\/$/, "")}/${path}${buildQuery(init.query)}`;
  const headers: Record<string, string> = { Accept: "application/json" }; // عین client.ts
  if (method === "POST") headers["Content-Type"] = "application/json";
  if (init.auth && token) headers.Authorization = `Bearer ${token}`;
  Object.assign(headers, init.extraHeaders ?? {});
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const t0 = Date.now();
  let res: Response;
  try {
    if (phase === "dry") res = await mockFetch(url);
    else res = await fetch(url, { method, headers, body: init.body !== undefined ? JSON.stringify(init.body) : undefined, signal: controller.signal, cache: "no-store" });
  } catch (e) {
    log({ step, event: "network-error", error: String(e) });
    throw new ReconAbort("NETWORK_TIMEOUT_OR_ERROR");
  } finally {
    clearTimeout(timer);
  }
  const latencyMs = Date.now() - t0;
  if (lastRequestEnd > 0) gaps.push(Date.now() - lastRequestEnd);
  lastRequestEnd = Date.now();
  if (method === "GET") {
    getCount++;
    getCountPerEndpoint[step] = (getCountPerEndpoint[step] ?? 0) + 1;
  } else postCount++;
  (latencies[step] ??= []).push(latencyMs);

  const retryAfter = res.headers.get("Retry-After");
  const infraHeaders: Record<string, string> = {};
  for (const key of ["server", "via", "x-cache", "x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset", "content-type", "content-security-policy-report-only"]) {
    const v = res.headers.get(key);
    if (v !== null) infraHeaders[key] = v;
  }
  const text = await res.text().catch(() => "");
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = {};
  }
  const h = harvest(body);

  if (res.status === 429) {
    log({ step, event: "rate-limited", retryAfter });
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

  log({
    step,
    // کد پرسنلی در مسیر OTP هرگز لاگ نمی‌شود (صفر PII — قاعدهٔ ۴ ران‌بوک)
    endpoint: step === "request-otp" ? path.replace(/\d{4,}/g, "<code>") : path,
    method,
    status: res.status,
    latencyMs,
    ...h,
    retryAfter,
    ...(step.startsWith("hdr-probe") ? { infraHeaders } : {}),
  });
  return { status: res.status, latencyMs, h, infraHeaders, retryAfter, body };
}

// ---------------------------------------------------------------------------
// گام‌ها — نگاشت عین §۱۵-ب به کلیدهای واقعی رجیستری
// ---------------------------------------------------------------------------
const E = MELK_ENDPOINTS.arm; // فقط از رجیستری — صفر hardcode مسیر
const pct = (arr: number[], p: number): number => {
  const s = [...arr].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : 0;
};

async function stepLogin(personnelCode: string, otpCode: string): Promise<void> {
  loginAt = Date.now();
  const r = await armCall2("login", ARM, E.verifyOtp, { method: "POST", body: { code: personnelCode, otpCode } });
  const data = (r.body.data ?? {}) as Record<string, unknown>;
  token = typeof data.token === "string" ? data.token : null;
  refreshToken = typeof data.refreshToken === "string" ? data.refreshToken : null;
  const expiresLike = Object.keys(data).filter((k) => /expir|ttl/i.test(k));
  log({ step: "login-inspect", tokenAcquired: token !== null, expiresLikeKeys: expiresLike, loginAt: new Date(loginAt).toISOString() }); // نه توکن — فقط بولین
  if (!token) throw new ReconAbort("LOGIN_NO_TOKEN");
}

async function stepCountAndDepth(): Promise<void> {
  await armCall2("s1-count", ARM, E.tradedCount, { auth: true }); // شمارش کل — بدون بازه
  await armCall2("s1-total", ARM, E.tradedTotal, { auth: true, query: { page: 1, limit: 100 } }); // total/totalPages
  await armCall2("s2-depth", ARM, E.tradedTotal, { auth: true, query: { page: 1, limit: 100, startDate: "1375/01/01" } }); // عمق ۲۵ ساله
}

async function stepPageSizeDeepLight(): Promise<void> {
  // گام ۴ — پذیرش limit بزرگ روی بازهٔ باریک (فقط ثبت رفتار)
  await armCall2("s4-limit500", ARM, E.tradedTotal, { auth: true, query: { page: 1, limit: 500, startDate: "1405/06/20", endDate: "1405/06/27" } });
  await armCall2("s4-limit1000", ARM, E.tradedTotal, { auth: true, query: { page: 1, limit: 1000, startDate: "1405/06/20", endDate: "1405/06/27" } });
  // گام ۵ — صفحهٔ عمیق
  await armCall2("s5-page50", ARM, E.tradedTotal, { auth: true, query: { page: 50, limit: 100 } });
  await armCall2("s5-page100", ARM, E.tradedTotal, { auth: true, query: { page: 100, limit: 100 } });
  // گام ۶ — ده صفحهٔ سبک متوالی (P50/P95)
  for (let i = 0; i < 10; i++) await armCall2("s6-light", ARM, E.tradedTotal, { auth: true, query: { page: 1, limit: 100 } });
  log({ step: "s6-summary", p50: pct(latencies["s6-light"] ?? [], 50), p95: pct(latencies["s6-light"] ?? [], 95), n: (latencies["s6-light"] ?? []).length });
}

async function stepHeaders(): Promise<void> {
  // گام ۷ — بازرسی هدر: یک GET عمومی + یک GET احراز‌شده
  await armCall2("hdr-probe-public", ARM_PUBLIC, MELK_ENDPOINTS.armPublic.enums, {});
  await armCall2("hdr-probe-authed", ARM, E.tradedCount, { auth: true });
}

async function stepShapes(): Promise<void> {
  // گام ۸ — فرمت آگهی: نام فیلدهای قیمت/متراژ/واحد
  const r = await armCall2("s8-property-shape", ARM, E.propertiesList, { auth: true, query: { page: 1, limit: 5 } });
  const candidates = r.h.rowKeys.filter((k) => /price|amount|قیمت|مبلغ|meter|متراژ|area|unit|واحد/i.test(k));
  log({ step: "s8-candidates", priceAreaUnitKeys: candidates });
  // گام ۸-ب — نمونه‌برداری شکل پنج خانوادهٔ داده (افزودهٔ مستند ران‌بوک)
  await armCall2("s8b-realtors", ARM, E.realtorsList, { auth: true, query: { page: 1, limit: 5 } });
  await armCall2("s8b-requests", ARM, E.requestsList, { auth: true, query: { page: 1, limit: 5 } });
  await armCall2("s8b-visits", ARM, E.visitsList, { auth: true, query: { page: 1, limit: 5 } });
  await armCall2("s8b-contracts", ARM, E.tradeOverviewsList, { auth: true, query: { page: 1, limit: 5 } });
  await armCall2("s8b-interactions", ARM, E.realtorInteractions, { auth: true, query: { page: 1, limit: 5 } });
}

// ---------------------------------------------------------------------------
// فاز B′ — بارگذاری توکن ARM از نشست فعال مالک (بدون پیامک، بدون لاگین جدید)
// زمینه: سقف ۲ پیامک دستور ملکا-فوری-۰۰۱ مصرف شد؛ توکن نشست فعال مالک (لاگین موفق
// داشبورد) با رمزگشایی درون‌فرآیندی استفاده می‌شود — هرگز در لاگ نوشته نمی‌شود.
// ---------------------------------------------------------------------------
async function loadSessionToken(): Promise<void> {
  const db = new PrismaClient();
  try {
    const sessions = await db.session.findMany({
      where: { revoked: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { armTokenEnc: true, createdAt: true, armUserType: true },
    });
    for (const s of sessions) {
      // نشست‌های master بدون توکن ARM مقدار خام کوتاه دارند (<۵۰ کاراکتر) — رد می‌شوند
      if (!s.armTokenEnc || s.armTokenEnc.length < 50) continue;
      const plain = decryptSecret(s.armTokenEnc);
      if (plain && plain !== "null" && plain.length > 20) {
        token = plain;
        loginAt = s.createdAt.getTime();
        log({
          step: "session-auth",
          source: "db-session",
          tokenAcquired: true,
          sessionAgeMin: Math.round((Date.now() - loginAt) / 60000),
          armUserType: s.armUserType,
        });
        return;
      }
    }
    throw new ReconAbort("NO_ACTIVE_ARM_SESSION");
  } finally {
    await db.$disconnect();
  }
}

// ---------------------------------------------------------------------------
// فاز اصلاحی — تکمیل گام ۱+۲ پس از کشف پروتکل (بازهٔ تاریخی اجباری)
// شاهد کشف: هر دو endpoint معاملات بدون بازه → 400 «لطفا یک بازه تاریخی انتخاب کنید»
// (همان خطای SyncState دیمون با attempts=7 — علت خالی بودن جدول‌های production)
// ---------------------------------------------------------------------------
async function stepCorrective(): Promise<void> {
  // گام ۱ (تکمیل): بازهٔ ماه جاری — total واقعی با پروتکل درست
  await armCall2("c1-month", ARM, E.tradedTotal, { auth: true, query: { page: 1, limit: 100, startDate: "1405/06/01", endDate: "1405/06/28" } });
  // گام ۲ (تکمیل): بازهٔ کامل ۲۵ ساله — total/totalPages + قدیمی‌ترین تاریخ صفحهٔ ۱
  const full = await armCall2("c2-fullrange", ARM, E.tradedTotal, { auth: true, query: { page: 1, limit: 100, startDate: "1375/01/01", endDate: "1405/06/28" } });
  const tp = full.h.totalPages ?? 0;
  if (tp > 1 && tp <= 200) {
    // نمونه‌برداری آخرین صفحه برای قدیمی‌ترین contractDate (حداکثر ۱ GET اضافه)
    await armCall2("c2b-lastpage", ARM, E.tradedTotal, { auth: true, query: { page: tp, limit: 100, startDate: "1375/01/01", endDate: "1405/06/28" } });
  }
  // آیا endpoint شمارش هم بازه می‌پذیرد؟
  await armCall2("c3-count-dated", ARM, E.tradedCount, { auth: true, query: { startDate: "1405/06/01", endDate: "1405/06/28" } });
}

/** ثبت شمارنده‌های تجمیعی کسب‌وکار (کلاسِ مصوب total/totalPages — بدون PII) */
function stepLogBizAggregates(d: Record<string, unknown>, status: number): void {
  const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
  const branches = Array.isArray(d.branches) ? d.branches.length : null;
  const created = typeof d.createdAt === "string" ? d.createdAt.slice(0, 10) : null;
  log({
    step: "biz-own-aggregates",
    status,
    customerCount: num(d.customerCount),
    propertyCount: num(d.propertyCount),
    branchCount: branches,
    businessCreatedAt: created,
    isActive: d.isActive === true,
  });
  console.log(`کسب‌وکار: فعال=${d.isActive === true} · مشتریان=${num(d.customerCount) ?? "—"} · ملک‌ها=${num(d.propertyCount) ?? "—"} · شعبه‌ها=${branches ?? "—"} · ایجاد=${created ?? "—"}`);
}

async function stepBizAggregates(): Promise<void> {
  const own = await armCall2("biz-own", ARM, E.ownBusiness, { auth: true });
  stepLogBizAggregates((own.body.data ?? {}) as Record<string, unknown>, own.status);
}

// ---------------------------------------------------------------------------
// فاز business — آزمون scope کسب‌وکار (چرا totalCount=۰؟)
// فرضیه: گزارش‌های معاملات به-ازای کاربر خالی‌اند؛ با businessId (کوئری یا هدر)
// شاید دامنهٔ کسب‌وکار باز شود. شناسه فقط در حافظه/کوئری — هرگز در لاگ (کوئری لاگ نمی‌شود)
// ---------------------------------------------------------------------------
async function stepBusinessScope(): Promise<void> {
  const own = await armCall2("biz-own", ARM, E.ownBusiness, { auth: true });
  const d = (own.body.data ?? {}) as Record<string, unknown>;
  const bizNested = d.businessId as Record<string, unknown> | undefined;
  const bizId =
    typeof d._id === "string" ? d._id :
    typeof d.id === "string" ? d.id :
    bizNested && (typeof bizNested._id === "string" || typeof bizNested.id === "string") ? String(bizNested._id ?? bizNested.id) :
    null;
  log({ step: "biz-own-keys", dataKeys: Object.keys(d).sort().slice(0, 40), businessIdFound: bizId !== null });
  stepLogBizAggregates(d, own.status);
  console.log(`ownBusiness: HTTP ${own.status} · کلید‌ها: ${Object.keys(d).sort().join(", ").slice(0, 200) || "—"}`);
  if (!bizId) {
    console.log("شناسهٔ کسب‌وکار در ownBusiness یافت نشد — آزمون scope ممکن نیست.");
    return;
  }
  // آزمون ۱: businessId به‌عنوان کوئری
  const q = await armCall2("biz-traded-query", ARM, E.tradedTotal, { auth: true, query: { page: 1, limit: 100, startDate: "1405/06/01", endDate: "1405/06/28", businessId: bizId } });
  console.log(`tradedTotal + businessId(کوئری): HTTP ${q.status} · totalCount=${q.h.total ?? "—"} · rows=${q.h.rowCount} · pages=${q.h.totalPages ?? "—"}`);
  // آزمون ۲ (فقط اگر آزمون ۱ خالی بود): businessId به‌عنوان هدر (کامنت client.ts)
  if ((q.h.total ?? 0) === 0 && q.h.rowCount === 0) {
    const h = await armCall2("biz-traded-header", ARM, E.tradedTotal, { auth: true, extraHeaders: { businessId: bizId }, query: { page: 1, limit: 100, startDate: "1405/06/01", endDate: "1405/06/28" } });
    console.log(`tradedTotal + businessId(هدر): HTTP ${h.status} · totalCount=${h.h.total ?? "—"} · rows=${h.h.rowCount} · pages=${h.h.totalPages ?? "—"}`);
  }
}

async function stepTtlProbe(): Promise<void> {
  // گام ۳ — آزمون refresh (پایان اجرا؛ حداکثر ۱ POST)
  if (!refreshToken) {
    log({ step: "s3-ttl", note: "no-refresh-token-in-login-response" });
    return;
  }
  const r = await armCall2("s3-refresh", ARM, E.refreshToken, { method: "POST", body: { refreshToken } });
  const data = (r.body.data ?? {}) as Record<string, unknown>;
  if (typeof data.token === "string") token = data.token; // توکن تازه برای logout
  log({ step: "s3-ttl", refreshStatus: r.status, rotated: typeof data.token === "string" });
}

// ---------------------------------------------------------------------------
// اجرای اصلی
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const t0 = Date.now();
  let abortReason: string | null = null;

  if (args.includes("--dry")) phase = "dry";
  else if (args.includes("--request-otp")) phase = "request-otp";
  else if (args.includes("--use-session")) phase = "use-session";
  else if (args.includes("--corrective")) phase = "corrective";
  else if (args.includes("--business")) phase = "business";
  else if (args.includes("--biz-agg")) phase = "biz-agg";
  else if (args.includes("--run")) phase = "run";
  else {
    console.error("استفاده: --dry | --request-otp <pc> | --run <pc> <otp> | --use-session | --force-window");
    process.exit(2);
  }
  forceWindow = args.includes("--force-window");
  if (phase !== "dry" && forceWindow) {
    // شاهد لغو پنجره — عین بند ۲ دستور مالک ملکا-فوری-۰۰۱
    log({ event: "window-override", reason: "owner-order", order: "ملکا-فوری-۰۰۱", rule: "3(§۱.۱۲)", tehranHour: tehranHour() });
  }
  if (phase !== "dry" && !forceWindow && !inWindow()) {
    log({ event: "refused", reason: "OUTSIDE_WINDOW", tehranHour: tehranHour() });
    console.error(`خارج از پنجرهٔ ۲۲:۰۰–۰۶:۰۰ تهران (ساعت فعلی: ${tehranHour()}:xx). اجرا رد شد — لغو پنجره فقط با اختیار صریح مالک + --force-window.`);
    process.exit(3);
  }
  log({ event: "start", phase, base: phase === "dry" ? "(mock)" : ARM, getBudget: MAX_GET_TOTAL, intervalMs: phase === "dry" ? DRY_INTERVAL_MS : MIN_INTERVAL_MS });

  try {
    if (phase === "request-otp") {
      // فاز A — ۱ GET؛ پیامک به موبایل ثبت‌شدهٔ مالک در ARM (قاعده ۱۰)
      const personnelCode = args[args.indexOf("--request-otp") + 1];
      if (!personnelCode) throw new Error("کد پرسنلی لازم است");
      const r = await armCall2("request-otp", ARM, E.requestOtp(personnelCode), {});
      if (r.status < 200 || r.status >= 300) {
        // معیار abort ران‌بوک §۲: status ≠ 2xx → توقف (پیامکی ارسال نشده است)
        log({ event: "otp-request-failed", status: r.status });
        console.error(`درخواست OTP با وضعیت HTTP ${r.status} رد شد — پیامکی ارسال نشده است.`);
        process.exitCode = 4;
        return;
      }
      console.log("درخواست OTP ثبت شد — پیامک به موبایل ثبت‌شدهٔ مالک در ARM می‌رود.");
      return;
    }
    if (phase === "biz-agg") {
      // میکرو-فاز: فقط شمارنده‌های تجمیعی کسب‌وکار (۱ GET)
      await loadSessionToken();
      await stepBizAggregates();
    } else if (phase === "business") {
      // فاز business — آزمون scope کسب‌وکار (علت totalCount=۰)
      await loadSessionToken();
      await stepBusinessScope();
    } else if (phase === "corrective") {
      // فاز اصلاحی — تکمیل گام ۱+۲ با پروتکل کشف‌شده (توکن نشست فعال؛ صفر POST)
      await loadSessionToken();
      await stepCorrective();
    } else if (phase === "use-session") {
      // فاز B′ — گام‌های ۱ تا ۸ با توکن نشست فعال مالک؛ صفر POST (بدون لاگین/refresh/logout)
      await loadSessionToken();
      await stepCountAndDepth(); // گام ۱ + ۲
      await stepPageSizeDeepLight(); // گام ۴ + ۵ + ۶
      await stepHeaders(); // گام ۷
      await stepShapes(); // گام ۸ + ۸-ب
      log({ step: "s3-ttl", note: "deferred: refresh probe would risk rotating the owner's active session token (background sync depends on it)" });
    } else if (phase === "run") {
      const personnelCode = args[args.indexOf("--run") + 1];
      const otpCode = args[args.indexOf("--run") + 2];
      if (!personnelCode || !otpCode) throw new Error("کد پرسنلی و کد پیامک لازم است");
      await stepLogin(personnelCode, otpCode); // گام TTL: ثبت زمان login
      await stepCountAndDepth(); // گام ۱ + ۲
      await stepPageSizeDeepLight(); // گام ۴ + ۵ + ۶
      await stepHeaders(); // گام ۷
      await stepShapes(); // گام ۸ + ۸-ب
      await stepTtlProbe(); // گام ۳ (refresh)
    } else {
      // آزمون خشک — همان زنجیرهٔ گام‌ها با mock (بدون login واقعی)
      token = "dry"; // شبیه‌سازی توکن برای مسیر auth
      refreshToken = "dry-refresh";
      loginAt = Date.now();
      await stepCountAndDepth();
      await stepPageSizeDeepLight();
      await stepHeaders();
      await stepShapes();
      await stepTtlProbe();
    }
  } catch (e) {
    if (e instanceof ReconAbort) abortReason = e.reason;
    else {
      log({ event: "fatal", error: String(e) });
      abortReason = "UNEXPECTED_ERROR";
    }
  } finally {
    // گام ۹ — teardown: همیشه، حتی هنگام abort (logout خارج از گارد ABORT)
    try {
      if (token && phase === "run") {
        const r = await fetch(`${ARM.replace(/\/$/, "")}/${E.logout}`, {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        log({ step: "logout", status: r.status });
      } else if (phase === "dry") {
        log({ step: "logout", status: 200, note: "mock" });
      } else if (phase === "use-session" || phase === "corrective" || phase === "business" || phase === "biz-agg") {
        // عدم خروج عمدی: توکن متعلق به نشست فعال مالک است — خروج آن، داشبورد و sync را می‌شکند
        log({ step: "logout", skipped: true, note: "owner-session-token: logout intentionally skipped to protect active dashboard session + background sync" });
      }
    } catch (e) {
      log({ step: "logout", ok: false, error: String(e) });
    }
    token = null;
    refreshToken = null;
    const minGap = gaps.length ? Math.min(...gaps) : null;
    log({
      event: "finally",
      abortReason,
      totalGets: getCount,
      totalPosts: postCount,
      perEndpoint: getCountPerEndpoint,
      minGapMs: minGap,
      durationMs: Date.now() - t0,
      tokenCleared: true,
    });
    console.log(`\n=== خلاصهٔ ${phase} === GET: ${getCount} · POST: ${postCount} · کف فاصلهٔ مشاهده‌شده: ${minGap}ms · abort: ${abortReason ?? "—"}`);
    if (phase !== "dry" && abortReason !== null) process.exitCode = 1; // اجرای ناتمام = خروج غیرصفر
    if (phase === "dry") {
      const pass = getCount === 25 && postCount === 1 && minGap !== null && minGap >= DRY_INTERVAL_MS - 5 && abortReason === null;
      console.log(pass ? "DRY-RUN PASS ✓ (۲۵ GET + ۱ POST refresh؛ گاردها فعال)" : `DRY-RUN CHECK: getCount=${getCount} postCount=${postCount} minGap=${minGap} abort=${abortReason}`);
      process.exit(pass ? 0 : 1);
    }
  }
}

main().catch((e) => {
  log({ event: "fatal-outer", error: String(e) });
  process.exit(1);
});
