/**
 * tx-info-enrichment.ts — غنی‌سازی معامله‌محور معاملات (BLOCK C — ملکا-شورا-۱۴۰۵-۰۱۷)
 * ------------------------------------------------------------------------------------
 * الگوی معامله‌محور (transaction-driven): برای هر معاملهٔ فاقد غنی‌سازی،
 * «trade-overviews/info/{txId}» صدا زده می‌شود و فیلدهای ناقص پر می‌شوند:
 *   نوع قرارداد · مبلغ · خریدار (نام+موبایل) · فروشنده (نام+موبایل) ·
 *   مشاوران و حق‌السهم · عنوان/آدرس ملک · وضعیت · تاریخ‌ها
 *
 * 🔒 قانون دادهٔ مقدس: جدول افزودنی TransactionEnrichment — مستقل از جاروی
 * sync اصلی (deleteMany+createMany روی TransactionRecord/ContractRecord هرگز
 * این جدول را لمس نمی‌کند). پاسخ خام عین منبع در rawInfoJson نگه داشته می‌شود.
 *
 * 🔁 checkpoint: پس از هر ۵۰ معامله ذخیره (SyncCheckpoint id="tx-info-enrich")؛
 * ادامه از نقطهٔ قطع — هرگز از صفر (عین الگوی arm-catalog §ازسرگیری).
 * صفر بارگذاری کل دیتاست: فقط معاملات فاقد غنی‌سازی پردازش می‌شوند.
 *
 * PN-081 (دستور مالک ۱۴۰۵/۰۸/۲۰ — بهینه‌سازی استخراج فهرست معاملات):
 *   · ترتیب صف جدیدترین‌اول — ریشهٔ «تاخیر بروزرسانی»: قدیمی‌ترین‌اول،
 *     رکوردهای تازه را پشت انباشت نگه می‌داشت.
 *   · جایگزین سهم سهام‌داران (shareholderList) وقتی مشاوران ثبت نشده‌اند —
 *     نام‌ها از دفترچهٔ ExpertRecord محلی (بدون فراخوانی شبکه).
 *   · resolveTransactionLinks — رفع گرهٔ تماس طرفین برای کدهای غیرمنطبقه.
 *   · refreshTransactionsInfo — چرخهٔ تازگی: بازخوانی کهنه‌ترین صورت‌وضعیت‌ها.
 */

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { MELK_ENDPOINTS } from "./endpoints";
import { getMelkApiConfig } from "./config";
import { armCall } from "./client";
import { extractPersonInfo } from "./adapters";
import type { MelkApiError } from "./types";

// ==========================================================================
// نگاشت پاسخ info → ردیف غنی‌سازی (لایه ۲) + خام (لایه ۱)
// ==========================================================================

interface InfoParty {
  fullName?: string | null;
  mobileNumber?: string | number | null;
}

/** نرمال‌سازی موبایل: 98914… → 0914… (فرمت نمایش/تماس ایران) */
export function normalizeMobile(v: string | number | null | undefined): string | null {
  if (v === null || v === undefined || v === "") return null;
  let s = String(v).replace(/[^\d+]/g, "");
  if (s.startsWith("+98")) s = "0" + s.slice(3);
  else if (s.startsWith("98") && s.length === 12) s = "0" + s.slice(2);
  else if (s.startsWith("9") && s.length === 10) s = "0" + s;
  return /^\d{10,11}$/.test(s) ? s : String(v);
}

function firstParty(parties: InfoParty[]): { name: string | null; mobile: string | null } {
  const valid = parties.filter((p): p is InfoParty => p !== null && typeof p === "object");
  const named = valid.find((p) => p.fullName?.trim());
  const mobile = valid.find((p) => p.mobileNumber !== null && p.mobileNumber !== undefined && p.mobileNumber !== "")?.mobileNumber;
  return {
    name: named?.fullName?.trim() ?? null,
    mobile: normalizeMobile(mobile),
  };
}

