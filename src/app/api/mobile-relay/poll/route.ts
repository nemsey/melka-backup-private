/**
 * POST /api/mobile-relay/poll — PN-031 (شورای عالی ملکا · جلسهٔ فوق‌العاده ۰۳۷)
 * ---------------------------------------------------------------------------
 * ایستگاه long-poll گوشی مالک (Poco F3 · Termux · IP ایرانی):
 *   · احراز HMAC سه‌هدری (X-Melka-Relay-Device · Timestamp · Signature)
 *   · بدنه: {"wait": 100, "batch": 100} — حداکثر ۱۰۰ ثانیه معلق می‌ماند
 *   · ۲۰۰ + دستهٔ آیتم‌های صف (با امضای دوجهتهٔ sig) یا ۲۰۴ (خالی — ادامهٔ poll)
 *
 * PN-031-C (شورای-ن۰۴۰): اولین Poll موفق = نقطهٔ سوختن کد راه‌اندازی بخشنده
 * (پیش از این، کد در تلاش ناموفق می‌سوخت — ریشهٔ چرخهٔ خطای ۴۰۳ مالک).
 *
 * PN-035 (شورا-ن۰۵۷ · فاز ۴+۵):
 *   · batch — تا ۱۰۰ آیتم در هر poll (کارگرهای موازی گوشی)؛ پاسخ «items» آرایه است.
 *   · سازگاری عقبه: فیلد «request» = نخستین آیتم دسته — اسکریپت‌های نسل
 *     PN-031-I (تک‌آیتمی) بدون تغییر به کار خود ادامه می‌دهند.
 *   · اولویت: آیتم‌های تعاملی (OTP=۵) مقدم بر سینک حجیم جلا می‌شوند.
 *
 * PN-041-R (شورا-ن۰۶۸ · فاز ۲·بند ۲.۲ — Long-Polling ۱۰۰ث):
 *   · سقف wait از ۲۵ث به ۱۰۰ث افزایش یافت — کاهش درخواست ۴ برابر
 *     (۳۴۵۶ → ~۸۶۰ درخواست/روز) ⇒ باتری گوشی و MIUI آرام‌تر می‌مانند.
 *   · فاصلهٔ داخلی جستجو تطبیقی: ۷۰۰ms در پنجرهٔ تعاملی ۱۵ث نخست (OTP
 *     لحظه‌ای جلا می‌شود) → ۳ث پس از آن (چرخش سبک‌تر روی SQLite محلی).
 *   · کاربرد نسل L اسکریپت گوشی (wait:100) — نسل‌های قدیمی (wait:20)
 *     بدون تغییر کار می‌کنند (سازگاری عقبه).
 *
 * قانون «صفر لاگ محتوا»: هیچ بدنه/هدری ثبت نمی‌شود — فقط شمارندهٔ lastSeen.
 */

import { NextRequest } from "next/server";
import { verifyRelayRequestAuth, claimRelayBatch, markRelayEnrollCompleted, noteRelayPollSeen, RELAY_MAX_BATCH } from "@/lib/melk-api/relay";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** PN-041-R — سقف انتظار long-poll (ثانیه) — شورا-ن۰۶۸ بند ۲.۲ */
export const POLL_MAX_WAIT_S = 100;
/** پنجرهٔ تعاملی: ۱۵ث نخست با ۷۰۰ms (جلا شدن لحظه‌ای OTP) */
const INTERACTIVE_WINDOW_MS = 15_000;
const POLL_INTERVAL_FAST_MS = 700;
const POLL_INTERVAL_SLOW_MS = 3_000;

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const auth = await verifyRelayRequestAuth("POST", "/api/mobile-relay/poll", rawBody, request.headers);
  if (!auth.ok) {
    // PN-031-E — serverTime در پاسخ رد: کلاینت (اسکریپت/اپ) آفست ساعت خود را اصلاح می‌کند
    // PN-031-G — missing: نام هدرهای احرازی نایافته (تشخیص یک‌نگاهی روی گوشی)
    return Response.json(
      { ok: false, error: auth.error, missing: auth.missing, serverTime: auth.serverTime ?? Date.now() },
      { status: auth.status, headers: { "cache-control": "no-store" } }
    );
  }

  // PN-031-C (شورای-ن۰۴۰) — نقطهٔ سوختن کد راه‌اندازی: اولین Poll موفق گوشی
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
  let batch = 1;
  try {
    const parsed = rawBody ? (JSON.parse(rawBody) as { wait?: number; batch?: number }) : {};
    if (typeof parsed.wait === "number" && Number.isFinite(parsed.wait)) {
      waitSeconds = Math.min(Math.max(parsed.wait, 0), POLL_MAX_WAIT_S);
    }
    // PN-035 (فاز ۵): اندازهٔ دسته — ۱ (نسل قدیمی) تا RELAY_MAX_BATCH (۱۰۰)
    if (typeof parsed.batch === "number" && Number.isFinite(parsed.batch)) {
      batch = Math.min(Math.max(Math.floor(parsed.batch), 1), RELAY_MAX_BATCH);
    }
  } catch {
    // بدنهٔ خام یا خالی — wait/batch پیش‌فرض
  }
  const deadline = Date.now() + waitSeconds * 1000;

  while (true) {
    const items = await claimRelayBatch(auth.device!.deviceId, batch);
    if (items.length > 0) {
      return Response.json(
        {
          ok: true,
          // PN-035 — دستهٔ کامل برای اسکریپت نسل J+؛
          // «request» = نخستین آیتم (سازگاری عقبه با اسکریپت‌های تک‌آیتمی)
          items: items.map((it) => ({
            id: it.id,
            method: it.method,
            url: it.url,
            headers: it.headers,
            body: it.body ?? "",
            sig: it.sig,
            ts: it.ts,
          })),
          request: {
            id: items[0].id,
            method: items[0].method,
            url: items[0].url,
            headers: items[0].headers,
            body: items[0].body ?? "",
            sig: items[0].sig,
            ts: items[0].ts,
          },
        },
        { status: 200, headers: { "cache-control": "no-store" } }
      );
    }
    if (Date.now() >= deadline) {
      return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
    }
    // PN-041-R — فاصلهٔ تطبیقی: پنجرهٔ تعاملی ۷۰۰ms (OTP لحظه‌ای) → سپس ۳ث
    const inInteractiveWindow = deadline - Date.now() > waitSeconds * 1000 - INTERACTIVE_WINDOW_MS;
    await new Promise((r) => setTimeout(r, inInteractiveWindow ? POLL_INTERVAL_FAST_MS : POLL_INTERVAL_SLOW_MS));
  }
}
