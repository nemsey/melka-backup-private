/**
 * استخراج از سامانهٔ عمومی ملک تبریز (melketabriz.com) — P6546/گام صفر-۱
 * ------------------------------------------------------
 * کشف زندهٔ P6546 (شاهد: download/p6546/systems-discovery-*.json):
 *   سامانهٔ عمومی melketabriz.com از بخش عمومی همان سرور ARM می‌خواند:
 *   https://arus-api.melketabriz.ir/api/apu/  ← بدون توکن
 *     · properties/list?page=&limit=  → آگهی‌های منتشرشدهٔ عمومی (count=۳٬۶۷۹)
 *       رکورد غنی: code, title, totalPrice, pricePerMeter, propertyType.name,
 *       tradeType.name, area.name, currentStatus.name(+رنگ), relatedRealtor,
 *       viewCount, hasImage/hasVideo, createdAt/updatedAt
 *     · properties/info/by-code/{code} → جزئیات کامل: details[] برچسب‌دار
 *       (متراژ/اتاق/طبقه/سال ساخت/موقعیت/...) + inputs + area/line + listOfRealtors
 *
 * مأموریت (دستور مالک): «تعداد زیادی کد ملک در سامانه عمومی وجود دارد که در
 * فهرست آگهی موجود نیست؛ آنها را یافته و به فهرست اضافه کن»
 *   ⇒ syncMelkPublicCatalog: کل کاتالوج عمومی را می‌خواند، کدهای غایب را
 *     به PropertyRecord می‌افزاید و فیلدهای خالیِ رکوردهای موجود را پر می‌کند
 *     (upsert با merge-non-null — دادهٔ ARM هرگز بازنویسی نمی‌شود).
 *   ⇒ enrichMelkPublicDetails: برای کدهای تازه، جزئیات برچسب‌دار عمومی را
 *     در ستون‌های متراژ/اتاق/طبقه/سال ساخت می‌نویسد.
 */

import { randomUUID } from "node:crypto";
import { armCall } from "./client";
import { getMelkApiConfig } from "./config";
import { MELK_ENDPOINTS } from "./endpoints";
import { MelkApiError } from "./types";
import type { PropertyBulkInput, PropertyRecordRepository } from "@/core/repositories/interfaces";
import { getPropertyRecordRepository } from "@/core/repositories";

type RawRow = Record<string, unknown>;