export interface TxInfoEnrichmentRow {
  txId: string;
  contractType: string | null;
  contractPrice: number | null;
  rawContractPrice: string | null;
  buyerName: string | null;
  buyerMobile: string | null;
  sellerName: string | null;
  sellerMobile: string | null;
  buyerListJson: string | null;
  sellerListJson: string | null;
  realtorSharesJson: string | null;
  propertyTitle: string | null;
  propertyAddress: string | null;
  status: string | null;
  documentDate: Date | null;
  deliveryDate: Date | null;
  businessId: string | null;
  comisionOfContract: number | null;
  taxOfContract: number | null;
}

/**
 * نگاشت پاسخ خام trade-overviews/info → ردیف غنی‌سازی (خالص — قابل تست).
 * PN-081: پارامتر اختیاری expertNameById — نگاشت شناسهٔ آبجکت ARM → نام کارشناس
 * (از ExpertRecord محلی) برای رفع نام «shareholderList» وقتی مشاوران ثبت نشده‌اند.
 */
export function mapTxInfoPayload(
  txId: string,
  payload: unknown,
  expertNameById?: ReadonlyMap<string, string> | null
): TxInfoEnrichmentRow {
  const d = (payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {}) as Record<string, unknown>;
  const str = (k: string): string | null => {
    const v = d[k];
    if (typeof v === "string") return v.trim() || null;
    if (typeof v === "number") return String(v);
    return null;
  };
  const num = (k: string): number | null => {
    const v = d[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = Number(v.replace(/[٬,،\s]/g, ""));
      if (Number.isFinite(n) && v.trim() !== "") return n;
    }
    return null;
  };
  const date = (k: string): Date | null => {
    const v = str(k);
    if (!v) return null;
    const dt = new Date(v);
    return Number.isNaN(dt.getTime()) ? null : dt;
  };
  const list = (k: string): InfoParty[] =>
    (Array.isArray(d[k]) ? (d[k] as unknown[]) : []).filter((x): x is InfoParty => x !== null && typeof x === "object");

  const buyers = list("buyerList");
  const sellers = list("sellerList");
  const buyer = firstParty(buyers);
  const seller = firstParty(sellers);

  // نوع قرارداد — object {label, value} یا رشته
  const ctRaw = d.contractType as Record<string, unknown> | string | null | undefined;
  const contractType =
    (ctRaw && typeof ctRaw === "object" && typeof ctRaw.label === "string" && ctRaw.label.trim()) ||
    (typeof ctRaw === "string" && ctRaw.trim()) ||
    null;

  const property = (d.property && typeof d.property === "object" ? d.property : {}) as Record<string, unknown>;

  // مشاوران — primary + secondary با نقش
  const shares: { name: string; unitPercent: number; confirmation: string; role: string }[] = [];
  for (const [key, role] of [["primaryRealtorList", "primary"], ["secondaryRealtorList", "secondary"]] as const) {
    const arr = Array.isArray(d[key]) ? (d[key] as Record<string, unknown>[]) : [];
    for (const r of arr) {
      const realtor = (r.realtor && typeof r.realtor === "object" ? r.realtor : {}) as Record<string, unknown>;
      const name = typeof realtor.fullName === "string" ? realtor.fullName.trim() : null;
      if (!name) continue;
      const unit = typeof r.realtorUnit === "number" ? r.realtorUnit : Number(r.realtorUnit ?? 0);
      shares.push({
        name,
        unitPercent: Number.isFinite(unit) ? unit : 0,
        confirmation: typeof r.confirmation === "string" ? r.confirmation : "wait",
        role,
      });
    }
  }

  // PN-081 — جایگزین سهم سهام‌داران: وقتی مشاوران (primary/secondary) در مبدأ ثبت
  // نشده‌اند ولی «shareholderList» واحد دارد، همان توزیع سطح سهام‌داران عین منبع
  // با نام‌های رفع‌شده از رجیستری کارشناسان محلی نمایش داده می‌شود.
  // شاهد داده: هر ۷۴۱ ردیف دارای مشاور، هم‌زمان shareholderList هم دارند (نمای دوگانهٔ
  // همان توزیع) → ادغام هرگز انجام نمی‌شود؛ فقط وقتی فهرست مشاوران خالی است.
  // وضعیت تأیید در مبدأ مشخص نیست → «unknown» (در تجمیع، «در انتظار» شمرده می‌شود — صادقانه).
  if (shares.length === 0 && expertNameById && expertNameById.size > 0) {
    const shl = Array.isArray(d.shareholderList) ? (d.shareholderList as Record<string, unknown>[]) : [];
    for (const s of shl) {
      if (!s || typeof s !== "object") continue;
      const shareholderId = typeof s.shareholder === "string" ? s.shareholder : null;
      if (!shareholderId) continue;
      const name = expertNameById.get(shareholderId);
      if (!name) continue;
      const unit = typeof s.shareholderUnit === "number" ? s.shareholderUnit : Number(s.shareholderUnit ?? 0);
      shares.push({
        name,
        unitPercent: Number.isFinite(unit) ? unit : 0,
        confirmation: "unknown",
        role: "shareholder",
      });
    }
  }

  const keepParty = (p: InfoParty) => ({ fullName: p.fullName ?? null, mobileNumber: p.mobileNumber ?? null });
  const buyerListJson = buyers.length > 0 ? JSON.stringify(buyers.map(keepParty)) : null;
  const sellerListJson = sellers.length > 0 ? JSON.stringify(sellers.map(keepParty)) : null;

  return {
    txId,
    contractType: contractType || null,
    // مبلغ قرارداد: فروش = contractPrice · اجاره = contractRent (منبع خود سامانه)
    contractPrice: num("contractPrice") ?? num("contractRent"),
    rawContractPrice: str("contractPrice") ?? str("contractRent"),
    buyerName: buyer.name,
    buyerMobile: buyer.mobile,
    sellerName: seller.name,
    sellerMobile: seller.mobile,
    buyerListJson: buyers.length > 0 ? JSON.stringify(buyers.map(keepParty)) : null,
    sellerListJson: sellers.length > 0 ? JSON.stringify(sellers.map(keepParty)) : null,
    realtorSharesJson: shares.length > 0 ? JSON.stringify(shares) : null,
    propertyTitle: (typeof property.title === "string" && property.title.trim()) || null,
    propertyAddress: (typeof property.address === "string" && property.address.trim()) || null,
    status: str("status"),
    documentDate: date("documentDate") ?? date("contractSanadDate"),
    deliveryDate: date("contractPropertyDate"),
    businessId: str("businessId"),
    comisionOfContract: num("comisionOfContract"),
    taxOfContract: num("taxOfContract"),
  };
}

