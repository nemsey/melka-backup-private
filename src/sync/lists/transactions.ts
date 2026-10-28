/**
 * transactions.ts — PN-051 · فرمان ۶ — M9: فهرست مستقل معاملات (۱۰۰٪ ستون‌ها)
 * ---------------------------------------------------------------------------
 * هدف: استخراج ۱۰۰٪ داده‌های فهرست معاملات که تاکنون ناقص/خالی بوده است:
 *   · سمت ملک‌تبریز (ARM):
 *       فاز A: trade-overviews/list → TransactionRecord (طرفین پایه + هولوگرام)
 *       فاز B: trade-overviews/info/{id} → TransactionEnrichment —
 *               نوع · مبلغ (contractPrice/contractRent) · خریدار (نام+موبایل) ·
 *               فروشنده (نام+موبایل) · مشاوران+حق‌السهم · عنوان/آدرس ملک ·
 *               وضعیت · تاریخ سند/تحویل (۱۰۰٪ ستون‌های حکم)
 *   · سمت ملکتون (CRM): کاوش مسیرهای Inertia (/Deals · /Contracts · ...) —
 *       تاکنون صفر رکورد (hardcoded 0 در sync قدیمی — مستند در legacy).
 *       این ماژول مسیرها را با الگوی کشف PN-047 امتحان می‌کند؛ یافته‌ها در
 *       upload/.runtime/lcpp-m9-melketun-probe.json شاهد می‌شوند.
 *
 * سه تابع اختصاصی: fetch (هشت گارد معیوب + p-limit(3) + Delta هش) ·
 * validate (Zod: id الزامی) · merge (kernel خام — عین ستون‌های toTxData).
 *
 * قانون دادهٔ مقدس: TransactionEnrichment جدول افزودنی مستقل — سینک فهرست
 * هرگز حذف نمی‌کند؛ TransactionRecord فقط از مسیر upsert (کلید id).
 */

import { z } from "zod";
import { armCall } from "@/lib/melk-api/client";
import { getMelkApiConfig } from "@/lib/melk-api/config";
import { MELK_ENDPOINTS } from "@/lib/melk-api/endpoints";
import { extractPagedList, mapArmContractRow } from "@/lib/melk-api/adapters";
import { mapTxInfoPayload } from "@/lib/melk-api/tx-info-enrichment";
import {
  SqlBulkWriter,
  createBulkWriter,
  runPool,
  openDelta,
  updateListStatus,
  type BulkTableSpec,
} from "./kernel";

export const LIST_ID = "m9-transactions";

/** ردیف فهرست معاملات — whitelist عین ستون‌های toTxData + tenant پیش‌فرض DDL */
const TX_SPEC: BulkTableSpec = {
  table: "TransactionRecord",
  naturalKey: "id",
  columns: [
    "id", "contractDate", "propertyCode", "propertyCustomer", "requestCode",
    "requestCustomer", "contractHolo", "suggestedPropertyCount", "eventsCount",
    "rawDate", "rawPropertyCustomer", "rawRequestCustomer",
  ],
  metaColumns: ["sourceRunId", "extractedAt", "extractionBatchId", "syncedAt"],
};

/** غنی‌سازی — ۱۰۰٪ ستون‌های حکم فرمان ۶ */
const ENRICH_SPEC: BulkTableSpec = {
  table: "TransactionEnrichment",
  naturalKey: "txId",
  columns: [
    "txId", "contractType", "contractPrice", "rawContractPrice",
    "buyerName", "buyerMobile", "sellerName", "sellerMobile",
    "buyerListJson", "sellerListJson", "realtorSharesJson",
    "propertyTitle", "propertyAddress", "status",
    "documentDate", "deliveryDate", "businessId", "comisionOfContract", "taxOfContract",
  ],
  metaColumns: ["rawInfoJson", "extractionBatchId", "syncedAt"],
};

// ─── validate (Zod) ────────────────────────────────────────────────────────

const txRowSchema = z.object({ id: z.string().min(1) });

export function validateRow(mapped: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!mapped) return null;
  const parsed = txRowSchema.safeParse(mapped);
  return parsed.success ? (mapped as Record<string, unknown>) : null;
}

