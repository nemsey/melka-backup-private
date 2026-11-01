/**
 * موتور استخراج عمیق ملکتون — PN-055 (قانون مالک: استخراج به هر شکل ممکن)
 * ---------------------------------------------------------------------------
 * کشف‌های PN-055 (زنده راستی‌آزمایی‌شده):
 *   · /Potentials/show/{id} → متقاضی (نام+موبایل+تلفن) + مالک مرتبط + relatedFilings
 *     (هر آگهی مرتبط: مالک واقعی + موبایل + مشاور + GPS)
 *   · /Melketunfilingplus/show/{id} → مالک واقعی (نام+موبایل+آدرس) + ۶۲ فیلد
 *   · RBAC واقعی: صفحات show فقط برای رکوردهای شعبهٔ خودمان (رضانژاد تبریز)
 *     کار می‌کنند؛ شعبه‌های دیگر ۵۰۰ می‌دهند → رکوردهای ۵۰۰ = «بسته» علامت
 *     می‌خورند و در چرخه‌های بعد دوباره امتحان نمی‌شوند (پایداری چرخهٔ ۶ساعته).
 *
 * دکترین ادغام (G1 · stripProtectedNulls): غنی‌سازی بدون نابودی —
 *   مقدار تازهٔ غیرخالی → نوشتن · مقدار تازهٔ خالی → حفظ موجود
 *
 * وضعیت در RefListCache (کلید melketun-deep-state): { doneIds, brokenIds }
 * سقف هر چرخه: ۱۵۰ درخواست + ۱۵۰ آگهی (تازه‌ترین‌ها اول — رکوردهای نو
 * در همان چرخهٔ ۶ساعتهٔ بعد پوشش داده می‌شوند).
 */

import fs from "fs";
import { db } from "@/lib/db";
import { crmLogin, type CookieJar } from "@/lib/integrations/melketun/sync";
import { recordMelketunConnection } from "@/lib/integrations/melketun";

const DEEP_STATE_KEY = "melketun-deep-state";
const PER_CYCLE_CAP = 150;
const REQUEST_TIMEOUT_MS = 20_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface DeepSyncResult {
  ok: boolean;
  crawledPotentials: number;
  crawledFilings: number;
  brokenPotentials: number;
  brokenFilings: number;
  requestsMobileFilled: number;
  filingsOwnerFilled: number;
  filingsFromRelated: number;
  /** PN-056 (نکتهٔ ۲ مالک): نوشتنی که نام/موبایل کارشناس را در ستون مالک/متقاضی مسدود کرد */
  consultantBlocked: number;
  errors: string[];
  durationMs: number;
}

// ── PN-056: گارد خلوص ستون مالک/متقاضی (نکتهٔ ۲ مالک) ─────────────────────
// نام/موبایل کارشناس هرگز در rawOwnerName/ownerMobile (ستون مالک) و
// rawCustomerName/customerMobile (ستون متقاضی) نوشته نمی‌شود.
// منابع حقیقت کارشناسان: melketun-users (کاربران CRM · قطعی) +
// ExpertRecord ملکتون (قطعی) + melketun-website-filers (فایلرِ هر کد — شاهد سطری).
interface ConsultantGuard {
  /** نام‌های قطعی کارشناس (users + ExpertRecord) */
  names: Set<string>;
  /** موبایل‌های قطعی کارشناس */
  mobiles: Set<string>;
  /** کد آگهی → نام فایلر (شاهد سطری) */
  filerByCode: Map<string, string>;
  /** کد آگهی → موبایل فایلر (شاهد سطری) */
  filerMobileByCode: Map<string, string>;
}

const normId = (s: unknown): string =>
  String(s ?? "").replace(/[\s\u200c\u200f\u200e]+/g, " ").trim();

