/**
 * arm-requests.ts — PN-051 · فرمان ۳/۴/۵ — M2: فهرست مستقل درخواست‌های ARM (ملک‌تبریز)
 * ---------------------------------------------------------------------------
 * مستقل (List-Centric) — سه تابع اختصاصی:
 *   · fetch   — requests/list با گارد صفحهٔ معیوب + p-limit(3) + تأخیر تطبیقی + Delta هش
 *   · validate — Zod: کد درخواست الزامی (کلید طبیعی requestCode)
 *   · merge   — SqlBulkWriter خام — نگاشت عین toArmRequestData (منبع یگانهٔ نگاشت
 *               جسمانی) + سایه‌های نرمال (requestNormColumns — PN-027)
 *
 * فاز A: نام مشتری (relatedCustomer) · کارشناس (actorName/relatedRealtor) ·
 *        دسته‌بندی · بازهٔ قیمت · منطقه/محله — همه از خود ردیف فهرست (P6547)
 * فاز B: requests/applicant/{id} (موبایل متقاضی — ستون «متقاضی» حیاتی)
 *        + requests/details/{id} (منطقه‌های منتخب کامل)
 */

import { z } from "zod";
import { armCall } from "@/lib/melk-api/client";
import { getMelkApiConfig } from "@/lib/melk-api/config";
import { MELK_ENDPOINTS } from "@/lib/melk-api/endpoints";
import { extractPagedList, extractPersonInfo } from "@/lib/melk-api/adapters";
import { mapArmRequestListRow } from "@/lib/melk-api/arm-catalog";
import { requestNormColumns } from "@/lib/search-norm";
import { getRequestRepository } from "@/core/repositories";
import {
  SqlBulkWriter,
  createBulkWriter,
  runPool,
  openDelta,
  updateListStatus,
  type BulkTableSpec,
} from "./kernel";

/** ردیف خام فهرست ARM — ساختاری عین RawRow داخلی arm-catalog */
type RawRow = Record<string, unknown>;

export const LIST_ID = "m2-arm-requests";

const LIST_SPEC: BulkTableSpec = {
  table: "RequestRecord",
  naturalKey: "requestCode",
  columns: [
    "id", "requestCode", "source", "customerName", "status", "actorCode", "actorName",
    "title", "createdAt", "areaNamesJson", "lineNamesJson",
    "tradeTypeName", "propertyTypeName", "buildingTypeName",
    "priceFrom", "priceTo", "userPaymentMethodName", "userSeriousityName",
    "urgent", "luxury", "changeable", "rawCustomerName", "rawCustomerMobile",
    "spaceFrom", "spaceTo", "roomsFrom", "roomsTo", "floorFrom", "floorTo",
    "buildYearFrom", "buildYearTo", "sanadNames", "constructTypeNames", "sideNames",
    "occasion", "deposit", "confirmSms", "notifyMe", "changeWithNames",
    "armBranchTitle", "countryName", "stateName", "cityName", "platform", "customerDescription",
    // PN-027 — سایه‌های نرمال
    "customerNameNorm", "sanadNamesNorm", "actorNameNorm",
  ],
  metaColumns: ["updatedAt", "extractedAt"],
};

/** whitelist غنی‌سازی فاز B — ستون «متقاضی» حیاتی */
const ENRICH_SPEC: BulkTableSpec = {
  table: "RequestRecord",
  naturalKey: "requestCode",
  columns: ["customerMobile", "rawCustomerMobile", "areaNamesJson"],
  metaColumns: ["extractionBatchId", "extractedAt", "updatedAt"],
};

// ─── validate (Zod) ────────────────────────────────────────────────────────

const requestListRowSchema = z.object({
  requestCode: z.string().min(1),
  customerName: z.string().nullable().optional(),
  actorName: z.string().nullable().optional(),
  createdAt: z.date().nullable().optional(),
});

export function validateRow(mapped: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!mapped) return null;
  const parsed = requestListRowSchema.safeParse(mapped);
  return parsed.success ? (mapped as Record<string, unknown>) : null;
}

// ─── نگاشت ردیف → ستون‌های فیزیکی (عین toArmRequestData · منبع یگانه) ───────