// ─── نگاشت ردیف فهرست → ستون‌های فیزیکی (فرمان ۶: طرفین/هولوگرام/تاریخ) ────

function listRowToSql(raw: Record<string, unknown>): Record<string, unknown> | null {
  const contract = mapArmContractRow(raw);
  if (!contract) return null;
  const now = new Date();
  const createdIso = contract.createdAt ?? contract.rawDate;
  const createdDate = createdIso ? new Date(createdIso) : null;
  const events = Array.isArray(raw.events) ? (raw.events as unknown[]).length : 0;
  const suggested = Array.isArray(raw.suggestedProperties)
    ? (raw.suggestedProperties as unknown[]).length
    : Number(raw.suggestedPropertiesCount ?? 0) || 0;
  return {
    id: contract.id,
    contractDate: createdDate && !Number.isNaN(createdDate.getTime()) ? createdDate : now,
    propertyCode: contract.propertyCode,
    propertyCustomer: null, // طرف ملک از info در فاز B — قانون ۰۴: نالِ فهرست روی مقدار موجود نمی‌نشیند
    requestCode: contract.requestCode,
    requestCustomer: null,
    contractHolo: contract.contractHolo,
    suggestedPropertyCount: suggested,
    eventsCount: events,
    rawDate: contract.rawDate,
  };
}

// ─── فاز A: Fast-Pass — trade-overviews/list ───────────────────────────────

export interface FastPassResult {
  fetched: number;
  written: number;
  skippedUnchangedPages: number;
  totalAtSource: number;
  durationMs: number;
}

async function fetchListPage(token: string, page: number, pageSize: number) {
  const cfg = getMelkApiConfig();
  const res = await armCall<unknown>({
    path: MELK_ENDPOINTS.arm.tradeOverviewsList,
    baseUrl: cfg.armApiBase,
    token,
    query: { page, limit: pageSize },
    timeoutMs: 30_000,
    maxRetries: 1,
  });
  const extracted = extractPagedList<Record<string, unknown>>(res.data, (r) =>
    r && typeof r === "object" ? (r as Record<string, unknown>) : null
  );
  const totalPages = extracted.totalPages ?? (extracted.total > 0 ? Math.ceil(extracted.total / pageSize) : 1);
  return { rows: extracted.rows ?? [], total: extracted.total, totalPages };
}

export async function fastPass(
  token: string,
  opts: { pageSize?: number; maxPages?: number; writer?: SqlBulkWriter } = {}
): Promise<FastPassResult> {
  const t0 = Date.now();
  const writer = opts.writer ?? (await createBulkWriter());
  const ownsWriter = !opts.writer;
  const pageSize = Math.min(opts.pageSize ?? 50, 100);
  const maxPages = opts.maxPages ?? 10;
  const delta = openDelta(LIST_ID);
  const result: FastPassResult = { fetched: 0, written: 0, skippedUnchangedPages: 0, totalAtSource: 0, durationMs: 0 };

  try {
    updateListStatus(LIST_ID, { phase: "fast-pass", progressPct: 5 });
    const first = await fetchListPage(token, 1, pageSize);
    result.totalAtSource = first.total;
    const totalPages = Math.min(first.totalPages || 1, maxPages);
    const pages: number[] = [];
    for (let p = 1; p <= totalPages; p += 1) pages.push(p);
    const batch: Array<Record<string, unknown>> = [];
    const runId = `m9-fast-${Date.now().toString(36)}`;

    await runPool(pages, async (page) => {
      const fetched = page === 1 ? first : await fetchListPage(token, page, pageSize);
      result.fetched += fetched.rows.length;
      if (delta.pageUnchanged(LIST_ID, `p${page}`, fetched.rows)) {
        result.skippedUnchangedPages += 1;
        return;
      }
      for (const raw of fetched.rows) {
        const mapped = validateRow(listRowToSql(raw));
        if (!mapped) continue;
        mapped.sourceRunId = runId;
        mapped.extractionBatchId = runId;
        mapped.extractedAt = new Date();
        mapped.syncedAt = new Date();
        batch.push(mapped);
      }
    });

    if (batch.length > 0) {
      const upsert = writer.upsertBulk(TX_SPEC, batch, (done, total) => {
        updateListStatus(LIST_ID, {
          phase: "fast-pass",
          progressPct: 10 + Math.round((done / total) * 85),
          fetched: result.fetched,
          written: done,
          skippedUnchanged: result.skippedUnchangedPages,
        });
      });
      result.written = upsert.written;
    }
    delta.commit(LIST_ID);
    result.durationMs = Date.now() - t0;
    return result;
  } finally {
    if (ownsWriter) writer.close();
  }
}

