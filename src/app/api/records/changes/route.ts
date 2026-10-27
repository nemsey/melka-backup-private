/**
 * /api/records/changes — فهرست تغییرات اخیر (PN-050 · دستور ۴)
 * ---------------------------------------------------------------------------
 * GET ?range=24h|7d|30d (پیش‌فرض ۲۴h) & type=expert_override|enrichment|manual_revert
 *    & countOnly=1 (فقط شمارش — badge داشبورد ملکتون) & entity=property|request
 *
 * منبع داده: fieldChanges (JSON روی PropertyRecord/RequestRecord · tenantId='melketun')
 * + lastModifiedAt برای پرس‌وجوی ارزان (ایندکس‌شده — دستور ۲).
 *
 * گارد: نشست + دسترسی یکی از کاشی‌های M7/M8 (آگهی/درخواست ملکتون).
 * قانون ۱۰: این نمای دادهٔ مالک است (مانند فهرست M1/M7) — نه log/export؛
 * مقادیر فیلد فقط در نمای احراز-هویت‌شده برمی‌گردند، audit_log خام هرگز PII ندارد.
 */

import { NextRequest } from "next/server";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { requireTileAccessFor } from "@/lib/access/personnel-access";
import { MelkApiError } from "@/lib/melk-api/types";
import { db } from "@/lib/db";
import { parseFieldChanges, type ChangeKind } from "@/lib/merge";

export const dynamic = "force-dynamic";

const RANGES: Record<string, number> = { "24h": 24, "7d": 24 * 7, "30d": 24 * 30 };
const TYPES: ChangeKind[] = ["expert_override", "enrichment", "manual_revert"];
const MAX_ROWS = 200;

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

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  // دسترسی: یکی از دو کاشی دادهٔ ملکتون کافی است (پنل متعلق به داشبورد ملکتون است)
  const tileA = await requireTileAccessFor(guard, "arm-listings");
  const tileB = await requireTileAccessFor(guard, "arm-requests");
  if (tileA instanceof MelkApiError && tileB instanceof MelkApiError) return errorResponse(tileA);

  const url = new URL(request.url);
  const rangeKey = url.searchParams.get("range") ?? "24h";
  const rangeHours = RANGES[rangeKey];
  if (!rangeHours) {
    return errorResponse(new MelkApiError("UNKNOWN", "بازهٔ نامعتبر (24h | 7d | 30d).", 400, false));
  }
  const typeFilter = url.searchParams.get("type");
  if (typeFilter && !TYPES.includes(typeFilter as ChangeKind)) {
    return errorResponse(new MelkApiError("UNKNOWN", "نوع تغییر نامعتبر.", 400, false));
  }
  const entityFilter = url.searchParams.get("entity");
  const countOnly = url.searchParams.get("countOnly") === "1";

  const since = new Date(Date.now() - rangeHours * 60 * 60 * 1000);
  const wantProperty = !entityFilter || entityFilter === "property";
  const wantRequest = !entityFilter || entityFilter === "request";

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

  if (countOnly) {
    return Response.json({ ok: true, range: rangeKey, count: rows.length });
  }
  return Response.json({
    ok: true,
    range: rangeKey,
    type: typeFilter ?? null,
    count: rows.length,
    items: rows.slice(0, MAX_ROWS),
  });
}
