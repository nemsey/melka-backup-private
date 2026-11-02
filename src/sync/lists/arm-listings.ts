/**
 * arm-listings.ts — PN-051 · فرمان ۳/۴/۵ — M1: فهرست مستقل آگهی‌های ARM (ملک‌تبریز)
 * ---------------------------------------------------------------------------
 * مستقل از هر فهرست دیگر (معماری List-Centric — خطای این فهرست هرگز بقیه را
 * نمی‌ایستاند). سه تابع اختصاصی خود:
 *   · fetch  — fetchListPage گارد‌دار (صفحهٔ معیوب ×۳ تلاش — الگوی arm-catalog)
 *              با p-limit(3) + تأخیر تطبیقی + Delta هش‌صفحه (فرمان ۵)
 *   · validate — Zod: کدآگهی کلید طبیعی الزامی + انواع پایه
 *   · merge  — SqlBulkWriter (better-sqlite3 · Chunk ۵۰۰ · قانون ۰۴ در SQL)
 *
 * فاز A (Fast-Pass ≤۱ دقیقه): ستون‌های P0 از خود ردیف فهرست —
 *   کارشناس (ownerName) · آدرس (composeLocationAddress) · قیمت · وضعیت
 * فاز B (Deep-Pass): غنی‌سازی رکوردهای در-انتظار (extractionBatchId IS NULL) —
 *   properties/owner/{id} (نام/موبایل مالک — ستون «مالک» حیاتی)
 *   properties/details/{id} (آدرس دقیق + مشخصات کامل — detailsToPropertyExtras)
 *   عین دامنهٔ enrichArmListings اما نوشتار از مسیر خام kernel (خط قرمز Prisma-در-حلقه).
 *
 * ستون‌های مقدس (ownerNote · provenance PN-050) در whitelist نیستند — SQL ساختاراً
 * قادر به لمسشان نیست. additive-only: صفر DELETE/REPLACE.
 */

import { z } from "zod";
import { armCall } from "@/lib/melk-api/client";
import { getMelkApiConfig } from "@/lib/melk-api/config";
import { MELK_ENDPOINTS } from "@/lib/melk-api/endpoints";
import { extractPagedList, extractPersonInfo, normalizeMobile } from "@/lib/melk-api/adapters";
import { propertyNormColumns } from "@/lib/search-norm";
import { mapArmPropertyListRow, detailsToPropertyExtras } from "@/lib/melk-api/arm-catalog";
import { getPropertyRecordRepository } from "@/core/repositories";
import {
  SqlBulkWriter,
  createBulkWriter,
  runPool,
  openDelta,
  updateListStatus,
  type BulkTableSpec,
  type BulkUpsertResult,
} from "./kernel";

/** ردیف خام فهرست ARM — ساختاری عین RawRow داخلی arm-catalog (خارجی نیست) */
type RawRow = Record<string, unknown>;

export const LIST_ID = "m1-arm-listings";

/** whitelist ستون‌های لایهٔ فهرست — ستون‌های مقدس عمداً غایبند (قانون ۱۴) */
const LIST_SPEC: BulkTableSpec = {
  table: "PropertyRecord",
  naturalKey: "propertyCode",
  columns: [
    "id", "propertyCode", "title", "status", "ownerName",
    "cityId", "areaId", "areaName", "lineId", "lineName",
    "address", "price", "pricePerMeter", "rawPrice", "rawPriceUnit",
    "createdAt", "isRental", "depositPrice", "rentPrice", "viewCount",
    "imageCount", "addedToDivar", "addedToInsta", "isReposted", "isTarget",
    "armBranchTitle", "stateName", "cityName", "publicUrl", "statusDate",
    // PN-027 — ستون‌های سایهٔ نرمال (منبع یگانه: propertyNormColumns)
    "realtorNameNorm", "ownerSearchNorm", "addressSearchNorm",
  ],
  metaColumns: ["syncedAt"],
};

/** whitelist ستون‌های غنی‌سازی فاز B — عین دامنهٔ enrichArmListings */
const ENRICH_SPEC: BulkTableSpec = {
  table: "PropertyRecord",
  naturalKey: "propertyCode",
  columns: [
    "address", "ownerMobile", "rawOwnerName", "rawOwnerMobile",
    "meterage", "rooms", "floor", "buildYear",
    "propertyTypeId", "propertyTypeName", "tradeTypeId", "tradeTypeName",
    "description", "detailsJson",
  ],
  metaColumns: ["extractionBatchId", "extractedAt", "syncedAt"],
};