// ─── فاز B: Deep-Pass — trade-overviews/info/{id} → ۱۰۰٪ ستون‌ها ────────────

export interface DeepPassResult {
  candidates: number;
  enriched: number;
  durationMs: number;
  lastError: string | null;
}

/** معامله‌های فاقد غنی‌سازی — SQL مستقیم (پر از TransactionEnrichment نیست) */
export function pendingEnrichmentIds(writer: SqlBulkWriter, maxRows: number): string[] {
  const rows = writer.rawAll<{ id: string }>(
    `SELECT t.id FROM TransactionRecord t ` +
      `LEFT JOIN TransactionEnrichment e ON e.txId = t.id ` +
      `WHERE e.txId IS NULL AND (t.tenantId IS NULL OR t.tenantId = 'melk-tabriz') ` +
      `ORDER BY t.contractDate DESC LIMIT ?`,
    [maxRows]
  );
  return rows.map((r) => r.id);
}

export async function deepPass(
  token: string,
  opts: { maxRows?: number; writer?: SqlBulkWriter; pendingIds?: string[] } = {}
): Promise<DeepPassResult> {
  const t0 = Date.now();
  const cfg = getMelkApiConfig();
  const writer = opts.writer ?? (await createBulkWriter());
  const ownsWriter = !opts.writer;
  const maxRows = Math.min(opts.maxRows ?? 60, 120);
  const pending = opts.pendingIds ?? pendingEnrichmentIds(writer, maxRows);
  const result: DeepPassResult = { candidates: pending.length, enriched: 0, durationMs: 0, lastError: null };

  try {
    const batchId = `m9-deep-${Date.now().toString(36)}`;
    await runPool(pending, async (txId) => {
      try {
        const info = await armCall<unknown>({
          path: MELK_ENDPOINTS.arm.tradeOverviewInfo(txId),
          baseUrl: cfg.armApiBase,
          token,
          timeoutMs: 30_000,
          maxRetries: 1,
        });
        const mapped = mapTxInfoPayload(txId, info.data);
        const patch: Record<string, unknown> = {
          ...mapped,
          rawInfoJson: JSON.stringify(info.data ?? null).slice(0, 500_000),
          extractionBatchId: batchId,
          syncedAt: new Date(),
        };
        writer.upsertBulk(ENRICH_SPEC, [patch]);
        // تکمیل ستون‌های پایهٔ TransactionRecord از info (فرمان ۶ — طرفین):
        // خریدار=متقاضی‌طرف · فروشنده=طرف ملک — فقط اگر info مقدار داشت
        const basePatch: Record<string, unknown> = { id: txId };
        if (mapped.buyerName) basePatch.requestCustomer = mapped.buyerName;
        if (mapped.sellerName) basePatch.propertyCustomer = mapped.sellerName;
        if (mapped.contractPrice !== null) basePatch.rawPropertyCustomer = basePatch.rawPropertyCustomer ?? null;
        if (Object.keys(basePatch).length > 1) {
          const baseSpec: BulkTableSpec = {
            table: "TransactionRecord",
            naturalKey: "id",
            columns: ["propertyCustomer", "requestCustomer"],
            metaColumns: ["syncedAt"],
          };
          basePatch.syncedAt = new Date();
          writer.upsertBulk(baseSpec, [basePatch]);
        }
        result.enriched += 1;
      } catch (e) {
        result.lastError = String(e).slice(0, 200);
      }
    });
    result.durationMs = Date.now() - t0;
    return result;
  } finally {
    if (ownsWriter) writer.close();
  }
}

// ─── کاوش ملکتون (فرمان ۶ بند ۲) — Inertia /Deals · /Contracts ─────────────