/** نرخ فراخوانی محترمانه به سرور عمومی (همان قید کاتالوگ) */
const PUBLIC_RATE_MS = Number(process.env.MELK_PUBLIC_RATE_MS ?? 250);
/** حداکثر صفحات در هر اجرا (۳٬۶۷۹ رکورد ÷ ۱۰۰ = ۳۷ صفحه) */
const MAX_PAGES = 100;
/** حداکثر کد برای غنی‌سازی جزئیات در هر اجرا */
const MAX_DETAIL_ENRICH = Number(process.env.MELK_PUBLIC_ENRICH_MAX ?? 40);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function pickStr(row: RawRow, keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

function pickNestedStr(row: RawRow, path: string): string | null {
  const parts = path.split(".");
  let cur: unknown = row;
  for (const p of parts) {
    if (cur === null || typeof cur !== "object") return null;
    cur = (cur as RawRow)[p];
  }
  if (typeof cur === "string" && cur.trim().length > 0) return cur.trim();
  if (typeof cur === "number" && Number.isFinite(cur)) return String(cur);
  return null;
}

function pickNumber(row: RawRow, keys: string[]): number | null {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

function pickDate(v: unknown): Date | null {
  if (typeof v !== "string" || v.length < 8) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** نگاشت رکورد فهرست عمومی (apu) → PropertyBulkInput — غنی‌تر از فهرست ARM:
 *  نوع ملک، نوع معامله، منطقه، قیمت هر متر، وضعیت و کارشناس در خود فهرست موجودند. */
export function mapApuPublicPropertyRow(row: RawRow): PropertyBulkInput | null {
  const id = pickStr(row, ["_id", "id"]);
  const propertyCode = pickStr(row, ["code", "propertyCode"]);
  if (!propertyCode) return null;

  const totalPrice = pickNumber(row, ["totalPrice"]);
  const pricePerMeter = pickNumber(row, ["pricePerMeter"]);
  const relatedRealtor = pickStr(row, ["relatedRealtor"]);

  // متراژ مستقیم در inputs برخی رکوردها (مثل info/by-code) هست
  const inputs = (row.inputs ?? null) as RawRow | null;
  const space = inputs ? pickNumber(inputs, ["space"]) : null;

  return {
    id: id ?? propertyCode,
    propertyCode,
    title: pickStr(row, ["title"]),
    status: pickNestedStr(row, "currentStatus.name"),
    ownerCode: pickNestedStr(row, "relatedRealtorId.code"),
    ownerName: relatedRealtor,
    cityId: pickNestedStr(row, "city._id"),
    areaId: pickNestedStr(row, "area._id"),
    areaName: pickNestedStr(row, "area.name"),
    lineId: pickNestedStr(row, "line._id"),
    lineName: pickNestedStr(row, "line.name"),
    propertyTypeId: pickNestedStr(row, "propertyType._id"),
    propertyTypeName: pickNestedStr(row, "propertyType.name"),
    tradeTypeId: pickNestedStr(row, "tradeType._id"),
    tradeTypeName: pickNestedStr(row, "tradeType.name"),
    price: totalPrice,
    pricePerMeter,
    meterage: space,
    rawPrice: totalPrice !== null ? String(totalPrice) : null,
    rawPriceUnit: "ریال",
    rawSourceVersion: "melk-public-apu-v1",
    createdAt: pickDate(row.updatedAt) ?? pickDate(row.createdAt),
  };
}

/** استخراج مقادیر برچسب‌دار از details[] پاسخ info/by-code */
export function extractApuDetails(payload: RawRow): {
  meterage: number | null;
  rooms: number | null;
  floor: number | null;
  buildYear: number | null;
  areaName: string | null;
  lineName: string | null;
} {
  const details = Array.isArray(payload.details) ? (payload.details as RawRow[]) : [];
  const find = (name: string): string | null => {
    const item = details.find((d) => d.name === name || d.label === name);
    if (!item) return null;
    const v = item.value;
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    return null;
  };
  const num = (s: string | null): number | null => {
    if (!s) return null;
    const m = s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).match(/\d+/);
    return m ? Number(m[0]) : null;
  };
  const inputs = (payload.inputs ?? null) as RawRow | null;
  return {
    meterage: num(find("space")) ?? (inputs ? pickNumber(inputs, ["space"]) : null) ?? num(find("متراژ")),
    rooms: num(find("room_whole")) ?? num(find("اتاق")),
    floor: num(find("floor")) ?? num(find("طبقه")),
    buildYear: num(find("year")) ?? num(find("سال ساخت")),
    areaName: pickNestedStr(payload, "area.name"),
    lineName: pickNestedStr(payload, "line.name"),
  };
}

export interface MelkPublicSyncResult {
  ok: boolean;
  pages: number;
  publicCount: number;
  fetched: number;
  created: number;
  updated: number;
  duplicates: number;
  errors: number;
  /** کدهای موجود در سامانهٔ عمومی که در فهرست آگهی نبودند و افزوده شدند */
  newCodes: string[];
  /** تعداد غنی‌سازی جزئیات (info/by-code) کدهای تازه */
  detailEnriched: number;
  durationMs: number;
  errorCode?: string;
}

/**
 * همگام‌سازی کاتالوج عمومی با فهرست آگهی (بدون توکن — مسیر عمومی apu).
 * استراتژی: upsert با merge-non-null ⇒ کدهای غایب افزوده می‌شوند و فیلدهای
 * خالی رکوردهای موجود پر می‌شوند؛ هیچ دادهٔ ARM موجود هرگز پاک/بازنویسی نمی‌شود.
 */
export async function syncMelkPublicCatalog(
  opts: { pageSize?: number; maxPages?: number; enrichDetails?: boolean; repos?: { property?: PropertyRecordRepository } } = {}
): Promise<MelkPublicSyncResult> {
  const started = Date.now();
  const cfg = getMelkApiConfig();
  const repo = opts.repos?.property ?? getPropertyRecordRepository();
  const pageSize = Math.min(Math.max(opts.pageSize ?? 100, 1), 100);
  const maxPages = Math.min(opts.maxPages ?? MAX_PAGES, MAX_PAGES);
  const runId = `p6546-melk-public-${randomUUID().slice(0, 8)}`;
  const enrichDetails = opts.enrichDetails ?? true;

  const out: MelkPublicSyncResult = {
    ok: false, pages: 0, publicCount: 0, fetched: 0, created: 0, updated: 0,
    duplicates: 0, errors: 0, newCodes: [], detailEnriched: 0, durationMs: 0,
  };

  try {
    // ---- ۱) خواندن همهٔ صفحات فهرست عمومی ----
    const allRows: RawRow[] = [];
    let page = 1;
    let totalPages = 1;
    do {
      const res = await armCall<{ list?: RawRow[]; count?: number; totalPages?: number; page?: number; limit?: number }>({
        method: "GET",
        path: MELK_ENDPOINTS.melkPublic.propertiesList,
        baseUrl: cfg.melkPublicApiBase,
        query: { page, limit: pageSize },
        timeoutMs: 30000,
        maxRetries: 1,
      });
      const rows = Array.isArray(res.data?.list) ? res.data.list : [];
      allRows.push(...rows);
      out.publicCount = typeof res.data?.count === "number" ? res.data.count : out.publicCount;
      totalPages = typeof res.data?.totalPages === "number" ? res.data.totalPages : page;
      out.pages = page;
      page += 1;
      if (page <= totalPages && page <= maxPages) await sleep(PUBLIC_RATE_MS);
    } while (page <= totalPages && page <= maxPages);

    // ---- ۲) تشخیص کدهای غایب (شاهد شمارشی دقیق) ----
    const inputs = allRows
      .map((r) => mapApuPublicPropertyRow(r))
      .filter((r): r is PropertyBulkInput => r !== null);
    out.fetched = inputs.length;
    const allCodes = inputs.map((i) => i.propertyCode);
    const existing = new Set(await repo.findExistingCodes(allCodes));
    out.newCodes = allCodes.filter((c) => !existing.has(c));

    // ---- ۳) درج/پرکردن (merge-non-null — امن برای دادهٔ ARM موجود) ----
    const stats = await repo.upsertBulk(inputs, { sourceRunId: runId });
    out.created = stats.created;
    out.updated = stats.updated;
    out.duplicates = stats.duplicates;
    out.errors = stats.errors;

    // ---- ۴) غنی‌سازی جزئیات کدهای تازه (info/by-code عمومی) ----
    if (enrichDetails && out.newCodes.length > 0) {
      const targets = out.newCodes.slice(0, MAX_DETAIL_ENRICH);
      for (const code of targets) {
        try {
          const info = await armCall<RawRow>({
            method: "GET",
            path: MELK_ENDPOINTS.melkPublic.propertyInfoByCode(code),
            baseUrl: cfg.melkPublicApiBase,
            timeoutMs: 25000,
            maxRetries: 0,
          });
          const d = extractApuDetails(info.data ?? {});
          const patch: Record<string, string | number | null> = {};
          if (d.meterage !== null) patch.meterage = d.meterage;
          if (d.rooms !== null) patch.rooms = d.rooms;
          if (d.floor !== null) patch.floor = d.floor;
          if (d.buildYear !== null) patch.buildYear = d.buildYear;
          if (d.areaName) patch.areaName = d.areaName;
          if (d.lineName) patch.lineName = d.lineName;
          if (Object.keys(patch).length > 0) {
            await repo.updateCatalogFields(code, patch);
            out.detailEnriched += 1;
          }
        } catch {
          // جزئیات عمومی این کد در دسترس نبود — رکورد اصلی افزوده شده است؛ بی‌صدا رد می‌شویم
        }
        await sleep(PUBLIC_RATE_MS);
      }
    }

    out.ok = true;
  } catch (err) {
    out.errorCode = err instanceof MelkApiError ? err.code : "UNKNOWN";
  }
  out.durationMs = Date.now() - started;
  return out;
}

/** سنجش زندهٔ دسترس‌پذیری مسیر عمومی (بدون توکن) */
export async function probeMelkPublic(): Promise<{ ok: boolean; httpStatus: number; count: number | null }> {
  const cfg = getMelkApiConfig();
  try {
    const res = await armCall<{ count?: number }>({
      method: "GET",
      path: MELK_ENDPOINTS.melkPublic.propertiesList,
      baseUrl: cfg.melkPublicApiBase,
      query: { page: 1, limit: 1 },
      timeoutMs: 12000,
      maxRetries: 0,
    });
    return { ok: true, httpStatus: 200, count: typeof res.data?.count === "number" ? res.data.count : null };
  } catch (err) {
    return { ok: false, httpStatus: err instanceof MelkApiError ? (err.httpStatus ?? 0) : 0, count: null };
  }
}
