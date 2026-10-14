/**
 * POST /api/mobile-relay/poll — PN-031 (شورای عالی ملکا · جلسهٔ فوق‌العاده ۰۳۷)
 * ---------------------------------------------------------------------------
 * ایستگاه long-poll گوشی مالک (Poco F3 · Termux · IP ایرانی):
 *   · احراز HMAC سه‌هدری (X-Melka-Relay-Device · Timestamp · Signature)
 *   · بدنه: {"wait": 20} — حداکثر ۲۵ ثانیه معلق می‌ماند
 *   · ۲۰۰ + آیتم صف (با امضای دوجهتهٔ sig) یا ۲۰۴ (خالی — ادامهٔ poll)
 *
 * PN-031-C (شورا-ن۰۴۰): اولین Poll موفق = نقطهٔ سوختن کد راه‌اندازی بخشنده
 * (پیش از این، کد در تلاش ناموفق می‌سوخت — ریشهٔ چرخهٔ خطای ۴۰۳ مالک).
 *
 * قانون «صفر لاگ محتوا»: هیچ بدنه/هدری ثبت نمی‌شود — فقط شمارندهٔ lastSeen.
 */

import { NextRequest } from "next/server";
import { verifyRelayRequestAuth, claimNextRelayRequest, markRelayEnrollCompleted, noteRelayPollSeen } from "@/lib/melk-api/relay";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const POLL_INTERVAL_MS = 700;

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const auth = await verifyRelayRequestAuth("POST", "/api/mobile-relay/poll", rawBody, request.headers);
  if (!auth.ok) {
    // PN-031-E — serverTime در پاسخ رد: کلاینت (اسکریپت/اپ) آفست ساعت خود را اصلاح می‌کند
    return Response.json(
      { ok: false, error: auth.error, serverTime: auth.serverTime ?? Date.now() },
      { status: auth.status, headers: { "cache-control": "no-store" } }
    );
  }

  // PN-031-C (شورا-ن۰۴۰) — نقطهٔ سوختن کد راه‌اندازی: اولین Poll موفق گوشی
  // یعنی اسکریپت واقعاً اجرا شده و راز را در گوشی نصب کرده؛ از این لحظه کد
  // بخشنده به‌طور نهایی مصرف می‌شود (enrolledAt). تلاش‌های پیشین که به Poll
  // نرسیدند، کد را نسوزانده بودند — پایان چرخهٔ خطای ۴۰۳.
  await markRelayEnrollCompleted(auth.device!.deviceId);

  // PN-031-E (فاز C) — هر Poll موفق = حضور زندهٔ دستگاه، حتی با صف خالی.
  // بدون این، بن‌بست «مرغ و تخم‌مرغ»: anyRelayDeviceOnline فقط به lastSeenAt
  // نگاه می‌کند که فقط با claim آیتم به‌روز می‌شد → با صف خالی، گوشیِ در حالِ
  // Poll هرگز «برخط» نمی‌شد → armCall صف‌گذاری نمی‌کرد → صف همیشه خالی می‌ماند.
  await noteRelayPollSeen(auth.device!.deviceId);

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