// ==========================================================================
// نوشتن ردیف (upsert — افزایی؛ هرگز حذف نیست)
// ==========================================================================

/** تلاش مجدد نوشتن روی خطای گذرای SQLite (قفل هم‌زمان نویسنده‌ها — readonly 1032/_BUSY) */
async function withWriteRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let lastErr: unknown = null;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = String((e as Error)?.message ?? "");
      if (!/readonly|busy|locked|SQLITE_BUSY/i.test(msg)) throw e;
      await new Promise((r) => setTimeout(r, 1_500 * (i + 1)));
    }
  }
  throw lastErr;
}

async function upsertEnrichment(row: TxInfoEnrichmentRow, rawJson: string, batchId: string): Promise<void> {
  await withWriteRetry(() =>
    db.transactionEnrichment.upsert({
      where: { txId: row.txId },
      create: { ...row, rawInfoJson: rawJson, extractionBatchId: batchId, syncedAt: new Date() },
      update: { ...row, extractionBatchId: batchId, syncedAt: new Date() },
    })
  );
}

// ==========================================================================
// حلقهٔ غنی‌سازی معامله‌محور با checkpoint هر ۵۰ معامله
// ==========================================================================

export interface TxInfoSyncResult {
  processed: number;
  enriched: number;
  notFound: number;
  failed: number;
  remaining: number;
  checkpoint: { lastCompletedPage: number; totalPages: number; phase: string } | null;
  errorCode: string | null;
}

const CHECKPOINT_ID = "tx-info-enrich";
const BATCH = 50;

/**
 * غنی‌سازی معاملات فاقد اطلاعات — الگوی معامله‌محور BLOCK C:
 * فقط ردیف‌های بدون TransactionEnrichment · برش‌های ۵۰تایی · checkpoint پس از
 * هر برش کامل · توقف تمیز روی خطای احراز هویت (ادامه از همان نقطه در اجرای بعدی).
 */
