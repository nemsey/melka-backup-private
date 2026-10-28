/**
 * RecordsChangesService — سرویس دادهٔ پنل «تغییرات اخیر» (PN-050 · دستور ۴)
 * ---------------------------------------------------------------------------
 * مرز مخزن (PN-012 BLOCK 1 · بند ۱.۲): روت‌ها سبک می‌مانند؛ همهٔ دسترسی‌های
 * Prisma از این سرویس می‌گذرند. منطق ادغام/بازگردانی از src/lib/merge.ts
 * (قانون‌دار — دستور ۳) می‌آید؛ این سرویس فقط لایهٔ پرس‌وجو و شکل‌دهی است.
 */

import { db } from "@/lib/db";
import { parseFieldChanges, parseProvenanceMap, revertRecordField, PROPERTY_FIELD_SPECS, REQUEST_FIELD_SPECS, type ChangeKind, type FieldChangeEntry } from "@/lib/merge";

const RANGES: Record<string, number> = { "24h": 24, "7d": 24 * 7, "30d": 24 * 30 };
const TYPES: ChangeKind[] = ["expert_override", "enrichment", "manual_revert"];

export interface RecentChangeRow {
  entity: "property" | "request";
  id: string;
  code: string | null;
  title: string | null;
  field: string;
  from: unknown;
  to: unknown;
  kind: ChangeKind;
  at: string;
  runId?: string;
  by: string | null;
  lastModifiedAt: string | null;
}

export interface ListChangesParams {
  range: string;
  type?: string | null;
  entity?: string | null;
}

export class RecordsChangesError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** GET /api/records/changes — فهرست تغییرات با فیلتر نوع/بازه (شمارش اختیاری) */
export async function listRecentChanges(
  params: ListChangesParams,
  options?: { countOnly?: boolean },
): Promise<{ ok: true; range: string; type: ChangeKind | null; count: number; items: RecentChangeRow[] }> {
  const rangeHours = RANGES[params.range];
  if (!rangeHours) throw new RecordsChangesError("بازهٔ نامعتبر (24h | 7d | 30d).", 400);
  const typeFilter = params.type ?? null;
  if (typeFilter && !TYPES.includes(typeFilter as ChangeKind)) {
    throw new RecordsChangesError("نوع تغییر نامعتبر.", 400);
  }

  const since = new Date(Date.now() - rangeHours * 60 * 60 * 1000);
  const wantProperty = !params.entity || params.entity === "property";
  const wantRequest = !params.entity || params.entity === "request";
  const rows: RecentChangeRow[] = [];

  if (wantProperty) {
    const records = await db.propertyRecord.findMany({
      where: { tenantId: "melketun", lastModifiedAt: { gte: since } },
      select: {
        id: true, propertyCode: true, title: true,
        fieldChanges: true, lastModifiedBy: true, lastModifiedAt: true,
      },
      take: 500,
      orderBy: { lastModifiedAt: "desc" },
    });
    for (const r of records) {
      for (const c of parseFieldChanges(r.fieldChanges)) {
        if (new Date(c.at).getTime() < since.getTime()) continue;
        if (typeFilter && c.kind !== typeFilter) continue;
        rows.push({
          entity: "property", id: r.id, code: r.propertyCode, title: r.title,
          field: c.field, from: c.from, to: c.to, kind: c.kind, at: c.at,
          runId: c.runId, by: r.lastModifiedBy, lastModifiedAt: r.lastModifiedAt?.toISOString() ?? null,
        });
      }
    }
  }

  if (wantRequest) {
    const records = await db.requestRecord.findMany({
      where: { tenantId: "melketun", lastModifiedAt: { gte: since } },
      select: {
        id: true, requestCode: true, title: true,
        fieldChanges: true, lastModifiedBy: true, lastModifiedAt: true,
      },
      take: 500,
      orderBy: { lastModifiedAt: "desc" },
    });
    for (const r of records) {
      for (const c of parseFieldChanges(r.fieldChanges)) {
        if (new Date(c.at).getTime() < since.getTime()) continue;
        if (typeFilter && c.kind !== typeFilter) continue;
        rows.push({
          entity: "request", id: r.id, code: r.requestCode, title: r.title,
          field: c.field, from: c.from, to: c.to, kind: c.kind, at: c.at,
          runId: c.runId, by: r.lastModifiedBy, lastModifiedAt: r.lastModifiedAt?.toISOString() ?? null,
        });
      }
    }
  }

  rows.sort((a, b) => (a.at < b.at ? 1 : -1));
  return {
    ok: true,
    range: params.range,
    type: typeFilter as ChangeKind | null,
    count: rows.length,
    items: options?.countOnly ? [] : rows.slice(0, 200),
  };
}

