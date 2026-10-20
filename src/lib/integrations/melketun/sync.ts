/**
 * Melketun Sync Worker — PN-044/فاز ۳ (شورا-ن۰۸۸)
 * ---------------------------------------------------------------------------
 * Strategy (verdict فاز ۰ — SESSION_HTML_ADAPTER):
 *   · CRM = Laravel + Inertia (Vue) — MELKETUN_CRM · بدون REST عمومی (/api/* → 404)
 *   · Login واقعی: POST /login-store (فیلدهای دقیق Username/Password + هدر X-XSRF-TOKEN)
 *     — کشف‌شده از نقشهٔ مسیر Ziggy + خطای 422 (لاگ کامل: download/pn044/recon.log)
 *   · داده: صفحات احراز‌شده → JSON تمیز درون <div id="app" data-page="…"> (بدون DOM scraping)
 *   · Pagینیش: /Melketunfilingplus/{n} · /Potentials/{n} — هر صفحه ۱۰ رکورد، پایان = صفحهٔ خالی
 *
 * PN-045/فاز ۱ (شورا-ن۰۸۹) — فیلتر شهر تبریز در مبدأ:
 *   · کشف ۱.۱: فیلد city/branch_id در Filings/Potentials وجود ندارد (گزارش صادقانه،
 *     قانون ۱۷ دستور → fallback چندلایه)
 *   · معیار ۱ (اصلی): agency شامل واژهٔ تبریز (کشف ۱.۳: ۱۰۰٪ دادهٔ فعلی)
 *   · معیار ۲ (منطقه): area/areas شامل محله‌های شناخته‌شدهٔ تبریز
 *   · معیار ۳ (fallback): اگر هیچ‌کدام نبود → skip صادقانه + گزارش دلیل
 *   · dry-run ۱.۳: filings=49/49 تبریز · potentials=19/19 تبریز · صفر skip انتظار
 *
 * نگاشت (M1-M4):
 *   · filings (آگهی‌ها)    → PropertyRecord  · tenantId='melketun'
 *   · potentials (درخواست) → RequestRecord   · tenantId='melketun'
 *   · transactions → stub صادقانه [] (ماژول معادل در CRM قابل‌دسترس نیست)
 *   · experts       → stub صادقانه [] (specialists/valuations برای این حساب خالی است)
 *
 * Doctrine: no LLM, no cost, no auto_execute, sacred data (صفر حذف — فقط upsert افزودنی).
 * Secrets: upload/.runtime/melketun-secrets.json (Persistent Zone — هرگز در کد/گیت/لاگ).
 * Law 18: رمز هرگز در لاگ چاپ نمی‌شود.
 */

import fs from "fs";
import path from "path";
import { db } from "@/lib/db";
import { recordMelketunConnection } from "@/lib/integrations/melketun";

const SECRET_FILE = path.join(process.cwd(), "upload/.runtime/melketun-secrets.json");
const REQUEST_TIMEOUT_MS = 30_000;
const PAGE_DELAY_MS = 300; // ادب در برابر سرور (rate-limit risk #4)
const MAX_PAGES = 100; // سقف ایمن (فاز ۰: کل داده < ۴۹۰ صفحهٔ ۵۰)

/** کلید tenant ملکتون در جداول مشترک. تبریز = 'melk-tabriz' (P6.5-02 §۱۴ — دست‌نخورده). */
export const MELKETUN_TENANT_ID = "melketun" as const;

// ── PN-045/فاز ۱ — فیلتر شهر تبریز (در مبدأ، نه UI — اصل ۵ بخش ۲) ──────────
/** واژه‌های دالّ بر تبریز در نام آژانس/شعبه (کشف فاز ۱.۳: رضانژاد تبریز + آسمان تبریز) */
const TABRIZ_AGENCY_KEYWORDS = ["تبریز", "tabriz", "Tabriz", "TABRIZ"];
/** محله‌های شناخته‌شدهٔ تبریز (از توزیع واقعی فاز ۱.۳ + محله‌های اصلی شهر) */
const TABRIZ_NEIGHBORHOOD_KEYWORDS = [
  "مرزداران", "ولیعصر", "نصر", "شهرک باغمیشه", "باغمیشه", "الهیه", "رشدیه",
  "فرشته جنوبی", "فرشته شمالی", "ولی امر", "ائل‌گلی", "ائل گلی", "ایل گلی",
  "استانداری", "زعفرانیه", "میرداماد", "شهید رجایی", "گلشهر", "یاغچیان",
  "چایکنار", "خاوران", "زیتون", "قره‌آغاج", "قره آغاج",
  "باسمنج", "خسروشاه", "کوی سیلاب", "سیلاب", "طرنج", "بهشتی",
  "سیه‌رون", "سیهرون", "آبرسان", "مرجان", "نماز",
  "امیرخیز", "مهرگان",
];