export async function enrichTransactionsInfo(
  armToken: string,
  opts: { maxRows?: number; throttleMs?: number } = {}
): Promise<TxInfoSyncResult> {
  const { maxRows = 200, throttleMs = 450 } = opts;
  const cfg = getMelkApiConfig();
  const batchId = `p6514-${randomUUID().slice(0, 8)}`;

  // PN-081 — دفترچهٔ نام کارشناسان (شناسهٔ ARM → نام) برای رفع نام سهام‌داران
  const expertNameById = await loadExpertNameById();

  // صف معاملات فاقد غنی‌سازی — PN-081: جدیدترین‌اول (contractDate DESC).
  // ریشهٔ «تاخیر بروزرسانی»: ترتیب قبلی قدیمی‌ترین‌اول بود و رکوردهای تازه پشت
  // انباشت صف می‌ماندند؛ اکنون معاملهٔ جدید در نخستین تیک غنی می‌شود.
  const pending = await db.transactionRecord.findMany({
    where: { id: { notIn: (await db.transactionEnrichment.findMany({ select: { txId: true } })).map((e) => e.txId) } },
    orderBy: { contractDate: "desc" },
    select: { id: true },
  });

  const slice = pending.slice(0, maxRows);
  let enriched = 0;
  let notFound = 0;
  let failed = 0;
  let errorCode: string | null = null;

  for (let i = 0; i < slice.length; i += BATCH) {
    const chunk = slice.slice(i, i + BATCH);
    for (const tx of chunk) {
      try {
        const res = await armCall<unknown>({
          path: MELK_ENDPOINTS.arm.tradeOverviewInfo(tx.id),
          baseUrl: cfg.armApiBase,
          token: armToken,
          timeoutMs: cfg.timeoutMs,
          maxRetries: 1,
        });
        const row = mapTxInfoPayload(tx.id, res.data, expertNameById);
        await upsertEnrichment(row, JSON.stringify(res.data ?? {}), batchId);
        enriched += 1;
      } catch (e) {
        const err = e as MelkApiError;
        const code = err?.code ?? "";
        const msg = String(err?.message ?? "");
        // 404 سامانه (NestEnvelope با status:false) به OTP_INVALID با httpStatus=404 نگاشت می‌شود
        if (code === "NOT_FOUND" || err?.httpStatus === 404 || msg.includes("یافت نشد")) {
          // رکورد در مبدأ نیست — با ردیف خالی-مشخص ثبت می‌شود تا حلقه بی‌پایان نشود
          await upsertEnrichment(
            { txId: tx.id, contractType: null, contractPrice: null, rawContractPrice: null, buyerName: null, buyerMobile: null, sellerName: null, sellerMobile: null, buyerListJson: null, sellerListJson: null, realtorSharesJson: null, propertyTitle: null, propertyAddress: null, status: "NOT_FOUND_AT_SOURCE", documentDate: null, deliveryDate: null, businessId: null, comisionOfContract: null, taxOfContract: null },
            "{}",
            batchId
          );
          notFound += 1;
        } else if (code === "UNAUTHORIZED") {
          return finish({ processed: i, enriched, notFound, failed, remaining: pending.length - i, checkpoint: null, errorCode: "UNAUTHORIZED" });
        } else {
          failed += 1; // خطای گذرا — ردیف بعدی
        }
      }
      if (throttleMs > 0) await new Promise((r) => setTimeout(r, throttleMs));
    }
    // checkpoint پس از هر برش کامل ۵۰تایی — قانون: داده اول، سپس checkpoint
    const done = Math.min(i + BATCH, slice.length);
    await withWriteRetry(() =>
      db.syncCheckpoint.upsert({
        where: { id: CHECKPOINT_ID },
        create: {
          id: CHECKPOINT_ID, cycleId: batchId, pageSize: BATCH,
          lastCompletedPage: Math.floor(done / BATCH), totalPages: Math.ceil(pending.length / BATCH),
          totalAtSource: pending.length, phase: pending.length - done > 0 ? "in-progress" : "complete",
          ...(pending.length - done > 0 ? {} : { completedAt: new Date() }),
        },
        update: {
          cycleId: batchId, lastCompletedPage: Math.floor(done / BATCH),
          totalPages: Math.ceil(pending.length / BATCH), totalAtSource: pending.length,
          phase: pending.length - done > 0 ? "in-progress" : "complete",
          ...(pending.length - done > 0 ? {} : { completedAt: new Date() }),
        },
      })
    );
  }

  return finish({ processed: slice.length, enriched, notFound, failed, remaining: Math.max(0, pending.length - slice.length), checkpoint: null, errorCode: null });
}