/** GET /api/records/[id]/changes — تاریخچهٔ کامل یک رکورد + provenance */
export async function getRecordChanges(id: string, entity: string): Promise<{
  ok: true;
  entity: "property" | "request";
  id: string;
  code: string | null;
  title: string | null;
  trackedFields: string[];
  current: Record<string, unknown>;
  fieldChanges: FieldChangeEntry[];
  lastSyncedValue: Record<string, unknown>;
  lastSyncedAt: string | null;
  lastModifiedBy: string | null;
  lastModifiedAt: string | null;
}> {
  if (entity !== "property" && entity !== "request") {
    throw new RecordsChangesError("موجودیت نامعتبر (property | request).", 400);
  }
  const specs = entity === "property" ? PROPERTY_FIELD_SPECS : REQUEST_FIELD_SPECS;
  const trackedFields = Object.keys(specs);
  const headSelect = {
    id: true, title: true,
    fieldChanges: true, lastSyncedValue: true, lastSyncedAt: true,
    lastModifiedBy: true, lastModifiedAt: true,
  } as const;

  const record =
    entity === "property"
      ? await db.propertyRecord.findFirst({
          where: { id },
          select: {
            ...headSelect,
            propertyCode: true,
            ...Object.fromEntries(trackedFields.map((f) => [f, true])),
          },
        })
      : await db.requestRecord.findFirst({
          where: { id },
          select: {
            ...headSelect,
            requestCode: true,
            ...Object.fromEntries(trackedFields.map((f) => [f, true])),
          },
        });

  if (!record) throw new RecordsChangesError("رکورد موردنظر یافت نشد.", 404);

  const rec = record as unknown as Record<string, unknown>;
  const current: Record<string, unknown> = {};
  for (const f of trackedFields) current[f] = rec[f] ?? null;

  return {
    ok: true,
    entity,
    id: rec.id as string,
    code: ((rec.propertyCode as string | undefined) ?? (rec.requestCode as string | undefined) ?? null),
    title: (rec.title as string | null) ?? null,
    trackedFields,
    current,
    fieldChanges: parseFieldChanges(rec.fieldChanges as string | null),
    lastSyncedValue: parseProvenanceMap(rec.lastSyncedValue as string | null),
    lastSyncedAt: (rec.lastSyncedAt as Date | null)?.toISOString() ?? null,
    lastModifiedBy: (rec.lastModifiedBy as string | null) ?? null,
    lastModifiedAt: (rec.lastModifiedAt as Date | null)?.toISOString() ?? null,
  };
}

export type RevertOutcomeShape =
  | { ok: true; entity: string; id: string; field: string; revertedTo: unknown; change: FieldChangeEntry }
  | { ok: false; reason: string; status: number };

/** POST /api/records/[id]/revert — بازگردانی با تأیید (منطق: src/lib/merge.ts) */
export async function revertRecord(
  id: string,
  entity: string,
  field: string,
  actor: string,
): Promise<RevertOutcomeShape> {
  const outcome = await revertRecordField({ entity: entity as "property" | "request", id, field, actor });
  if (!outcome.ok) {
    const status = outcome.reason === "not_found" ? 404 : 409;
    return { ok: false, reason: outcome.reason, status };
  }
  return {
    ok: true,
    entity,
    id,
    field,
    revertedTo: outcome.revertedTo,
    change: outcome.change,
  };
}