// ─── validate (فرمان ۳ — Zod اختصاصی) ───────────────────────────────────────

const propertyListRowSchema = z.object({
  propertyCode: z.string().min(1),
  title: z.string().nullable().optional(),
  price: z.number().nullable().optional(),
  createdAt: z.date().nullable().optional(),
}) satisfies z.ZodType<Record<string, unknown>>;

/** اعتبارسنجی — ردیف بی‌کدآگهی رد می‌شود (عین mapArmPropertyListRow) */
export function validateRow(mapped: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!mapped) return null;
  const parsed = propertyListRowSchema.safeParse(mapped);
  return parsed.success ? (mapped as Record<string, unknown>) : null;
}

// ─── fetch (فرمان ۴/۵) ─────────────────────────────────────────────────────

const LIST_TIMEOUT_MS = 30_000;

export interface FetchedPage {
  page: number;
  rows: Array<Record<string, unknown>>;
  total: number;
  totalPages: number;
  unchanged: boolean; // فرمان ۵ — هش صفحۀ یکسان با قبلی
}

async function fetchPageOnce(
  token: string,
  page: number,
  pageSize: number
): Promise<{ rows: RawRow[]; total: number; totalPages: number }> {
  const cfg = getMelkApiConfig();
  const res = await armCall<unknown>({
    path: MELK_ENDPOINTS.arm.propertiesList,
    baseUrl: cfg.armApiBase,
    token,
    query: { page, limit: pageSize },
    timeoutMs: LIST_TIMEOUT_MS,
    maxRetries: 1,
  });
  const extracted = extractPagedList<RawRow>(res.data, (row) =>
    row && typeof row === "object" ? (row as RawRow) : null
  );
  const rows = extracted.rows ?? [];
  const totalPages = extracted.totalPages ?? (extracted.total > 0 ? Math.ceil(extracted.total / pageSize) : 1);
  return { rows, total: extracted.total, totalPages };
}

// ─── فاز A: Fast-Pass (فرمان ۴ بند ۱) ─────────────────────────────────────

export interface FastPassResult {
  fetched: number;
  validated: number;
  written: number;
  skippedUnchangedPages: number;
  totalPages: number;
  totalAtSource: number;
  durationMs: number;
}

/**
 * فاز A — ستون‌های حیاتی از خود فهرست (مالک/کارشناس · آدرس · قیمت).
 * صفحات به‌موازی (۳) — Delta: صفحهٔ بی‌تغییر صفر نوشتن (فرمان ۵).
 */