function finish(r: TxInfoSyncResult): TxInfoSyncResult {
  return r;
}

// ==========================================================================
// PN-081 (دستور مالک ۱۴۰۵/۰۸/۲۰) — رفع گرهٔ کدهای غیرمنطبقه + چرخهٔ تازگی
// ==========================================================================

/** دفترچهٔ نام کارشناسان: شناسهٔ آبجکت ARM → نام (ExpertRecord محلی — بدون فراخوانی شبکه) */
async function loadExpertNameById(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const experts = await db.expertRecord.findMany({ select: { id: true, fullName: true } });
    for (const e of experts) {
      const name = e.fullName?.trim();
      if (name) map.set(e.id, name);
    }
  } catch {
    /* صرف‌نظر صادقانه — نگاشت خالی یعنی بدون جایگزین سهام‌داران */
  }
  return map;
}

/** شکل داخلی صف رفع گره (خروجی $queryRaw — نام‌ها عین ستون‌های SQL) */
interface LinkCandidateRow {
  id: string;
  propertyCode: string | null;
  requestCode: string | null;
  rawInfoJson: string | null;
}

export interface TxLinkResolveResult {
  candidates: number;
  resolved: number;
  notFound: number;
  noIds: number;
  failed: number;
  durationMs: number;
  lastError: string | null;
}

/**
 * PN-081 — رفع گرهٔ تماس طرفین برای معامله‌هایی که کد ملک/درخواستشان در
 * رجیستری محلی نیست (ریشهٔ خالی‌ماندن ستون‌های نام/موبایل مالک و درخواست‌دهنده):
 * شناسهٔ آبجکت ملک/درخواست از پاسخ خام خود معامله (rawInfoJson) برداشته می‌شود و
 * تماس مستقیماً از ARM رفع می‌شود:
 *   · مالک:  properties/owner/{propertyId}      (عین فاز B کاشی آگهی)
 *   · متقاضی: requests/applicant/{requestId}    (عین فاز B کاشی درخواست)
 * linkResolvedAt نشانهٔ تلاش است — رکورد حذف‌شده در مبدأ هرگز بی‌پایان تلاش نمی‌شود.
 */