function toSqlRow(r: Record<string, unknown>): Record<string, unknown> {
  const row = r as unknown as {
    id?: string; requestCode?: string; customerName?: string | null; customerMobile?: string | null;
    status?: string | null; actorCode?: string | null; actorName?: string | null; title?: string | null;
    createdAt?: Date | null; areaNames?: string[] | null; lineNames?: string[] | null;
    tradeTypeName?: string | null; propertyTypeName?: string | null; buildingTypeName?: string | null;
    priceFrom?: number | null; priceTo?: number | null; paymentMethodName?: string | null;
    seriousnessName?: string | null; urgent?: boolean | null; luxury?: boolean | null;
    changeable?: boolean | null; rawCustomerName?: string | null; rawCustomerMobile?: string | null;
    spaceFrom?: number | null; spaceTo?: number | null; roomsFrom?: number | null; roomsTo?: number | null;
    floorFrom?: number | null; floorTo?: number | null; buildYearFrom?: number | null; buildYearTo?: number | null;
    sanadNames?: string | null; constructTypeNames?: string | null; sideNames?: string | null;
    occasion?: boolean | null; deposit?: boolean | null; confirmSms?: boolean | null;
    notifyMe?: boolean | null; changeWithNames?: string | null; armBranchTitle?: string | null;
    countryName?: string | null; stateName?: string | null; cityName?: string | null;
    platform?: string | null; customerDescription?: string | null;
  };
  return {
    id: row.id,
    requestCode: row.requestCode,
    source: "arm",
    customerName: row.customerName ?? null,
    status: row.status ?? "ready",
    actorCode: row.actorCode ?? "arm",
    actorName: row.actorName ?? undefined,
    title: row.title ?? undefined,
    createdAt: row.createdAt ?? undefined,
    areaNamesJson: row.areaNames?.length ? JSON.stringify(row.areaNames) : undefined,
    lineNamesJson: row.lineNames?.length ? JSON.stringify(row.lineNames) : undefined,
    tradeTypeName: row.tradeTypeName ?? undefined,
    propertyTypeName: row.propertyTypeName ?? undefined,
    buildingTypeName: row.buildingTypeName ?? undefined,
    priceFrom: row.priceFrom ?? undefined,
    priceTo: row.priceTo ?? undefined,
    userPaymentMethodName: row.paymentMethodName ?? undefined,
    userSeriousityName: row.seriousnessName ?? undefined,
    urgent: row.urgent ?? undefined,
    luxury: row.luxury ?? undefined,
    changeable: row.changeable ?? undefined,
    rawCustomerName: row.rawCustomerName ?? undefined,
    rawCustomerMobile: row.rawCustomerMobile ?? undefined,
    spaceFrom: row.spaceFrom ?? undefined,
    spaceTo: row.spaceTo ?? undefined,
    roomsFrom: row.roomsFrom ?? undefined,
    roomsTo: row.roomsTo ?? undefined,
    floorFrom: row.floorFrom ?? undefined,
    floorTo: row.floorTo ?? undefined,
    buildYearFrom: row.buildYearFrom ?? undefined,
    buildYearTo: row.buildYearTo ?? undefined,
    sanadNames: row.sanadNames ?? undefined,
    constructTypeNames: row.constructTypeNames ?? undefined,
    sideNames: row.sideNames ?? undefined,
    occasion: row.occasion ?? undefined,
    deposit: row.deposit ?? undefined,
    confirmSms: row.confirmSms ?? undefined,
    notifyMe: row.notifyMe ?? undefined,
    changeWithNames: row.changeWithNames ?? undefined,
    armBranchTitle: row.armBranchTitle ?? undefined,
    countryName: row.countryName ?? undefined,
    stateName: row.stateName ?? undefined,
    cityName: row.cityName ?? undefined,
    platform: row.platform ?? undefined,
    customerDescription: row.customerDescription ?? undefined,
    ...requestNormColumns(row),
  };
}

// ─── fetch ──────────────────────────────────────────────────────────────────

const LIST_TIMEOUT_MS = 30_000; // فهرست درخواست‌ها ~۵ثانیه (پروب P6.5-10)

async function fetchPageOnce(token: string, page: number, pageSize: number) {
  const cfg = getMelkApiConfig();
  const res = await armCall<unknown>({
    path: MELK_ENDPOINTS.arm.requestsList,
    baseUrl: cfg.armApiBase,
    token,
    query: { page, limit: pageSize },
    timeoutMs: LIST_TIMEOUT_MS,
    maxRetries: 1,
  });
  const extracted = extractPagedList<RawRow>(res.data, (r) => (r && typeof r === "object" ? (r as RawRow) : null));
  const totalPages = extracted.totalPages ?? (extracted.total > 0 ? Math.ceil(extracted.total / pageSize) : 1);
  return { rows: extracted.rows ?? [], total: extracted.total, totalPages };
}

// ─── فاز A ──────────────────────────────────────────────────────────────────

export interface FastPassResult {
  fetched: number;
  validated: number;
  written: number;
  skippedUnchangedPages: number;
  totalPages: number;
  totalAtSource: number;
  durationMs: number;
}

