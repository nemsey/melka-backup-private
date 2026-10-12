/**
 * POST /api/mobile-relay/poll — PN-031 (شورای عالی ملکا · جلسهٔ فوق‌العاده ۰۳۷)
 * ---------------------------------------------------------------------------
 * ایستگاه long-poll گوشی مالک (Poco F3 · Termux · IP ایرانی):
 *   · احراز HMAC سه‌هدری (X-Melka-Relay-Device · Timestamp · Signature)
 *   · بدنه: {"wait": 20} — حداکثر ۲۵ ثانیه معلق می‌ماند
 *   · ۲۰۰ + آیتم صف (با امضای دوجهتهٔ sig) یا ۲۰۴ (خالی — ادامهٔ poll)
 *
 * قانون «صفر لاگ محتوا»: هیچ بدنه/هدری ثبت نمی‌شود — فقط شمارندهٔ lastSeen.
 */

import { NextRequest } from "next/server";
import { verifyRelayRequestAuth, claimNextRelayRequest } from "@/lib/melk-api/relay";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const POLL_INTERVAL_MS = 700;

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const auth = await verifyRelayRequestAuth("POST", "/api/mobile-relay/poll", rawBody, request.headers);
  if (!auth.ok) {
    return Response.json({ ok: false, error: auth.error }, { status: auth.status, headers: { "cache-control": "no-store" } });
  }

  let waitSeconds = 20;
  try {
    const parsed = rawBody ? (JSON.parse(rawBody) as { wait?: number }) : {};
    if (typeof parsed.wait === "number" && Number.isFinite(parsed.wait)) {
      waitSeconds = Math.min(Math.max(parsed.wait, 0), 25);
    }
  } catch {
    // بدنهٔ خام یا خالی — wait پیش‌فرض
  }
  const deadline = Date.now() + waitSeconds * 1000;

  while (true) {
    const item = await claimNextRelayRequest(auth.device!.deviceId);
    if (item) {
      return Response.json(
        {
          ok: true,
          request: {
            id: item.id,
            method: item.method,
            url: item.url,
            headers: item.headers,
            body: item.body ?? "",
            sig: item.sig,
            ts: item.ts,
          },
        },
        { status: 200, headers: { "cache-control": "no-store" } }
      );
    }
    if (Date.now() >= deadline) {
      return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}
