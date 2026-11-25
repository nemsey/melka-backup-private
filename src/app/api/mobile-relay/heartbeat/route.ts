/**
 * POST /api/mobile-relay/heartbeat — DIR-SUPER-STRUCT-001 (بخش ج · ۱ — ضربان قلب)
 * ---------------------------------------------------------------------------
 * ترموکس (watchDog) هر ۳۰ ثانیه یک پیام کوچک امضاشده می‌فرستد: «من زنده‌ام»
 * (+ وضعیت زنده بودن پروسهٔ رله). سه ضربان متوالی غایب (۹۰ث) = داشبورد
 * هشدار می‌دهد «رلهٔ ترموکس قطع شده است».
 *
 * قرارداد — عین poll/result:
 *   · احراز HMAC سه‌هدری (X-Melka-Relay-Device · X-Melka-Timestamp · X-Melka-Signature)
 *     پیام: "POST\n/api/mobile-relay/heartbeat\nsha256(body)\nts"
 *   · بدنه: {"alive": true|false, "restarts": n} — بدون هیچ محتوای دیگری
 *   · پاسخ: {ok: true} کوچک (خرج شبکه ~صفر)
 *
 * قانون «صفر لاگ محتوا»: فقط lastHeartbeatAt/lastSeenAt به‌روز می‌شوند —
 * هیچ بدنه/هدر/رازی ثبت نمی‌شود.
 *
 * مزیت جانبی: تازه‌سازی lastSeenAt یعنی پیش‌شرط صف‌گذاری armCall
 * (anyRelayDeviceOnline) حتی در سکون کامل صف برقرار می‌ماند — مرغ و تخم‌مرغ
 * برای همیشه حل (PN-031-E فاز C در سطح ضربان).
 */

import { NextRequest } from "next/server";
import { verifyRelayRequestAuth, noteRelayHeartbeat } from "@/lib/melk-api/relay";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const auth = await verifyRelayRequestAuth("POST", "/api/mobile-relay/heartbeat", rawBody, request.headers);
  if (!auth.ok) {
    return Response.json(
      { ok: false, error: auth.error, missing: auth.missing, serverTime: auth.serverTime ?? Date.now() },
      { status: auth.status, headers: { "cache-control": "no-store" } }
    );
  }
  let alive = true;
  try {
    const parsed = rawBody ? (JSON.parse(rawBody) as { alive?: unknown }) : {};
    if (typeof parsed.alive === "boolean") alive = parsed.alive;
  } catch {
    alive = true; // بدنهٔ خام — ضربان زنده فرض می‌شود (سازگاری)
  }
  await noteRelayHeartbeat(auth.device!.deviceId, alive);
  return Response.json({ ok: true }, { status: 200, headers: { "cache-control": "no-store" } });
}