/** آیا نام آژانس دالّ بر تبریز است؟ (معیار اصلی — ۱۰۰٪ دادهٔ فعلی) */
function isTabrizAgency(agency: unknown): boolean {
  const s = String(agency ?? "");
  return TABRIZ_AGENCY_KEYWORDS.some((k) => s.includes(k));
}

/** آیا متن منطقه/محله دالّ بر تبریز است؟ (معیار دوم — چندمحله‌ای با کاما) */
function isTabrizArea(area: unknown): boolean {
  const s = String(area ?? "");
  if (!s.trim()) return false;
  return TABRIZ_NEIGHBORHOOD_KEYWORDS.some((k) => s.includes(k));
}

/**
 * حکم تبریز بودن یک رکورد ملکتون — زنجیرهٔ fallback (قانون ۱۷ دستور):
 *   ۱. agency تبریز → TABRIZ
 *   ۲. area/areas تبریز → TABRIZ
 *   ۳. هر دو خالی/نامشخص → UNKNOWN (skip صادقانه + گزارش، نه حذف)
 * دادهٔ مقدس: رکورد skip‌شده هرگز حذف نمی‌شود — فقط وارد DB نمی‌شود.
 */
function tabrizVerdict(row: { agency?: unknown; area?: unknown }): "TABRIZ" | "UNKNOWN" {
  if (isTabrizAgency(row.agency)) return "TABRIZ";
  if (isTabrizArea(row.area)) return "TABRIZ";
  return "UNKNOWN";
}

interface MelketunSecrets {
  crm: { base_url: string; username: string; password: string };
  public: { base_url: string };
}

function loadSecrets(): MelketunSecrets {
  const raw = fs.readFileSync(SECRET_FILE, "utf8");
  return JSON.parse(raw) as MelketunSecrets;
}

// ── Cookie jar سبک (بدون وابستگی خارجی) ─────────────────────────────────────
class CookieJar {
  private jar = new Map<string, string>();