export async function resolveTransactionLinks(
  armToken: string,
  opts: { maxRows?: number; throttleMs?: number } = {}
): Promise<TxLinkResolveResult> {
  const { maxRows = 24, throttleMs = 300 } = opts;
  const cfg = getMelkApiConfig();
  const t0 = Date.now();
  const result: TxLinkResolveResult = { candidates: 0, resolved: 0, notFound: 0, noIds: 0, failed: 0, durationMs: 0, lastError: null };

  // صف: معامله‌های دارای غنی‌سازی که هنوز تلاش رفع گره نشده‌اند و کدشان در رجیستری نیست
  const pending = (await db.$queryRaw`
    SELECT t.id, t.propertyCode, t.requestCode, e.rawInfoJson
    FROM TransactionRecord t
    JOIN TransactionEnrichment e ON e.txId = t.id
    WHERE e.linkResolvedAt IS NULL
      AND e.rawInfoJson IS NOT NULL
      AND (
        (t.propertyCode IS NOT NULL AND t.propertyCode != '' AND NOT EXISTS (SELECT 1 FROM PropertyRecord p WHERE p.propertyCode = t.propertyCode))
        OR (t.requestCode IS NOT NULL AND t.requestCode != '' AND NOT EXISTS (SELECT 1 FROM RequestRecord q WHERE q.requestCode = t.requestCode))
      )
    ORDER BY t.contractDate DESC
    LIMIT ${maxRows}
  `.catch(() => [] as LinkCandidateRow[])) as LinkCandidateRow[];

  result.candidates = pending.length;

  for (const row of pending) {
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(row.rawInfoJson ?? "{}") as Record<string, unknown>;
    } catch {
      payload = {};
    }
    const propertyId =
      payload.property && typeof payload.property === "object"
        ? String((payload.property as Record<string, unknown>)._id ?? "").trim() || null
        : null;
    const requestId = typeof payload.request === "string" ? payload.request.trim() || null : null;

    // هر طرف فقط وقتی هدف است که کدش در رجیستری محلی نباشد
    const propertyUnmatched =
      Boolean(row.propertyCode) && !(await db.propertyRecord.findFirst({ where: { propertyCode: row.propertyCode }, select: { propertyCode: true } }));
    const requestUnmatched =
      Boolean(row.requestCode) && !(await db.requestRecord.findFirst({ where: { requestCode: row.requestCode }, select: { requestCode: true } }));

    if (!propertyUnmatched && !requestUnmatched) {
      // وضعیت مرزی: در فاصلهٔ صف تا اجرا، رجیستری پر شده — حل‌شده
      await markLinkResolved(row.id, { linkStatus: "resolved" });
      result.resolved += 1;
      continue;
    }

    const patch: { linkOwnerName?: string; linkOwnerMobile?: string; linkRequesterName?: string; linkRequesterMobile?: string; linkStatus: string } = { linkStatus: "resolved" };
    let okSides = 0;
    let missingSides = 0;
    let noIdSides = 0;

    // ۱) مالک — properties/owner/{propertyId} (عین فاز B کاشی آگهی)
    if (propertyUnmatched) {
      if (propertyId) {
        try {
          const own = await armCall<unknown>({
            path: MELK_ENDPOINTS.arm.propertyOwner(propertyId),
            baseUrl: cfg.armApiBase,
            token: armToken,
            timeoutMs: cfg.timeoutMs,
            maxRetries: 1,
          });
          const person = extractPersonInfo(own.data);
          if (person?.fullName?.trim()) patch.linkOwnerName = person.fullName.trim();
          if (person?.mobile?.trim()) patch.linkOwnerMobile = normalizeMobile(person.mobile) ?? person.mobile.trim();
          if (patch.linkOwnerName || patch.linkOwnerMobile) okSides += 1;
          else missingSides += 1;
        } catch (e) {
          const err = e as MelkApiError;
          if (err?.code === "UNAUTHORIZED") {
            result.lastError = "UNAUTHORIZED";
            result.durationMs = Date.now() - t0;
            return result;
          }
          if (err?.httpStatus === 404 || err?.code === "NOT_FOUND") missingSides += 1;
          else {
            result.failed += 1;
            result.lastError = String(err?.message ?? e).slice(0, 160);
          }
        }
      } else {
        noIdSides += 1;
      }
    }

    // ۲) درخواست‌دهنده — requests/applicant/{requestId} (عین فاز B کاشی درخواست)
    if (requestUnmatched) {
      if (requestId) {
        try {
          const app = await armCall<unknown>({
            path: MELK_ENDPOINTS.arm.requestApplicant(requestId),
            baseUrl: cfg.armApiBase,
            token: armToken,
            timeoutMs: cfg.timeoutMs,
            maxRetries: 1,
          });
          const person = extractPersonInfo(app.data);
          if (person?.fullName?.trim()) patch.linkRequesterName = person.fullName.trim();
          if (person?.mobile?.trim()) patch.linkRequesterMobile = normalizeMobile(person.mobile) ?? person.mobile.trim();
          if (patch.linkRequesterName || patch.linkRequesterMobile) okSides += 1;
          else missingSides += 1;
        } catch (e) {
          const err = e as MelkApiError;
          if (err?.code === "UNAUTHORIZED") {
            result.lastError = "UNAUTHORIZED";
            result.durationMs = Date.now() - t0;
            return result;
          }
          if (err?.httpStatus === 404 || err?.code === "NOT_FOUND") missingSides += 1;
          else {
            result.failed += 1;
            result.lastError = String(err?.message ?? e).slice(0, 160);
          }
        }
      } else {
        noIdSides += 1;
      }
    }

    // وضعیت نهایی از برآیند طرفین
    patch.linkStatus =
      okSides === 0 && missingSides === 0
        ? "no_ids"
        : okSides === 0
          ? "not_found"
          : missingSides > 0 || noIdSides > 0
            ? "partial"
            : "resolved";

    await markLinkResolved(row.id, patch);
    if (patch.linkStatus === "no_ids") {
      result.noIds += 1;
      result.notFound += 1;
    } else if (patch.linkStatus === "not_found") result.notFound += 1;
    else result.resolved += 1;

    if (throttleMs > 0) await new Promise((r) => setTimeout(r, throttleMs));
  }

  result.durationMs = Date.now() - t0;
  return result;
}

