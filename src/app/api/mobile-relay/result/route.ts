/**
 * POST /api/mobile-relay/result — PN-031 (شورا-ن۰۳۷)
 * ---------------------------------------------------------------------------
 * گوشی نتیجهٔ اجرای درخواست را برمی‌گرداند:
 *   · احراز HMAC (همان قرارداد poll — path این روت)
 *   · بدنه: {"id", "httpStatus", "contentType", "bodyB64", "error?"}
 *     bodyB64 = base64 بدنهٔ پاسخ (امن در برابر هر محتوای متنی/دودویی)
 *   · فقط آیتمِ «خودِ» دستگاه در وضعیت dispatched پذیرفته می‌شود (403/409 در غیر این صورت)
 *
 * قانون «صفر لاگ محتوا»: بدنهٔ پاسخ فقط در صف ذخیره می‌شود تا armCall صداکننده
 * آن را بخواند — هیچ لاگی از محتوای آن تهیه نمی‌شود.
 */

import { NextRequest } from "next/server";
import { verifyRelayRequestAuth, completeRelayRequest, RELAY_MAX_RESULT_BYTES } from "@/lib/melk-api/relay";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const auth = await verifyRelayRequestAuth("POST", "/api/mobile-relay/result", rawBody, request.headers);
  if (!auth.ok) {
    // PN-031-E — serverTime در پاسخ رد (همان قرارداد poll)
    // PN-031-G — missing: نام هدرهای احرازی نایافته (تشخیص یک‌نگاهی روی گوشی)
    return Response.json(
      { ok: false, error: auth.error, missing: auth.missing, serverTime: auth.serverTime ?? Date.now() },
      { status: auth.status, headers: { "cache-control": "no-store" } }
    );
  }

  let payload: { id?: string; httpStatus?: number; contentType?: string | null; bodyB64?: string | null; error?: string | null };
  try {
    payload = JSON.parse(rawBody) as typeof payload;
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  if (!payload?.id) {
    return Response.json({ ok: false, error: "missing id" }, { status: 400 });
  }

  let body: string | null = null;
  if (typeof payload.bodyB64 === "string" && payload.bodyB64.length > 0) {
    if (payload.bodyB64.length > (RELAY_MAX_RESULT_BYTES * 4) / 3) {
      // پاسخ بیش از حد بزرگ — به‌عنوان خطا ثبت می‌شود تا صفحه‌بندی بالادست کوچک‌تر شود
      const r = await completeRelayRequest({
        id: payload.id,
        deviceId: auth.device!.deviceId,
        error: "response too large (>5MB)",
      });
      return Response.json({ ok: r.ok, error: r.ok ? undefined : r.error }, { status: r.status });
    }
    try {
      body = Buffer.from(payload.bodyB64, "base64").toString("utf8");
    } catch {
      return Response.json({ ok: false, error: "invalid base64" }, { status: 400 });
    }
  }

  const r = await completeRelayRequest({
    id: payload.id,
    deviceId: auth.device!.deviceId,
    httpStatus: typeof payload.httpStatus === "number" ? payload.httpStatus : undefined,
    contentType: payload.contentType ?? null,
    body,
    error: payload.error ?? null,
  });
  return Response.json({ ok: r.ok, error: r.ok ? undefined : r.error }, { status: r.status, headers: { "cache-control": "no-store" } });
}