export async function fastPass(
  token: string,
  opts: { pageSize?: number; maxPages?: number; writer?: SqlBulkWriter; deep?: boolean } = {}
): Promise<FastPassResult> {
  const t0 = Date.now();
  const writer = opts.writer ?? (await createBulkWriter());
  const ownsWriter = !opts.writer;
  const pageSize = Math.min(opts.pageSize ?? 50, 100); // عین clamp arm-catalog (PN-036)
  const maxPages = opts.maxPages ?? 12; // برش هر چرخه — دیمن ۱دقیقه‌ای ادامه می‌دهد
  const delta = openDelta(LIST_ID);
  const result: FastPassResult = {
    fetched: 0, validated: 0, written: 0, skippedUnchangedPages: 0,
    totalPages: 0, totalAtSource: 0, durationMs: 0,
  };

  try {
    // صفحهٔ ۱ = شمارش مرجع (سقف صفحات این برش)
    updateListStatus(LIST_ID, { phase: "fast-pass", progressPct: 5 });
    const first = await fetchPageOnce(token, 1, pageSize);
    const totalPages = Math.min(first.totalPages || 1, maxPages);
    result.totalPages = first.totalPages;
    result.totalAtSource = first.total;

    const pages: number[] = [];
    for (let p = 1; p <= totalPages; p += 1) pages.push(p);
    const batch: Array<Record<string, unknown>> = [];

    const pool = await runPool(pages, async (page) => {
      const fetched = page === 1 ? first : await fetchPageOnce(token, page, pageSize);
      result.fetched += fetched.rows.length;
      // فرمان ۵ — Delta هش: صفحهٔ بی‌تغییر → skip DB
      if (delta.pageUnchanged(LIST_ID, `p${page}`, fetched.rows)) {
        result.skippedUnchangedPages += 1;
        return;
      }
      for (const raw of fetched.rows) {
        const mapped = validateRow(mapArmPropertyListRow(raw) as unknown as Record<string, unknown> | null);
        if (!mapped) continue;
        // PN-027 — سایه‌های نرمال از ردیف فهرست (عین مسیر Prisma — هم‌ارزی قانون ۱)
        Object.assign(mapped, propertyNormColumns(mapped as { ownerName?: string | null; address?: string | null; areaName?: string | null; lineName?: string | null }));
        mapped.syncedAt = new Date();
        batch.push(mapped);
        result.validated += 1;
      }
    });

    // نوشتن انبوه — Chunkهای ۵۰۰ · Checkpoint عین قانون بقا ۲
    if (batch.length > 0) {
      const upsert: BulkUpsertResult = writer.upsertBulk(LIST_SPEC, batch, (done, total) => {
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
    if (pool.failures > 0) {
      delta.commit(LIST_ID); // صفحات موفق ثبت — تکرارِ فردا از صفحات شکست می‌گذرد
    } else {
      delta.commit(LIST_ID);
    }
    result.durationMs = Date.now() - t0;
    return result;
  } finally {
    if (ownsWriter) writer.close();
  }
}

// ─── فاز B: Deep-Pass (فرمان ۴ بند ۱ — غنی‌سازی) ───────────────────────────

export interface DeepPassResult {
  candidates: number;
  enriched: number;
  durationMs: number;
  lastError: string | null;
}

/**
 * فاز B — تکمیل جزئیات رکوردهای در-انتظار (لایهٔ «مالک» حیاتی از arm_owner).
 * رکوردهای هدف: listPendingEnrichment مخزن (extractionBatchId IS NULL).
 * نوشتار: kernel خام — یعنی غنی‌سازی هم هرگز Prisma-در-حلقه نیست (خط قرمز).
 */
export async function deepPass(
  token: string,
  opts: { maxRows?: number; writer?: SqlBulkWriter } = {}
): Promise<DeepPassResult> {
  const t0 = Date.now();
  const cfg = getMelkApiConfig();
  const writer = opts.writer ?? (await createBulkWriter());
  const ownsWriter = !opts.writer;
  const maxRows = Math.min(opts.maxRows ?? 120, 240);
  const repo = getPropertyRecordRepository();
  const pending = await repo.listPendingEnrichment(maxRows).catch(() => [] as Array<{ id: string; naturalKey: string }>);
  const result: DeepPassResult = { candidates: pending.length, enriched: 0, durationMs: 0, lastError: null };

  try {
    const batchId = `m1-deep-${Date.now().toString(36)}`;
    await runPool(pending, async (row) => {
      const recordId = row.id;
      const patch: Record<string, unknown> = {};
      try {
        // ۱) مالک (ستون حیاتی فاز A که فاز B کاملش می‌کند) — properties/owner/{id}
        const own = await armCall<unknown>({
          path: MELK_ENDPOINTS.arm.propertyOwner(recordId),
          baseUrl: cfg.armApiBase,
          token,
          timeoutMs: LIST_TIMEOUT_MS,
          maxRetries: 1,
        });
        const person = extractPersonInfo(own.data);
        if (person) {
          patch.rawOwnerName = person.fullName ?? null;
          patch.rawOwnerMobile = person.mobile ?? null;
          patch.ownerMobile = normalizeMobile(person.mobile ?? null) ?? person.mobile ?? null;
        }
        // ۲) جزئیات — properties/details/{id}: آدرس دقیق + مشخصات + توضیحات
        const det = await armCall<unknown>({
          path: MELK_ENDPOINTS.arm.propertyDetails(recordId),
          baseUrl: cfg.armApiBase,
          token,
          timeoutMs: LIST_TIMEOUT_MS,
          maxRetries: 1,
        });
        const extras = detailsToPropertyExtras(det.data);
        Object.assign(patch, extras as Record<string, unknown>);
      } catch (e) {
        // رکورد منفرد شکست‌خورده: عین رویهٔ arm-catalog — علامت غنی‌سازی نمی‌خورد
        result.lastError = String(e).slice(0, 200);
        return;
      }
      // فقط رکوردهایی که چیزی آوردند علامت می‌خورند (extractionBatchId) —
      // در غیر این صورت در چرخهٔ بعد دوباره امتحان می‌شوند (ایدمپوتنت).
      if (Object.keys(patch).filter((k) => k !== "syncedAt").length > 0) {
        patch.extractionBatchId = batchId;
        patch.extractedAt = new Date();
        patch.syncedAt = new Date();
        patch.propertyCode = row.naturalKey;
        writer.upsertBulk(ENRICH_SPEC, [patch]);
        result.enriched += 1;
      }
    });
    result.durationMs = Date.now() - t0;
    return result;
  } finally {
    if (ownsWriter) writer.close();
  }
}