async function markLinkResolved(
  txId: string,
  patch: { linkOwnerName?: string; linkOwnerMobile?: string; linkRequesterName?: string; linkRequesterMobile?: string; linkStatus: string }
): Promise<void> {
  await withWriteRetry(() =>
    db.transactionEnrichment.update({
      where: { txId },
      data: {
        ...(patch.linkOwnerName !== undefined ? { linkOwnerName: patch.linkOwnerName } : {}),
        ...(patch.linkOwnerMobile !== undefined ? { linkOwnerMobile: patch.linkOwnerMobile } : {}),
        ...(patch.linkRequesterName !== undefined ? { linkRequesterName: patch.linkRequesterName } : {}),
        ...(patch.linkRequesterMobile !== undefined ? { linkRequesterMobile: patch.linkRequesterMobile } : {}),
        linkStatus: patch.linkStatus,
        linkResolvedAt: new Date(),
      },
    })
  );
}

export interface TxInfoRefreshResult {
  processed: number;
  refreshed: number;
  failed: number;
  durationMs: number;
  lastError: string | null;
}

/**
 * PN-081 — چرخهٔ تازگی صورت‌وضعیت‌ها: بازخوانی دوره‌ای trade-overviews/info
 * برای ردیف‌های «کهنه‌ترین‌همگام‌سازی‌شده» (syncedAt صعودی). ریشهٔ «تاخیر در
 * بروزرسانی رکوردهای فاقد اطلاعات»: غنی‌سازی یک‌باره بود و هر به‌روزرسانیِ
 * بعدی در ARM (تایید حق‌السهم، افزودن مشاور، تغییر مبلغ) هرگز نمی‌رسید.
 * ردیف‌های NOT_FOUND_AT_SOURCE رد می‌شوند (در مبدأ نیستند).
 */
export async function refreshTransactionsInfo(
  armToken: string,
  opts: { maxRows?: number; throttleMs?: number } = {}
): Promise<TxInfoRefreshResult> {
  const { maxRows = 12, throttleMs = 400 } = opts;
  const cfg = getMelkApiConfig();
  const t0 = Date.now();
  const result: TxInfoRefreshResult = { processed: 0, refreshed: 0, failed: 0, durationMs: 0, lastError: null };

  const stale = await db.transactionEnrichment.findMany({
    where: { status: { not: "NOT_FOUND_AT_SOURCE" } },
    orderBy: { syncedAt: "asc" },
    take: maxRows,
    select: { txId: true },
  });

  const expertNameById = await loadExpertNameById();
  const batchId = `pn081-refresh-${randomUUID().slice(0, 8)}`;

  for (const { txId } of stale) {
    result.processed += 1;
    try {
      const res = await armCall<unknown>({
        path: MELK_ENDPOINTS.arm.tradeOverviewInfo(txId),
        baseUrl: cfg.armApiBase,
        token: armToken,
        timeoutMs: cfg.timeoutMs,
        maxRetries: 1,
      });
      const row = mapTxInfoPayload(txId, res.data, expertNameById);
      await upsertEnrichment(row, JSON.stringify(res.data ?? {}), batchId);
      result.refreshed += 1;
    } catch (e) {
      const err = e as MelkApiError;
      if (err?.code === "UNAUTHORIZED") {
        result.lastError = "UNAUTHORIZED";
        result.durationMs = Date.now() - t0;
        return result;
      }
      result.failed += 1;
      result.lastError = String(err?.message ?? e).slice(0, 160);
    }
    if (throttleMs > 0) await new Promise((r) => setTimeout(r, throttleMs));
  }

  result.durationMs = Date.now() - t0;
  return result;
}
