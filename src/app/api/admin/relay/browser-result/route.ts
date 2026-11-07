/**
 * POST /api/admin/relay/browser-result — PN-031 (شورا-ن۰۳۷ · رویکرد B)
 * ---------------------------------------------------------------------------
 * پشتیبان مرورگری — ثبت نتیجهٔ اجرای درخواست با احراز نشست OWNER.
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { completeRelayRequest } from "@/lib/melk-api/relay";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const guard = await requireRole(request, "OWNER", "/api/admin/relay/browser-result");
  if (guard instanceof MelkApiError) return errorResponse(guard);

  let payload: { id?: string; httpStatus?: number; contentType?: string | null; body?: string | null; error?: string | null };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  if (!payload?.id) return Response.json({ ok: false, error: "missing id" }, { status: 400 });

  const r = await completeRelayRequest({
    id: payload.id,
    deviceId: "browser-owner",
    httpStatus: typeof payload.httpStatus === "number" ? payload.httpStatus : undefined,
    contentType: payload.contentType ?? null,
    body: typeof payload.body === "string" ? payload.body : null,
    error: payload.error ?? null,
  });
  return Response.json({ ok: r.ok, error: r.ok ? undefined : r.error }, { status: r.status, headers: { "cache-control": "no-store" } });
}