  absorb(res: Response) {
    // Node/undici: getSetCookie()؛ fallback: split هوشمند
    const rawList: string[] =
      typeof res.headers.getSetCookie === "function"
        ? res.headers.getSetCookie()
        : (res.headers.get("set-cookie") ?? "").split(/,(?=[^;]+=)/).filter(Boolean);
    for (const line of rawList) {
      const [pair] = line.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) this.jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  header(): string {
    return [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  decoded(name: string): string {
    const v = this.jar.get(name);
    if (!v) return "";
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  }
}

// ── استخراج JSON اینرسیا از HTML ────────────────────────────────────────────
function unescapeHtml(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** HTML صفحهٔ Inertia → props (JSON تمیز داخل data-page — بدون cheerio) */
function extractInertiaProps(html: string): Record<string, unknown> | null {
  const m = html.match(/<div[^>]*id="app"[^>]*data-page="([^"]*)"/);
  if (!m) return null;
  try {
    const page = JSON.parse(unescapeHtml(m[1])) as {
      props?: Record<string, unknown>;
      component?: string;
    };
    if (page.component?.startsWith("errors/")) return null; // 403/404 صفحهٔ خطاست
    return page.props ?? null;
  } catch {
    return null;
  }
}

// ── نرمال‌سازی اعداد فارسی/عربی → Float ────────────────────────────────────
function toFloat(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? raw : null;
  if (typeof raw !== "string") return null;
  const normalized = raw
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[,،]/g, "")
    .trim();
  if (!normalized || !/^\d+(\.\d+)?$/.test(normalized)) return null;
  const n = Number(normalized);
  return n > 0 ? n : null;
}

// ── لاگین نشست (فاز ۰ تأیید: POST /login-store) ────────────────────────────
async function crmLogin(baseUrl: string, username: string, password: string, errors: string[]): Promise<CookieJar> {
  const jar = new CookieJar();

  // ۱) GET /login → کوکی‌های XSRF-TOKEN + session
  const loginPage = await fetch(`${baseUrl}/login`, {
    redirect: "follow",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  jar.absorb(loginPage);
  if (!loginPage.ok) {
    errors.push(`GET /login → HTTP ${loginPage.status}`);
    return jar;
  }

  // ۲) POST /login-store (فیلدهای دقیق Username/Password + هدر X-XSRF-TOKEN)
  const body = new URLSearchParams({ Username: username, Password: password });
  const loginRes = await fetch(`${baseUrl}/login-store`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: jar.header(),
      "X-XSRF-TOKEN": jar.decoded("XSRF-TOKEN"),
      Accept: "application/json, text/html;q=0.9",
    },
    body,
    redirect: "manual", // 302 = موفق (Laravel ریدایرکت می‌کند)
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  jar.absorb(loginRes);

  if (!(loginRes.status === 302 || loginRes.status === 303)) {
    // پاسخ خطا (422/401) — بدون چاپ رمز
    errors.push(`POST /login-store → HTTP ${loginRes.status}`);
    return jar;
  }

  // ۳) راستی‌آزمایی احراز: GET /dashboard باید 200 باشد (302 = احراز نشده)
  const verify = await fetch(`${baseUrl}/dashboard`, {
    headers: { Cookie: jar.header() },
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (verify.status !== 200) {
    errors.push(`login verify: GET /dashboard → ${verify.status} (نه 200 — احراز هویت کامل نشد)`);
  }
  return jar;
}

// ── واکشی یک ماژول با تمام صفحات ────────────────────────────────────────────
interface InertiaRow {
  [key: string]: unknown;
}

async function fetchModule(
  baseUrl: string,
  jar: CookieJar,
  pagePath: (n: number) => string,
  propKey: string,
  errors: string[],
): Promise<InertiaRow[]> {
  const all: InertiaRow[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${baseUrl}${pagePath(page)}`;
    try {
      const res = await fetch(url, {
        headers: { Cookie: jar.header(), Accept: "text/html" },
        redirect: "manual",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (res.status !== 200) {
        if (page === 1) errors.push(`${pagePath(1)} → HTTP ${res.status}`);
        break;
      }
      const html = await res.text();
      const props = extractInertiaProps(html);
      if (!props) {
        if (page === 1) errors.push(`${pagePath(1)}: Inertia props not found`);
        break;
      }
      const bucket = props[propKey] as { data?: InertiaRow[] } | undefined;
      const rows = Array.isArray(bucket?.data) ? (bucket!.data as InertiaRow[]) : [];
      if (rows.length === 0) break; // صفحهٔ خالی = پایان داده
      all.push(...rows);
      if (rows.length < 10) break; // آخرین صفحهٔ ناقص
      await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
    } catch (e) {
      errors.push(`${pagePath(page)}: ${e instanceof Error ? e.message : String(e)}`);
      break;
    }
  }
  return all;
}

// ── نگاشت فیلدها ─────────────────────────────────────────────────────────────
interface FilingRow {
  id: string; full_id?: string; code?: string; saleType?: string; fileType?: string;
  area?: string; ownerName?: string; price?: string; prepayment?: string; rent?: string;
  assignedUser?: string; phone?: string; agency?: string; source?: string; status?: string;
  createdTime?: string; images?: string[];
}

interface PotentialRow {
  id: string; full_id?: string; code?: string; potentialName?: string; customerType?: string;
  price?: string | number; rent?: number; prepayment?: number; areas?: string;
  contactName?: string; agency?: string; assignedUser?: string; propertyType?: string;
  createdTime?: string; starred?: boolean; status?: string;
}

function filingToProperty(f: FilingRow, runId: string) {
  const saleType = f.saleType?.trim() || null;
  const fileType = f.fileType?.trim() || null;
  const area = f.area?.trim() || null;
  const details: { label: string; value: string }[] = [
    { label: "نوع ملک", value: fileType ?? "" },
    { label: "نوع معامله", value: saleType ?? "" },
    { label: "منطقه", value: area ?? "" },
    { label: "پیش‌پرداخت", value: String(f.prepayment ?? "") },
    { label: "اجاره", value: String(f.rent ?? "") },
    { label: "آژانس", value: f.agency ?? "" },
    { label: "منبع", value: f.source ?? "" },
    { label: "تلفن", value: f.phone ?? "" },
    { label: "زمان ثبت (ملکتون)", value: f.createdTime ?? "" },
    { label: "شناسهٔ کامل", value: f.full_id ?? f.id },
    { label: "تصاویر", value: `${(f.images ?? []).length} تصویر` },
  ].filter((d) => d.value !== "");

  return {
    id: f.id, // شناسهٔ vtiger ('71x…') — بدون تصادم با objectId های ARM
    propertyCode: f.code?.trim() || f.id, // 'ME8418' — بدون تصادم با کدهای عددی ARM
    title: [saleType, fileType, area && `در ${area}`].filter(Boolean).join(" ") || null,
    status: f.status?.trim() || null,
    ownerName: f.ownerName?.trim() || null,
    ownerMobile: f.phone?.replace(/\D/g, "") || null,
    areaName: area,
    propertyTypeName: fileType,
    tradeTypeName: saleType,
    price: toFloat(f.price),
    detailsJson: JSON.stringify(details),
    tenantId: MELKETUN_TENANT_ID,
    sourceRunId: runId,
    rawPrice: f.price ?? null,
    rawSourceVersion: "melketun-crm",
    extractedAt: new Date(),
    extractionBatchId: runId,
    normalizationVersion: "pn044-v1",
  };
}

function potentialToRequest(p: PotentialRow, runId: string) {
  const inputs = {
    customerType: p.customerType ?? null,
    rent: p.rent ?? null,
    prepayment: p.prepayment ?? null,
    price: p.price ?? null,
    agency: p.agency ?? null,
    assignedUser: p.assignedUser ?? null,
    starred: p.starred ?? null,
    createdTimeMelketun: p.createdTime ?? null,
    fullId: p.full_id ?? p.id,
  };
  const priceVal = toFloat(p.price);

  return {
    id: p.id, // شناسهٔ vtiger ('13x…') — بدون تصادم با cuid های ARM
    requestCode: p.code?.trim() || p.id, // 'POT4396' — بدون تصادم با کدهای عددی ARM
    source: "melketun-crm",
    customerName: p.contactName?.trim() || null,
    title: p.potentialName?.trim() || null,
    areaNamesJson: p.areas ? JSON.stringify([p.areas]) : null,
    propertyTypeName: p.propertyType?.trim() || null,
    tradeTypeName: p.customerType?.includes("اجاره") ? "رهن و اجاره" : p.customerType?.includes("خرید") ? "فروش" : null,
    priceFrom: priceVal,
    priceTo: priceVal,
    inputsJson: JSON.stringify(inputs),
    status: p.status?.trim() || "فعال",
    actorCode: "melketun-sync",
    actorName: p.agency?.trim() || "هماهنگ‌سازی ملکتون",
    tenantId: MELKETUN_TENANT_ID,
    sourceRunId: runId,
    rawCustomerName: p.contactName ?? null,
    rawSourceVersion: "melketun-crm",
    extractedAt: new Date(),
    extractionBatchId: runId,
    normalizationVersion: "pn044-v1",
    // spaceFrom/roomsFrom و… در دادهٔ ملکتون موجود نیست — null می‌مانند (صادقانه)
  };
}

// ── نتایج ─────────────────────────────────────────────────────────────────────
export interface SyncResult {
  ok: boolean;
  tenantId: typeof MELKETUN_TENANT_ID;
  fetched: { listings: number; requests: number; transactions: number; experts: number };
  upserted: { listings: number; requests: number; transactions: number; experts: number };
  /** PN-045/فاز ۱ — رکوردهای skip‌شده به دلیل فیلتر تبریز (گزارش صادقانه، قانون ۱۴) */
  skippedByCityFilter: { listings: number; requests: number };
  skippedSamples: { code: string; agency: string; area: string }[];
  errors: string[];
  durationMs: number;
}

/** stub صادقانه: ماژول معاملات در CRM ملکتون قابل‌دسترس نیست (کشف فاز ۰) */
async function fetchTransactions(): Promise<InertiaRow[]> {
  return [];
}
/** stub صادقانه: ماژول کارشناسان (specialists/valuations) برای این حساب خالی است */
async function fetchExperts(): Promise<InertiaRow[]> {
  return [];
}

/**
 * هماهنگ‌سازی کامل ملکتون → جداول مشترک (tenantId='melketun').
 * فقط upsert (افزودنی/ایدمپوتنت) — صفر حذف، صفر دست‌کاری دادهٔ تبریز (قانون ۶/۱۱).
 */
export async function syncMelketun(): Promise<SyncResult> {
  const t0 = Date.now();
  const result: SyncResult = {
    ok: false,
    tenantId: MELKETUN_TENANT_ID,
    fetched: { listings: 0, requests: 0, transactions: 0, experts: 0 },
    upserted: { listings: 0, requests: 0, transactions: 0, experts: 0 },
    skippedByCityFilter: { listings: 0, requests: 0 },
    skippedSamples: [],
    errors: [],
    durationMs: 0,
  };
  const runId = `pn044-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;

  try {
    const secrets = loadSecrets();
    const base = secrets.crm.base_url.replace(/\/$/, "");
    const { username, password } = secrets.crm;

    const jar = await crmLogin(base, username, password, result.errors);
    const loginFailed = result.errors.some((e) => e.startsWith("POST /login-store") || e.startsWith("login verify"));
    // PN-046/گام صفر — وضعیت اتصال پایدار (سوخت نوار وضعیت + تنظیمات) از هر sync واقعی
    recordMelketunConnection(!loginFailed, loginFailed ? result.errors.join(" · ") : `sync login OK (${username})`);
    if (loginFailed) {
      result.durationMs = Date.now() - t0;
      return result; // لاگین ناموفق — صفر sync (گزارش صادقانه، قانون ۱۴)
    }

    // واکشی ماژول‌ها (M1: filings · M2: potentials)
    const [filings, potentials] = await Promise.all([
      fetchModule(base, jar, (n) => `/Melketunfilingplus${n > 1 ? `/${n}` : ""}`, "filings", result.errors),
      fetchModule(base, jar, (n) => `/Potentials${n > 1 ? `/${n}` : ""}`, "potentials", result.errors),
    ]);
    result.fetched.listings = filings.length;
    result.fetched.requests = potentials.length;

    // upsert آگهی‌ها (PropertyRecord) — PN-045/فاز ۱: فقط تبریز در مبدأ
    for (const f of filings as unknown as FilingRow[]) {
      try {
        // فیلتر شهر (در مبدأ — نه UI): رکورد غیرتبریز وارد DB نمی‌شود (حذفی صورت نمی‌گیرد)
        if (tabrizVerdict({ agency: f.agency, area: f.area }) !== "TABRIZ") {
          result.skippedByCityFilter.listings++;
          if (result.skippedSamples.length < 10) {
            result.skippedSamples.push({ code: f.code ?? f.id, agency: String(f.agency ?? ""), area: String(f.area ?? "") });
          }
          continue;
        }
        const data = filingToProperty(f, runId);
        await db.propertyRecord.upsert({ where: { id: data.id }, create: data, update: data });
        result.upserted.listings++;
      } catch (e) {
        result.errors.push(`upsert filing ${f.id}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 160));
      }
    }

    // upsert درخواست‌ها (RequestRecord) — PN-045/فاز ۱: فقط تبریز در مبدأ
    for (const p of potentials as unknown as PotentialRow[]) {
      try {
        // فیلتر شهر (در مبدأ): area پتانسیل = areas چندمحله‌ای
        if (tabrizVerdict({ agency: p.agency, area: p.areas }) !== "TABRIZ") {
          result.skippedByCityFilter.requests++;
          if (result.skippedSamples.length < 10) {
            result.skippedSamples.push({ code: p.code ?? p.id, agency: String(p.agency ?? ""), area: String(p.areas ?? "") });
          }
          continue;
        }
        const data = potentialToRequest(p, runId);
        await db.requestRecord.upsert({ where: { id: data.id }, create: data, update: data });
        result.upserted.requests++;
      } catch (e) {
        result.errors.push(`upsert potential ${p.id}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 160));
      }
    }

    result.fetched.transactions = (await fetchTransactions()).length; // 0 — stub
    result.fetched.experts = (await fetchExperts()).length; // 0 — stub
    result.ok = result.errors.length === 0;
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : String(e));
  }

  result.durationMs = Date.now() - t0;
  return result;
}
