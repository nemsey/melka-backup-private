/**
 * /api/records/[id]/changes — تاریخچهٔ کامل یک رکورد (PN-050 · دستور ۴)
 * ---------------------------------------------------------------------------
 * GET ?entity=property|request
 * پاسخ: snapshot فیلدهای tracked + fieldChanges کامل + lastSyncedValue (provenance)
 * — مبنا برای دکمهٔ «بازگردانی» در پنل «تغییرات اخیر».
 *
 * گارد: نشست + دسترسی کاشی متناظر (M7 آگهی / M8 درخواست).
 */

import { NextRequest } from "next/server";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { requireTileAccessFor } from "@/lib/access/personnel-access";
import { MelkApiError } from "@/lib/melk-api/types";
import { db } from "@/lib/db";
import { parseFieldChanges, parseProvenanceMap, PROPERTY_FIELD_SPECS, REQUEST_FIELD_SPECS } from "@/lib/merge";

export const dynamic = "force-dynamic";

const ENTITY_TILE: Record<string, "arm-listings" | "arm-requests"> = {
  property: "arm-listings",
  request: "arm-requests",
};

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  const { id } = await ctx.params;
  const url = new URL(request.url);
  const entity = url.searchParams.get("entity") ?? "property";
  const tile = ENTITY_TILE[entity];
  if (!tile) {
    return errorResponse(new MelkApiError("UNKNOWN", "موجودیت نامعتبر (property | request).", 400, false));
  }
  const tileAccess = await requireTileAccessFor(guard, tile);
  if (tileAccess instanceof MelkApiError) return errorResponse(tileAccess);

  const specs = entity === "property" ? PROPERTY_FIELD_SPECS : REQUEST_FIELD_SPECS;
  const trackedFields = Object.keys(specs);

  // سرگروه مشترک + snapshot فیلدهای tracked (مقدار فعلی کنار تاریخچه)
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
            ...(buildSelect(trackedFields) as unknown as Record<string, never>),
          },
        })
      : await db.requestRecord.findFirst({
          where: { id },
          select: {
            ...headSelect,
            requestCode: true,
            ...(buildSelect(trackedFields) as unknown as Record<string, never>),
          },
        });

  if (!record) {
    return errorResponse(new MelkApiError("NOT_FOUND", "رکورد موردنظر یافت نشد.", 404, false));
  }

  const code = (record as { propertyCode?: string | null; requestCode?: string | null }).propertyCode
    ?? (record as { requestCode?: string | null }).requestCode ?? null;

  const current: Record<string, unknown> = {};
  for (const f of trackedFields) {
    current[f] = (record as unknown as Record<string, unknown>)[f] ?? null;
  }

  return Response.json({
    ok: true,
    entity,
    id: record.id,
    code,
    title: (record as { title?: string | null }).title ?? null,
    trackedFields,
    current,
    fieldChanges: parseFieldChanges((record as { fieldChanges?: string | null }).fieldChanges),
    lastSyncedValue: parseProvenanceMap((record as { lastSyncedValue?: string | null }).lastSyncedValue),
    lastSyncedAt: (record as { lastSyncedAt?: Date | null }).lastSyncedAt?.toISOString() ?? null,
    lastModifiedBy: (record as { lastModifiedBy?: string | null }).lastModifiedBy ?? null,
    lastModifiedAt: (record as { lastModifiedAt?: Date | null }).lastModifiedAt?.toISOString() ?? null,
  });
}

function buildSelect(fields: string[]): Record<string, true> {
  const sel: Record<string, true> = {};
  for (const f of fields) sel[f] = true;
  return sel;
}
