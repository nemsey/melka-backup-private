/**
 * POST /api/admin/relay/revoke — PN-031 (شورا-ن۰۳۷)
 * ---------------------------------------------------------------------------
 * ابطال دستگاه رله (گم شدن گوشی / تعویض) — فقط OWNER.
 * دستگاه ابطال‌شده بلافاصله از poll/result رد می‌شود (403 revoked).
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { audit } from "@/lib/auth/session";
import { revokeRelayDevice } from "@/lib/melk-api/relay";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const guard = await requireRole(request, "OWNER", "/api/admin/relay/revoke");
  if (guard instanceof MelkApiError) return errorResponse(guard);
  const ctx = guard.ctx;

  try {
    const body = (await request.json().catch(() => null)) as { deviceId?: string; confirm?: boolean } | null;
    const deviceId = body?.deviceId?.trim() ?? "";
    if (!deviceId) return errorResponse(new MelkApiError("UNPROCESSABLE", "شناسهٔ دستگاه لازم است.", 400, false));
    if (body?.confirm !== true) {
      return errorResponse(new MelkApiError("PRECONDITION_FAILED", "ابطال نیازمند تأیید صریح است: { \"deviceId\": \"...\", \"confirm\": true }", 412, false));
    }
    const ok = await revokeRelayDevice(deviceId);
    if (!ok) return errorResponse(new MelkApiError("NOT_FOUND", "دستگاه یافت نشد یا پیش‌تر ابطال شده است.", 404, false));

    await audit("RELAY_REVOKE_OWNER", ctx.personnelCode, `ابطال دستگاه رلهٔ ${deviceId}`);
    return Response.json({ ok: true, message: `دستگاه ${deviceId} ابطال شد — گوشی دیگر به رله دسترسی ندارد.` });
  } catch (err) {
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("UNKNOWN", "خطای غیرمنتظره در ابطال دستگاه.", 500, false));
  }
}
