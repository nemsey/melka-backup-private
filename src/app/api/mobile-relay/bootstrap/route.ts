/**
 * GET /api/mobile-relay/bootstrap?code=XXX — PN-031 (شورا-ن۰۳۷)
 * ---------------------------------------------------------------------------
 * تحویل اسکریپت رلهٔ اختصاصی دستگاه — احراز با کد یک‌بارمصرف ۳۰دقیقه‌ای که
 * فقط مالک (OWNER) از تنظیمات می‌گیرد. پس از نخستین دانلود، کد مصرف می‌شود
 * (دوباره گرفتن مجدد = روت enroll دوباره مالک).
 * خروجی: text/x-shellscript با پیکربندی تزریقی (راز دستگاه داخل فایل).
 */

import { NextRequest } from "next/server";
import { consumeEnrollCode } from "@/lib/melk-api/relay";
import { buildRelayScript } from "@/lib/melk-api/relay-script";
import { getPublicBaseUrl, PublicBaseUrlError } from "@/lib/http/public-url";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")?.trim() ?? "";
  if (!code) return Response.json({ ok: false, error: "missing code" }, { status: 400 });

  // نشانی سرور — PN-031-HOTFIX (شورا-ن۰۳۸): نشانی عمومی، نه بایند داخلی کانتینر.
  // کد مصرف‌شده قابل بازگشت نیست؛ خطای نشانی باید «پیش از مصرف کد» رخ دهد تا
  // مالک با یک کد تازه بی‌درنگ توانایی تلاش مجدد داشته باشد — به همین دلیل
  // تعیین نشانی قبل از consumeEnrollCode انجام می‌شود.
  let serverUrl: string;
  try {
    serverUrl = getPublicBaseUrl({
      headers: request.headers,
      connectionProtocol: request.nextUrl.protocol,
    });
  } catch (e) {
    if (e instanceof PublicBaseUrlError) {
      return Response.json({ ok: false, error: e.message }, { status: 503 });
    }
    throw e;
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "unknown";
  const consumed = await consumeEnrollCode(code, ip);
  if (!consumed.ok || !consumed.device) {
    return Response.json({ ok: false, error: "کد راه‌اندازی نامعتبر یا منقضی است — از تنظیمات ملکا کد تازه بگیرید." }, { status: 403 });
  }
  const script = buildRelayScript({
    serverUrl,
    deviceId: consumed.device.deviceId,
    deviceSecret: consumed.device.secret,
  });

  return new Response(script, {
    status: 200,
    headers: {
      "content-type": "text/x-shellscript; charset=utf-8",
      "cache-control": "no-store",
      "content-disposition": 'attachment; filename="melka-relay.sh"',
    },
  });
}