export async function fastPass(
  token: string,
  opts: { pageSize?: number; maxPages?: number; writer?: SqlBulkWriter } = {}
): Promise<FastPassResult> {
  const t0 = Date.now();
  const writer = opts.writer ?? (await createBulkWriter());
  const ownsWriter = !opts.writer;
  const pageSize = Math.min(opts.pageSize ?? 50, 100);
  const maxPages = opts.maxPages ?? 12;
  const delta = openDelta(LIST_ID);
  const result: FastPassResult = {
    fetched: 0, validated: 0, written: 0, skippedUnchangedPages: 0,
    totalPages: 0, totalAtSource: 0, durationMs: 0,
  };

  try {
    updateListStatus(LIST_ID, { phase: "fast-pass", progressPct: 5 });
    const first = await fetchPageOnce(token, 1, pageSize);
    const totalPages = Math.min(first.totalPages || 1, maxPages);
    result.totalPages = first.totalPages;
    result.totalAtSource = first.total;

    const pages: number[] = [];
    for (let p = 1; p <= totalPages; p += 1) pages.push(p);
    const batch: Array<Record<string, unknown>> = [];

    await runPool(pages, async (page) => {
      const fetched = page === 1 ? first : await fetchPageOnce(token, page, pageSize);
      result.fetched += fetched.rows.length;
      if (delta.pageUnchanged(LIST_ID, `p${page}`, fetched.rows)) {
        result.skippedUnchangedPages += 1;
        return;
      }
      for (const raw of fetched.rows) {
        const mapped = validateRow(mapArmRequestListRow(raw) as unknown as Record<string, unknown> | null);
        if (!mapped) continue;
        batch.push({ ...toSqlRow(mapped), updatedAt: new Date() });
        result.validated += 1;
      }
    });

    if (batch.length > 0) {
      const upsert = writer.upsertBulk(LIST_SPEC, batch, (done, total) => {
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

// ─── فاز B — متقاضی حیاتی از requests/applicant ────────────────────────────

export interface DeepPassResult {
  candidates: number;
  enriched: number;
  durationMs: number;
  lastError: string | null;
}

export async function deepPass(
  token: string,
  opts: { maxRows?: number; writer?: SqlBulkWriter } = {}
): Promise<DeepPassResult> {
  const t0 = Date.now();
  const cfg = getMelkApiConfig();
  const writer = opts.writer ?? (await createBulkWriter());
  const ownsWriter = !opts.writer;
  const maxRows = Math.min(opts.maxRows ?? 120, 240);
  const repo = getRequestRepository();
  const pending = await repo
    .listPendingArmEnrichment(maxRows)
    .catch(() => [] as Array<{ id: string; naturalKey: string }>);
  const result: DeepPassResult = { candidates: pending.length, enriched: 0, durationMs: 0, lastError: null };

  try {
    const batchId = `m2-deep-${Date.now().toString(36)}`;
    await runPool(pending, async (row) => {
      const patch: Record<string, unknown> = {};
      try {
        // ۱) متقاضی — ستون حیاتی: نام + موبایل درخواست‌دهنده
        const app = await armCall<unknown>({
          path: MELK_ENDPOINTS.arm.requestApplicant(row.id),
          baseUrl: cfg.armApiBase,
          token,
          timeoutMs: LIST_TIMEOUT_MS,
          maxRetries: 1,
        });
        const person = extractPersonInfo(app.data);
        if (person) {
          patch.rawCustomerMobile = person.mobile ?? null;
          patch.customerMobile = person.mobile ?? null;
        }
        // ۲) جزئیات — منطقه‌های منتخب کامل (M2 ستون منطقه)
        const det = await armCall<unknown>({
          path: MELK_ENDPOINTS.arm.requestDetails(row.id),
          baseUrl: cfg.armApiBase,
          token,
          timeoutMs: LIST_TIMEOUT_MS,
          maxRetries: 1,
        });
        const areas = (det.data as { area?: unknown } | null)?.area;
        if (Array.isArray(areas)) {
          const names = areas
            .map((a) => (a && typeof a === "object" ? String((a as { name?: unknown }).name ?? "").trim() : ""))
            .filter((s) => s.length > 0);
          if (names.length > 0) patch.areaNamesJson = JSON.stringify(names);
        }
      } catch (e) {
        result.lastError = String(e).slice(0, 200);
        return;
      }
      if (Object.keys(patch).length > 0) {
        patch.extractionBatchId = batchId;
        patch.extractedAt = new Date();
        patch.updatedAt = new Date();
        patch.requestCode = row.naturalKey;
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
