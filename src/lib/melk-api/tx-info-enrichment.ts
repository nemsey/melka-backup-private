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
 */

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { MELK_ENDPOINTS } from "./endpoints";
import { getMelkApiConfig } from "./config";
import { armCall } from "./client";
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

/** نگاشت پاسخ خام trade-overviews/info → ردیف غنی‌سازی (خالص — قابل تست) */
export function mapTxInfoPayload(txId: string, payload: unknown): TxInfoEnrichmentRow {
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

  // صف معاملات فاقد غنی‌سازی — مرتب بر تاریخ (قدیمی→جدید؛ پایدار برای ازسرگیری)
  const pending = await db.transactionRecord.findMany({
    where: { id: { notIn: (await db.transactionEnrichment.findMany({ select: { txId: true } })).map((e) => e.txId) } },
    orderBy: { contractDate: "asc" },
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
        const row = mapTxInfoPayload(tx.id, res.data);
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
