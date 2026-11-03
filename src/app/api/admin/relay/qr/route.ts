/**
 * GET /api/admin/relay/qr?text=... — PN-031 (شورا-ن۰۳۷)
 * ---------------------------------------------------------------------------
 * تولید QR کد نصب — فقط OWNER. متن (دستور نصب یک‌خطی) را می‌گیرد و
 * SVG برمی‌گرداند تا UI بدون کتابخانهٔ سمت کلاینت آن را نشان دهد.
 * متن QR حاوی راز نیست — فقط کد یک‌بارمصرف ۳۰دقیقه‌ای bootstrap.
 */

import { NextRequest } from "next/server";
import QRCode from "qrcode";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireRole } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const guard = await requireRole(request, "OWNER", "/api/admin/relay/qr");
  if (guard instanceof MelkApiError) return errorResponse(guard);

  const text = request.nextUrl.searchParams.get("text")?.trim() ?? "";
  if (!text) return Response.json({ ok: false, error: "missing text" }, { status: 400 });

  const svg = await QRCode.toString(text, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
  });
  return new Response(svg, {
    status: 200,
    headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "no-store" },
  });
}
