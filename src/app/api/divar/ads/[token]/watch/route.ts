/**
 * /api/divar/ads/[token]/watch — کلید «ارجاع به تحت نظر» (DIR-FF-WATCH-001 · دستور مالک ۱۴۰۵/۰۹/۰۳)
 * ------------------------------------------------------
 * POST (بدون بدنه)
 *  • فایل کشف‌شده به بخش «تحت نظر» ارجاع می‌شود: watchedAt ثبت می‌گردد و
 *    فایل از پنجره‌های شکار/پیگیری/بررسی خارج و فقط در «تحت نظر» نمایش داده می‌شود.
 *  • ارجاع صرفاً محلی است — بدون رلهٔ ترموکس و بدون ARM (عین رد؛ رله فقط برای ثبت آگهی —
 *    سیاست DIR-FF-RELAY-POLICY-001 مالک).
 *  • رکورد آگهی و همهٔ داده‌های آن دست‌نخورده می‌ماند؛ کلیدهای چهارگانه (پل/جزییات/رد/ثبت)
 *    در پنجرهٔ تحت نظر نیز در دسترس‌اند.
 */

import { NextRequest } from "next/server";
import { getMarketRepository } from "@/core/repositories";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { MelkApiError } from "@/lib/melk-api/types";
import { audit } from "@/lib/auth/session";

export async function POST(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  const { token } = await ctx.params;

  try {
    const market = getMarketRepository();

    // فایل باید فعال و موجود باشد (ارجاعِ دوباره یا فایل رد/ثبت‌شده معتبر نیست)
    const ad = await market.findAdByToken(token);
    if (!ad || ad.status !== "active") {
      return errorResponse(
        new MelkApiError("NOT_FOUND", "این فایل یافت نشد — ممکن است قبلاً رد یا ثبت شده باشد.", 404, false)
      );
    }

    if (ad.watchedAt) {
      // فایل قبلاً ارجاع شده — پاسخ صادقانه بدون تغییر (idempotent)
      return Response.json({
        ok: true,
        message: "این فایل از قبل در بخش «تحت نظر» است.",
        watchedAt: ad.watchedAt,
        alreadyWatched: true,
      });
    }

    const updated = await market.markAdWatched(token);
    if (!updated) {
      return errorResponse(
        new MelkApiError("NOT_FOUND", "ارجاع ناموفق بود — فایل در وضعیت فعال نیست.", 404, false)
      );
    }

    await audit("DIVAR_WATCH", guard.personnelCode, `token=${token} bucket=${ad.bucket} score=${Math.round(ad.totalScore)}`);

    return Response.json({
      ok: true,
      message: "فایل به بخش «تحت نظر» ارجاع شد — از پنجره‌های شکار/پیگیری/بررسی خارج شد و در «تحت نظر» در دسترس است.",
      watchedAt: new Date().toISOString(),
      alreadyWatched: false,
    });
  } catch {
    return errorResponse(
      new MelkApiError("UNKNOWN", "ارجاع فایل ناموفق بود — احتمالاً مشکل موقت پایگاه داده. چند لحظه بعد دوباره تلاش کنید.", 500, false)
    );
  }
}
