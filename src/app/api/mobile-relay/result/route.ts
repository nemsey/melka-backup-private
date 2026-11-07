/**
 * POST /api/mobile-relay/result — PN-031 (شورای-ن۰۳۷)
 * ---------------------------------------------------------------------------
 * گوشی نتیجهٔ اجرای درخواست(ها) را برمی‌گرداند:
 *   · احراز HMAC (همان قرارداد poll — path این روت)
 *   · بدنه: {"id", "httpStatus", "contentType", "bodyB64", "error?"}
 *     bodyB64 = base64 بدنهٔ پاسخ (امن در برابر هر محتوای متنی/دودویی)
 *   · فقط آیتمِ «خودِ» دستگاه در وضعیت dispatched پذیرفته می‌شود (403/409 در غیر این صورت)
 *
 * PN-035 (شورا-ن۰۵۷ · فاز ۲+۵+۶):
 *   · دسته‌ای — بدنه می‌تواند آرایهٔ نتیجه‌ها باشد: [{id,httpStatus,…}, …]
 *     (کارگرهای موازی گوشی یک POST برای کل دسته می‌فرستند؛ سربار دروازه ÷N)
 *   · سازگاری عقبه — بدنهٔ شیءِ تنها عین قبل پذیرفته می‌شود.
 *   · فشرده‌سازی — Content-Encoding: gzip روی بدنهٔ خام: امضا روی همان بایت‌های
 *     فشرده اعمال می‌شود (sha256 گريد ارسالی)؛ سرور پس از وارسی، باز می‌کند.
 *     JSON پاسخ‌های سنگین سینک (تا ۵MB) ≈ ÷۱۰ حجم سیم.
 *   · بخش‌بندی نتی‌جات — آیتمِ تازه‌منقضی‌شده که نتیجه‌اش رسیده احیا می‌شود
 *     (در completeRelayRequest) — پایان «پیامک آمد اما پاسخ برنگشت».
 *
 * قانون «صفر لاگ محتوا»: بدنهٔ پاسخ فقط در صف ذخیره می‌شود تا armCall صداکننده
 * آن را بخواند — هیچ لاگی از محتوای آن تهیه نمی‌شود.
 */

import { NextRequest } from "next/server";
import { gunzipSync } from "node:zlib";
import { verifyRelayRequestAuth, completeRelayRequest, RELAY_MAX_RESULT_BYTES } from "@/lib/melk-api/relay";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ResultPayload {
  id?: string;
  httpStatus?: number;
  contentType?: string | null;
  bodyB64?: string | null;
  error?: string | null;
}

export async function POST(request: NextRequest) {
  // PN-035 (فاز ۶) — خواندن بایت خام: بدنهٔ gzip باینری است؛ text() آن را
  // خراب می‌کند. امضا روی «همان بایت‌های سیم» اعمال/وارسی می‌شود، سپس بازکردن.
  const rawBytes = Buffer.from(await request.arrayBuffer());

  const auth = await verifyRelayRequestAuth("POST", "/api/mobile-relay/result", rawBytes, request.headers);
  if (!auth.ok) {
    // PN-031-E — serverTime در پاسخ رد (همان قرارداد poll)
    // PN-031-G — missing: نام هدرهای احرازی نایافته (تشخیص یک‌نگاهی روی گوشی)
    return Response.json(
      { ok: false, error: auth.error, missing: auth.missing, serverTime: auth.serverTime ?? Date.now() },
      { status: auth.status, headers: { "cache-control": "no-store" } }
    );
  }

  // PN-035 (فاز ۶) — بدنهٔ gzip شده؟ (امضا روی بایت‌های فشرده وارسی شد)
  let bodyText: string;
  const enc = (request.headers.get("content-encoding") ?? "").trim().toLowerCase();
  if (enc === "gzip") {
    try {
      bodyText = gunzipSync(rawBytes).toString("utf8");
    } catch {
      return Response.json({ ok: false, error: "invalid gzip body" }, { status: 400 });
    }
  } else {
    bodyText = rawBytes.toString("utf8");
  }

  let payload: ResultPayload | ResultPayload[];
  try {
    payload = JSON.parse(bodyText) as typeof payload;
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  // PN-035 (فاز ۵) — آرایهٔ نتیجه‌ها (دسته‌ای) یا شیءِ تنها (سازگاری عقبه)
  const list: ResultPayload[] = Array.isArray(payload) ? payload : [payload];
  if (list.length === 0) {
    return Response.json({ ok: false, error: "empty results" }, { status: 400 });
  }
  if (!list.every((r) => typeof r?.id === "string" && r.id.length > 0)) {
    return Response.json({ ok: false, error: "missing id" }, { status: 400 });
  }
  const ids = list.map((r) => r.id as string);

  const results: Array<{ id: string; ok: boolean; status: number; error?: string }> = [];
  let anyOk = false;
  for (let i = 0; i < list.length; i++) {
    const one = list[i];
    const id = ids[i];
    let body: string | null = null;
    if (typeof one?.bodyB64 === "string" && one.bodyB64.length > 0) {
      if (one.bodyB64.length > (RELAY_MAX_RESULT_BYTES * 4) / 3) {
        // پاسخ بیش از حد بزرگ — به‌عنوان خطا ثبت می‌شود تا صفحه‌بندی بالادست کوچک‌تر شود
        const r = await completeRelayRequest({
          id,
          deviceId: auth.device!.deviceId,
          error: "response too large (>5MB)",
        });
        results.push({ id, ok: r.ok, status: r.status, error: r.ok ? undefined : r.error });
        if (r.ok) anyOk = true;
        continue;
      }
      try {
        body = Buffer.from(one.bodyB64, "base64").toString("utf8");
      } catch {
        results.push({ id, ok: false, status: 400, error: "invalid base64" });
        continue;
      }
    }
    const r = await completeRelayRequest({
      id,
      deviceId: auth.device!.deviceId,
      httpStatus: typeof one?.httpStatus === "number" ? one.httpStatus : undefined,
      contentType: one?.contentType ?? null,
      body,
      error: one?.error ?? null,
    });
    results.push({ id, ok: r.ok, status: r.status, error: r.ok ? undefined : r.error });
    if (r.ok) anyOk = true;
  }

  // تک‌آیتم (سازگاری عقبه): پاسخ همان شکل قبلی — {ok, error?}
  if (!Array.isArray(payload)) {
    const first = results[0];
    return Response.json({ ok: first.ok, error: first.ok ? undefined : first.error }, { status: first.status, headers: { "cache-control": "no-store" } });
  }

  // دسته‌ای: 200 اگر دست‌کم یکی پذیرفته شد (بقیه با جزئیات در results)
  return Response.json(
    { ok: anyOk, accepted: results.filter((r) => r.ok).length, total: results.length, results },
    { status: anyOk ? 200 : (results[0]?.status ?? 400), headers: { "cache-control": "no-store" } }
  );
}