export interface MelketunProbeResult {
  probedAt: string;
  routes: Array<{ path: string; status: number | string; rowsFound: number; propKeys: string[]; note?: string }>;
  totalRows: number;
}

/** مسیرهای نامزد بر اساس الگوی کشف PN-047 (MelketunPublicFilingPlus · Potentials) */
export const MELKETUN_DEAL_CANDIDATE_PATHS: readonly { path: string; propKeys: readonly string[] }[] = [
  { path: "/Deals", propKeys: ["deals", "data"] },
  { path: "/Contracts", propKeys: ["contracts", "data"] },
  { path: "/MelketunDeals", propKeys: ["deals", "data"] },
  { path: "/MelketunContracts", propKeys: ["contracts", "data"] },
  { path: "/deals", propKeys: ["deals", "data"] },
  { path: "/contracts", propKeys: ["contracts", "data"] },
];

/**
 * کاوش زندهٔ مسیرهای معاملات ملکتون — صفر رکورد تاکنون (hardcoded 0 قدیمی).
 * شاهدها: upload/.runtime/lcpp-m9-melketun-probe.json — برای گزارش نهایی فرمان ۶.
 * هرگز نمی‌شکند: 404/500 → صرفاً ثبت یافته.
 */
export async function probeMelketunDeals(): Promise<MelketunProbeResult> {
  const out: MelketunProbeResult = { probedAt: new Date().toISOString(), routes: [], totalRows: 0 };
  try {
    // بارگذاری تنبل — شکست import/لاگین هرگز فراخواننده را نمی‌شکند
    const mod = await import("@/lib/integrations/melketun/sync");
    const { existsSync, readFileSync, writeFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    // loadSecrets صادرنشده — خواندن مستقیم فایل راز (عین الگوی ماژول · Persistent Zone)
    const secretFile = join(process.env.MELKA_REPO_DIR ?? "/home/z/my-project", "upload/.runtime/melketun-secrets.json");
    const raw = existsSync(secretFile) ? JSON.parse(readFileSync(secretFile, "utf8")) : null;
    if (!raw?.crm?.base_url) {
      out.routes.push({ path: "—", status: "secrets-unavailable", rowsFound: 0, propKeys: [], note: "ملکتون متصل نیست (راز غایب) — کاوش موکول به اتصال" });
      return out;
    }
    const base = String(raw.crm.base_url).replace(/\/$/, "");
    const errors: string[] = [];
    const jar = await mod.crmLogin(base, String(raw.crm.username), String(raw.crm.password), errors);
    if (errors.some((e) => e.startsWith("POST /login-store") || e.startsWith("login verify"))) {
      out.routes.push({ path: "—", status: "login-failed", rowsFound: 0, propKeys: [], note: errors.join(" · ").slice(0, 150) });
      return out;
    }
    for (const candidate of MELKETUN_DEAL_CANDIDATE_PATHS) {
      try {
        const res = await fetch(`${base}${candidate.path}`, { headers: { Cookie: jar.header() } });
        if (res.status !== 200) {
          out.routes.push({ path: candidate.path, status: res.status, rowsFound: 0, propKeys: [] });
          continue;
        }
        const html = await res.text();
        const props = mod.extractInertiaProps(html);
        const keys = props ? Object.keys(props).slice(0, 10) : [];
        let rowsFound = 0;
        for (const pk of candidate.propKeys) {
          const bucket = props?.[pk] as { data?: unknown[] } | undefined;
          if (bucket && Array.isArray(bucket.data)) rowsFound += bucket.data.length;
        }
        out.routes.push({ path: candidate.path, status: 200, rowsFound, propKeys: keys });
        out.totalRows += rowsFound;
      } catch (e) {
        out.routes.push({ path: candidate.path, status: String(e).slice(0, 60), rowsFound: 0, propKeys: [] });
      }
    }
    // شاهد برای گزارش نهایی فرمان ۶
    const witness = join(process.env.MELKA_REPO_DIR ?? "/home/z/my-project", "upload/.runtime/lcpp-m9-melketun-probe.json");
    writeFileSync(witness, JSON.stringify(out, null, 1), "utf8");
  } catch (e) {
    out.routes.push({ path: "—", status: String(e).slice(0, 120), rowsFound: 0, propKeys: [] });
  }
  return out;
}