const last10 = (s: unknown): string => {
  const d = String(s ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : "";
};

export { normId, last10 };

async function loadConsultantGuard(): Promise<ConsultantGuard> {
  const guard: ConsultantGuard = { names: new Set(), mobiles: new Set(), filerByCode: new Map(), filerMobileByCode: new Map() };
  const usersRow = await db.refListCache.findUnique({ where: { key: "melketun-users" } }).catch(() => null);
  if (usersRow?.dataJson) {
    try {
      const users = JSON.parse(usersRow.dataJson) as Record<string, { name?: unknown; mobile?: unknown }>;
      for (const u of Object.values(users)) {
        const n = normId(u?.name);
        const m = last10(u?.mobile);
        if (n && n.length >= 3) guard.names.add(n);
        if (m) guard.mobiles.add(m);
      }
    } catch { /* کش ناقص — گارد با آنچه هست کار می‌کند */ }
  }
  const filersRow = await db.refListCache.findUnique({ where: { key: "melketun-website-filers" } }).catch(() => null);
  if (filersRow?.dataJson) {
    try {
      const filers = JSON.parse(filersRow.dataJson) as Record<string, { filerName?: unknown; filerMobile?: unknown }>;
      for (const [code, u] of Object.entries(filers)) {
        const c = code.replace(/^["']+|["']+$/g, "").trim();
        const n = normId(u?.filerName);
        const m = last10(u?.filerMobile);
        if (c && n) guard.filerByCode.set(c, n);
        if (c && m) guard.filerMobileByCode.set(c, m);
      }
    } catch { /* کش ناقص */ }
  }
  // PN-056 — کارشناسان ثبت‌کنندهٔ وب‌سایت (آرایهٔ [نام، موبایل] — قطعی: شاهد دوبعدی درونی)
  const ownersRow = await db.refListCache.findUnique({ where: { key: "melketun-website-owners" } }).catch(() => null);
  if (ownersRow?.dataJson) {
    try {
      const owners = JSON.parse(ownersRow.dataJson) as [string, string][];
      for (const o of owners) {
        const n = normId(o?.[0]);
        const m = last10(o?.[1]);
        if (n && n.length >= 3) guard.names.add(n);
        if (m) guard.mobiles.add(m);
      }
    } catch { /* کش ناقص */ }
  }
  const experts = await db.expertRecord.findMany({
    where: { tenantId: "melketun" },
    select: { fullName: true, rawFullName: true, mobile: true, rawMobile: true },
  }).catch(() => []);
  for (const e of experts) {
    const n = normId(e.rawFullName ?? e.fullName);
    const m = last10(e.rawMobile ?? e.mobile);
    if (n && n.length >= 3) guard.names.add(n);
    if (m) guard.mobiles.add(m);
  }
  return guard;
}

/** آیا این مقدار مالک/متقاضی، کارشناس است؟ (شاهد سطری اول؛ سپس رجیستری قطعی — نکتهٔ ۲ مالک) */
export function isConsultantIdentity(
  guard: ConsultantGuard,
  name: string,
  mobile: string,
  propertyCode?: string | null,
): boolean {
  const n = normId(name);
  const m = last10(mobile);
  const c = String(propertyCode ?? "").replace(/^["']+|["']+$/g, "").trim();
  if (c) {
    if (n && n === guard.filerByCode.get(c)) return true; // فایلرِ همین آگهی
    if (m && m === guard.filerMobileByCode.get(c)) return true;
  }
  if (n && guard.names.has(n)) return true; // نامِ قطعی کارشناس — سخت‌گیرانه (نکتهٔ ۲)
  if (m && guard.mobiles.has(m)) return true; // موبایلِ قطعی کارشناس
  return false;
}

interface DeepState {
  doneIds: string[];
  brokenIds: string[];
  updatedAt?: string;
}

interface SecretShape {
  crm: { base_url: string; username: string; password: string };
  public: { base_url: string };
}

function loadSecrets(): SecretShape {
  // همان مسیر رسمی ماژول اصلی — منبع یگانهٔ رازها
  return JSON.parse(fs.readFileSync("upload/.runtime/melketun-secrets.json", "utf8")) as SecretShape;
}

function extractProps(html: string): Record<string, unknown> | null {
  const m = html.match(/data-page="([^"]+)"/);
  if (!m) return null;
  try {
    const decoded = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#039;/g, "'");
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const val = (o: Record<string, unknown>, k: string): string => {
  const v = o[k] as { value?: unknown } | undefined;
  if (v && typeof v === "object" && "value" in v) return String((v as { value: unknown }).value ?? "").trim();
  return "";
};

interface FetchErr extends Error { kind: "http" | "net" | "props"; status?: number }

async function fetchShow(base: string, kind: "potential" | "filing", id: string, jar: CookieJar): Promise<Record<string, unknown>> {
  const path = kind === "potential" ? `/Potentials/show/${id}` : `/Melketunfilingplus/show/${id}`;
  const res = await fetch(`${base}${path}`, {
    headers: { Cookie: jar.header() },
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (res.status !== 200) {
    const e = new Error(`HTTP ${res.status}`) as FetchErr;
    e.kind = "http"; e.status = res.status;
    throw e;
  }
  const page = extractProps(await res.text());
  if (!page) {
    const e = new Error("no-props") as FetchErr;
    e.kind = "props";
    throw e;
  }
  return page.props as Record<string, unknown>;
}

async function loadState(): Promise<DeepState> {
  const row = await db.refListCache.findUnique({ where: { key: DEEP_STATE_KEY } });
  if (!row) return { doneIds: [], brokenIds: [] };
  try {
    const s = JSON.parse(row.dataJson) as DeepState;
    return { doneIds: s.doneIds ?? [], brokenIds: s.brokenIds ?? [] };
  } catch {
    return { doneIds: [], brokenIds: [] };
  }
}

async function saveState(state: DeepState): Promise<void> {
  // هرس: نگه‌داشتن حداکثر ۲۰۰۰۰ شناسهٔ اخیر (جلوگیری از رشد بی‌پایان)
  if (state.doneIds.length > 20_000) state.doneIds = state.doneIds.slice(-20_000);
  if (state.brokenIds.length > 20_000) state.brokenIds = state.brokenIds.slice(-20_000);
  state.updatedAt = new Date().toISOString();
  await db.refListCache.upsert({
    where: { key: DEEP_STATE_KEY },
    create: { key: DEEP_STATE_KEY, dataJson: JSON.stringify(state) },
    update: { dataJson: JSON.stringify(state) },
  });
}

export async function syncMelketunDeep(): Promise<DeepSyncResult> {
  const t0 = Date.now();
  const result: DeepSyncResult = {
    ok: true, crawledPotentials: 0, crawledFilings: 0, brokenPotentials: 0, brokenFilings: 0,
    requestsMobileFilled: 0, filingsOwnerFilled: 0, filingsFromRelated: 0, consultantBlocked: 0, errors: [], durationMs: 0,
  };

  let secrets: SecretShape;
  try {
    secrets = loadSecrets();
  } catch (e) {
    result.ok = false;
    result.errors.push(`secrets: ${String(e).slice(0, 80)}`);
    result.durationMs = Date.now() - t0;
    return result;
  }
  const base = secrets.crm.base_url.replace(/\/$/, "");

  const state = await loadState();
  const doneSet = new Set(state.doneIds);
  const brokenSet = new Set(state.brokenIds);

  // PN-056 — گارد خلوص ستون مالک/متقاضی (نکتهٔ ۲ مالک): یک‌بار در هر چرخه بارگذاری
  const guard = await loadConsultantGuard();

  // انتخاب صف: تازه‌ترین رکوردهای (سقف درشت) — فیلتر خزش‌نشده در حافظه
  const [potentials, filings] = await Promise.all([
    db.requestRecord.findMany({
      where: { tenantId: "melketun" },
      orderBy: { createdAt: "desc" },
      take: 2000,
      select: { id: true },
    }),
    db.propertyRecord.findMany({
      where: { tenantId: "melketun" },
      orderBy: { createdAt: "desc" },
      take: 2000,
      select: { id: true },
    }),
  ]).catch(() => [[], []] as [{ id: string }[], { id: string }[]]);

  // فیلتر در حافظه (notIn بزرگ در SQLite پرهزینه است — فیلتر نرم پس از fetch)
  const potQueue = potentials.map((p) => p.id).filter((id) => !doneSet.has(id) && !brokenSet.has(id)).slice(0, PER_CYCLE_CAP);
  const filQueue = filings.map((f) => f.id).filter((id) => !doneSet.has(id) && !brokenSet.has(id)).slice(0, PER_CYCLE_CAP);

  if (!potQueue.length && !filQueue.length) {
    result.durationMs = Date.now() - t0;
    return result; // چیز تازه‌ای برای خزش نیست
  }

  const errors: string[] = [];
  let jar = await crmLogin(base, secrets.crm.username, secrets.crm.password, errors);
  if (errors.length || !jar) {
    result.ok = false;
    result.errors.push(...errors.map((e) => e.slice(0, 80)));
    recordMelketunConnection(false, `deep: ${errors[0]?.slice(0, 60) ?? "login failed"}`);
    result.durationMs = Date.now() - t0;
    return result;
  }

  // ─── خزش درخواست‌ها ───
  let sessionAge = 0;
  for (const pid of potQueue) {
    try {
      const props = await fetchShow(base, "potential", pid, jar);
      sessionAge++;
      const pot = (props.potential ?? {}) as Record<string, unknown>;
      const rf = (props.relatedFilings ?? []) as Record<string, unknown>[];
      const customerName = val(pot, "cf_pcf_snf_2638") || val(pot, "cf_2165");
      const customerMobile = val(pot, "cf_pcf_irm_1179").replace(/\D/g, "");

      // PN-056 — گارد نکتهٔ ۲: نام/موبایل کارشناس هرگز در ستون متقاضی نمی‌نشیند
      const applicantIsConsultant = isConsultantIdentity(guard, customerName, customerMobile);
      if (applicantIsConsultant) result.consultantBlocked++;

      // ادغام متقاضی (غنی‌سازی بدون نابودی)
      const data: Record<string, string> = {};
      if (customerName && !applicantIsConsultant) data.customerName = customerName;
      if (customerMobile.length >= 10 && !applicantIsConsultant) data.customerMobile = customerMobile;
      if (Object.keys(data).length) {
        await db.requestRecord.update({ where: { id: pid }, data });
        if (data.customerMobile) result.requestsMobileFilled++;
      }

      // ادغام مالک از relatedFilings (هر آگهی مرتبط)
      // ⚠️ نگاشت ستون‌ها: rawOwnerName = مالک واقعی · ownerName = کارشناس
      // (لایهٔ repository: realtorName←ownerName · ownerName←rawOwnerName)
      for (const f of rf) {
        const fid = String(f.id ?? "");
        const ownerName = String(f.ownerName ?? "").trim();
        const phone = String(f.phone ?? "").replace(/\D/g, "");
        if (!fid || (!ownerName && phone.length < 10)) continue;
        // PN-056 — شاهد سطری: کد فایلینگ + مشاورِ همان رکورد مرتبط
        const rfCode = String(f.filingNo ?? "").replace(/^["']+|["']+$/g, "").trim();
        const rfConsultant = String(f.consultantName ?? "").trim();
        const rowScopeHit = (ownerName && rfConsultant && ownerName === rfConsultant)
          || isConsultantIdentity(guard, ownerName, phone, rfCode);
        if (rowScopeHit) { result.consultantBlocked++; continue; }
        try {
          const existing = await db.propertyRecord.findUnique({ where: { id: fid }, select: { rawOwnerName: true, ownerMobile: true, tenantId: true } });
          if (!existing || existing.tenantId !== "melketun") continue;
          const pdata: Record<string, string> = {};
          if (!existing.rawOwnerName && ownerName) pdata.rawOwnerName = ownerName;
          if (!existing.ownerMobile && phone.length >= 10) pdata.ownerMobile = phone;
          if (Object.keys(pdata).length) {
            await db.propertyRecord.update({ where: { id: fid }, data: pdata });
            result.filingsFromRelated++;
          }
        } catch { /* رکورد مرتبط نباید چرخه را بشکند */ }
      }

      state.doneIds.push(pid);
      result.crawledPotentials++;
    } catch (e) {
      const fe = e as FetchErr;
      if (fe.kind === "http" && (fe.status === 500 || fe.status === 404)) {
        state.brokenIds.push(pid);
        result.brokenPotentials++;
      } else if (fe.kind === "http" && ((fe.status ?? 0) === 401 || (fe.status ?? 0) === 403 || (fe.status ?? 0) === 419 || ((fe.status ?? 0) >= 300 && (fe.status ?? 0) < 400))) {
        // نشست منقضی — ورود تازه و ادامه
        const err2: string[] = [];
        const fresh = await crmLogin(base, secrets.crm.username, secrets.crm.password, err2);
        if (!err2.length) { jar = fresh; }
        state.doneIds.push(pid); // رها در این چرخه — چرخهٔ بعد دوباره
      } else {
        if (result.errors.length < 10) result.errors.push(`${pid}: ${String(e).slice(0, 60)}`);
        state.doneIds.push(pid); // خطای گذرا — چرخهٔ بعد دوباره
      }
    }
    if (sessionAge >= 350) {
      const err2: string[] = [];
      const fresh = await crmLogin(base, secrets.crm.username, secrets.crm.password, err2);
      if (!err2.length) { jar = fresh; }
      sessionAge = 0;
    }
    await sleep(550);
  }

  // ─── خزش آگهی‌ها ───
  for (const fid of filQueue) {
    try {
      const props = await fetchShow(base, "filing", fid, jar);
      sessionAge++;
      const f = (props.filing ?? {}) as Record<string, unknown>;
      const ownerName = [val(f, "cf_pcf_snf_1702"), val(f, "cf_1704")].filter(Boolean).join(" ").trim();
      const ownerMobile = val(f, "cf_pcf_irm_1706").replace(/\D/g, "");
      const ownerAddress = val(f, "cf_1685");

      const existing = await db.propertyRecord.findUnique({ where: { id: fid }, select: { address: true, propertyCode: true } });
      // PN-056 — گارد نکتهٔ ۲: نام/موبایل کارشناس هرگز در ستون مالک نمی‌نشیند
      // (شاهد سطری: فایلرِ همین کد؛ سپس رجیستری قطعی users/ExpertRecord)
      const ownerIsConsultant = isConsultantIdentity(guard, ownerName, ownerMobile, existing?.propertyCode);
      if (ownerIsConsultant) result.consultantBlocked++;

      const data: Record<string, string> = {};
      // ⚠️ نگاشت ستون‌ها: rawOwnerName = مالک واقعی · ownerName = کارشناس (دست‌نخورده)
      if (ownerName && !ownerIsConsultant) data.rawOwnerName = ownerName;
      if (ownerMobile.length >= 10 && !ownerIsConsultant) data.ownerMobile = ownerMobile;
      if (ownerAddress && !existing?.address) data.address = ownerAddress;
      if (Object.keys(data).length) {
        await db.propertyRecord.update({ where: { id: fid }, data });
        if (!ownerIsConsultant && (ownerName || ownerMobile.length >= 10)) result.filingsOwnerFilled++;
      }
      state.doneIds.push(fid);
      result.crawledFilings++;
    } catch (e) {
      const fe = e as FetchErr;
      if (fe.kind === "http" && (fe.status === 500 || fe.status === 404)) {
        state.brokenIds.push(fid);
        result.brokenFilings++;
      } else {
        state.doneIds.push(fid);
        if (result.errors.length < 10) result.errors.push(`${fid}: ${String(e).slice(0, 60)}`);
      }
    }
    if (sessionAge >= 350) {
      const err2: string[] = [];
      const fresh = await crmLogin(base, secrets.crm.username, secrets.crm.password, err2);
      if (!err2.length) { jar = fresh; }
      sessionAge = 0;
    }
    await sleep(550);
  }

  await saveState(state);
  result.durationMs = Date.now() - t0;
  return result;
}
